use super::ids::*;
use super::protocol_helpers::*;
use super::*;

impl CodexAdapter {
    pub(super) fn encode_params(
        &self,
        engine: &AngelEngine,
        effect: &crate::ProtocolEffect,
        options: &TransportOptions,
    ) -> Result<Value, crate::EngineError> {
        match &effect.method {
            ProtocolMethod::Codex(CodexMethod::Initialize) => Ok(json!({
                "clientInfo": client_info_json(&options.client_info),
                "capabilities": {
                    "experimentalApi": options.experimental_api,
                },
            })),
            ProtocolMethod::Codex(CodexMethod::ThreadStart) => {
                let mut params = serde_json::Map::new();
                if let Some(cwd) = effect.payload.fields.get("cwd") {
                    params.insert("cwd".to_string(), json!(cwd));
                }
                if let Some(service_name) = effect.payload.fields.get("serviceName") {
                    params.insert("serviceName".to_string(), json!(service_name));
                }
                if effect.payload.fields.get("ephemeral").is_some() {
                    params.insert("ephemeral".to_string(), json!(true));
                }
                params.insert("experimentalRawEvents".to_string(), json!(false));
                params.insert("persistExtendedHistory".to_string(), json!(true));
                Ok(Value::Object(params))
            }
            ProtocolMethod::Codex(CodexMethod::ThreadResume) => {
                let mut params = serde_json::Map::new();
                params.insert(
                    "threadId".to_string(),
                    json!(
                        effect
                            .payload
                            .fields
                            .get("threadId")
                            .cloned()
                            .unwrap_or_default()
                    ),
                );
                if let Some(path) = effect.payload.fields.get("path") {
                    params.insert("path".to_string(), json!(path));
                }
                params.insert("persistExtendedHistory".to_string(), json!(true));
                Ok(Value::Object(params))
            }
            ProtocolMethod::Codex(CodexMethod::ThreadFork) => Ok(json!({
                "threadId": effect.payload.fields.get("sourceConversationId").cloned().unwrap_or_default(),
            })),
            ProtocolMethod::Codex(CodexMethod::ThreadArchive)
            | ProtocolMethod::Codex(CodexMethod::ThreadUnarchive)
            | ProtocolMethod::Codex(CodexMethod::ThreadUnsubscribe)
            | ProtocolMethod::Codex(CodexMethod::ThreadCompactStart) => Ok(json!({
                "threadId": codex_thread_id(engine, effect)?,
            })),
            ProtocolMethod::Codex(CodexMethod::ThreadRollback) => Ok(json!({
                "threadId": codex_thread_id(engine, effect)?,
                "numTurns": effect.payload.fields.get("numTurns").and_then(|value| value.parse::<usize>().ok()).unwrap_or(1),
            })),
            ProtocolMethod::Codex(CodexMethod::ThreadInjectItems) => Ok(json!({
                "threadId": codex_thread_id(engine, effect)?,
                "items": [],
            })),
            ProtocolMethod::Codex(CodexMethod::TurnStart) => Ok(json!({
                "threadId": codex_thread_id(engine, effect)?,
                "input": text_input(effect.payload.fields.get("input").cloned().unwrap_or_default()),
            })),
            ProtocolMethod::Codex(CodexMethod::TurnSteer) => Ok(json!({
                "threadId": codex_thread_id(engine, effect)?,
                "input": text_input(effect.payload.fields.get("input").cloned().unwrap_or_default()),
                "expectedTurnId": codex_turn_id(engine, effect)?,
            })),
            ProtocolMethod::Codex(CodexMethod::TurnInterrupt) => Ok(json!({
                "threadId": codex_thread_id(engine, effect)?,
                "turnId": codex_turn_id(engine, effect)?,
            })),
            ProtocolMethod::Codex(CodexMethod::ThreadShellCommand) => Ok(json!({
                "threadId": codex_thread_id(engine, effect)?,
                "command": effect.payload.fields.get("command").cloned().unwrap_or_default(),
            })),
            ProtocolMethod::Codex(CodexMethod::ThreadGoalSet) => Ok(json!({
                "threadId": codex_thread_id(engine, effect)?,
            })),
            ProtocolMethod::Codex(CodexMethod::ThreadGoalClear)
            | ProtocolMethod::Codex(CodexMethod::ThreadMemoryModeSet) => Ok(json!({
                "threadId": codex_thread_id(engine, effect)?,
            })),
            ProtocolMethod::Codex(CodexMethod::ConfigWrite) => Ok(json!({})),
            ProtocolMethod::Codex(CodexMethod::ThreadList) => Ok(json!({})),
            ProtocolMethod::Codex(CodexMethod::Initialized) => Ok(Value::Null),
            ProtocolMethod::Codex(CodexMethod::ServerRequestResponse) => {
                Err(crate::EngineError::InvalidCommand {
                    message:
                        "server request responses are encoded by encode_server_request_response"
                            .to_string(),
                })
            }
            _ => Ok(Value::Object(
                effect
                    .payload
                    .fields
                    .iter()
                    .map(|(key, value)| (key.clone(), json!(value)))
                    .collect(),
            )),
        }
    }

    pub(super) fn encode_server_request_response(
        &self,
        engine: &AngelEngine,
        effect: &crate::ProtocolEffect,
    ) -> Result<TransportOutput, crate::EngineError> {
        let conversation_id =
            effect
                .conversation_id
                .clone()
                .ok_or_else(|| crate::EngineError::InvalidCommand {
                    message: "missing conversation id for elicitation response".to_string(),
                })?;
        let elicitation_id = ElicitationId::new(
            effect
                .payload
                .fields
                .get("elicitationId")
                .cloned()
                .ok_or_else(|| crate::EngineError::InvalidCommand {
                    message: "missing elicitation id".to_string(),
                })?,
        );
        let conversation = engine.conversations.get(&conversation_id).ok_or_else(|| {
            crate::EngineError::ConversationNotFound {
                conversation_id: conversation_id.to_string(),
            }
        })?;
        let elicitation = conversation
            .elicitations
            .get(&elicitation_id)
            .ok_or_else(|| crate::EngineError::ElicitationNotFound {
                elicitation_id: elicitation_id.to_string(),
            })?;
        let remote_request_id = match &elicitation.remote_request_id {
            RemoteRequestId::Codex(id) => id.clone(),
            other => {
                return Err(crate::EngineError::InvalidState {
                    expected: "Codex server request id".to_string(),
                    actual: format!("{other:?}"),
                });
            }
        };
        let decision = effect
            .payload
            .fields
            .get("decision")
            .map(String::as_str)
            .unwrap_or("Cancel");
        let result = codex_elicitation_response(elicitation.kind.clone(), decision);
        let mut output = TransportOutput::default()
            .message(JsonRpcMessage::response(remote_request_id, result))
            .event(EngineEvent::ElicitationResolved {
                conversation_id,
                elicitation_id,
                decision: crate::ElicitationDecision::Raw(decision.to_string()),
            })
            .log(TransportLogKind::Send, "answered Codex server request");
        if let Some(request_id) = &effect.request_id {
            output.completed_requests.push(request_id.clone());
        }
        Ok(output)
    }
}
