use super::ids::*;
use super::protocol_helpers::*;
use super::*;

impl CodexAdapter {
    pub(super) fn encode_params(
        &self,
        engine: &AngelEngine,
        effect: &angel_engine::ProtocolEffect,
        options: &TransportOptions,
    ) -> Result<Value, angel_engine::EngineError> {
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
                insert_codex_thread_overrides(&mut params, &effect.payload.fields);
                params.insert("experimentalRawEvents".to_string(), json!(true));
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
                            .get("remoteConversationId")
                            .or_else(|| effect.payload.fields.get("threadId"))
                            .cloned()
                            .unwrap_or_default()
                    ),
                );
                if effect
                    .payload
                    .fields
                    .get("hydrate")
                    .is_some_and(|hydrate| hydrate == "false")
                {
                    params.insert("excludeTurns".to_string(), json!(true));
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
            ProtocolMethod::Codex(CodexMethod::TurnStart) => {
                let mut params = serde_json::Map::new();
                params.insert(
                    "threadId".to_string(),
                    json!(codex_thread_id(engine, effect)?),
                );
                params.insert("input".to_string(), codex_user_input(effect));
                insert_codex_overrides(&mut params, &effect.payload.fields);
                Ok(Value::Object(params))
            }
            ProtocolMethod::Codex(CodexMethod::TurnSteer) => Ok(json!({
                "threadId": codex_thread_id(engine, effect)?,
                "input": codex_user_input(effect),
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
            ProtocolMethod::Codex(CodexMethod::ThreadList) => {
                let mut params = serde_json::Map::new();
                if let Some(cwd) = effect.payload.fields.get("cwd") {
                    params.insert("cwd".to_string(), json!(cwd));
                }
                if let Some(cursor) = effect.payload.fields.get("cursor") {
                    params.insert("cursor".to_string(), json!(cursor));
                }
                Ok(Value::Object(params))
            }
            ProtocolMethod::Codex(CodexMethod::ServerRequestResponse) => {
                Err(angel_engine::EngineError::InvalidCommand {
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
        effect: &angel_engine::ProtocolEffect,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
        let conversation_id = effect.conversation_id.clone().ok_or_else(|| {
            angel_engine::EngineError::InvalidCommand {
                message: "missing conversation id for elicitation response".to_string(),
            }
        })?;
        let elicitation_id = ElicitationId::new(
            effect
                .payload
                .fields
                .get("elicitationId")
                .cloned()
                .ok_or_else(|| angel_engine::EngineError::InvalidCommand {
                    message: "missing elicitation id".to_string(),
                })?,
        );
        let conversation = engine.conversations.get(&conversation_id).ok_or_else(|| {
            angel_engine::EngineError::ConversationNotFound {
                conversation_id: conversation_id.to_string(),
            }
        })?;
        let elicitation = conversation
            .elicitations
            .get(&elicitation_id)
            .ok_or_else(|| angel_engine::EngineError::ElicitationNotFound {
                elicitation_id: elicitation_id.to_string(),
            })?;
        let remote_request_id = match &elicitation.remote_request_id {
            RemoteRequestId::JsonRpc(id) => id.clone(),
            other => {
                return Err(angel_engine::EngineError::InvalidState {
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
        let result = codex_elicitation_response(elicitation, &effect.payload.fields);
        let mut output = TransportOutput::default()
            .message(JsonRpcMessage::response(remote_request_id, result))
            .event(EngineEvent::ElicitationResolved {
                conversation_id,
                elicitation_id,
                decision: angel_engine::ElicitationDecision::Raw(decision.to_string()),
            })
            .log(TransportLogKind::Send, "answered Codex server request");
        if let Some(request_id) = &effect.request_id {
            output.completed_requests.push(request_id.clone());
        }
        Ok(output)
    }
}

fn insert_codex_overrides(
    params: &mut serde_json::Map<String, Value>,
    fields: &std::collections::BTreeMap<String, String>,
) {
    if let Some(model) = fields.get("model") {
        params.insert("model".to_string(), json!(model));
    }
    if let Some(effort) = fields.get("effort") {
        params.insert("effort".to_string(), json!(codex_reasoning_effort(effort)));
    }
    params.insert("summary".to_string(), json!("auto"));
    if let Some(policy) = fields.get("approvalPolicy") {
        params.insert("approvalPolicy".to_string(), json!(policy));
    }
    if let Some(profile) = fields.get("permissions") {
        params.insert(
            "permissions".to_string(),
            json!({
                "type": "profile",
                "id": profile,
                "modifications": null,
            }),
        );
    }
    if !fields.contains_key("permissions") {
        if let Some(policy) = fields
            .get("sandboxPolicy")
            .and_then(|policy| sandbox_policy(policy))
        {
            params.insert("sandboxPolicy".to_string(), policy);
        }
    }
    if let (Some(mode), Some(model)) = (
        fields.get("collaborationMode"),
        fields
            .get("collaborationModel")
            .or_else(|| fields.get("model")),
    ) {
        params.insert(
            "collaborationMode".to_string(),
            json!({
                "mode": mode,
                "settings": {
                    "model": model,
                    "developer_instructions": null,
                    "reasoning_effort": fields
                        .get("effort")
                        .map(|effort| codex_reasoning_effort(effort)),
                }
            }),
        );
    }
}

fn codex_reasoning_effort(effort: &str) -> &str {
    if effort == "high" { "xhigh" } else { effort }
}

fn insert_codex_thread_overrides(
    params: &mut serde_json::Map<String, Value>,
    fields: &std::collections::BTreeMap<String, String>,
) {
    if let Some(model) = fields.get("model") {
        params.insert("model".to_string(), json!(model));
    }
    if let Some(policy) = fields.get("approvalPolicy") {
        params.insert("approvalPolicy".to_string(), json!(policy));
    }
    if let Some(profile) = fields.get("permissions") {
        params.insert(
            "permissions".to_string(),
            json!({
                "type": "profile",
                "id": profile,
                "modifications": null,
            }),
        );
    }
    if !fields.contains_key("permissions")
        && let Some(policy) = fields.get("sandboxPolicy")
    {
        params.insert("sandbox".to_string(), json!(policy));
    }
}

fn sandbox_policy(policy: &str) -> Option<Value> {
    match policy {
        "read-only" | "readOnly" => Some(json!({ "type": "readOnly" })),
        "workspace-write" | "workspaceWrite" => Some(json!({ "type": "workspaceWrite" })),
        "danger-full-access" | "dangerFullAccess" | "full-access" => {
            Some(json!({ "type": "dangerFullAccess" }))
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn thread_list_encodes_common_discovery_params() {
        let adapter = CodexAdapter::app_server();
        let engine = AngelEngine::new(
            angel_engine::ProtocolFlavor::CodexAppServer,
            adapter.capabilities(),
        );
        let effect = angel_engine::ProtocolEffect::new(
            angel_engine::ProtocolFlavor::CodexAppServer,
            ProtocolMethod::Codex(CodexMethod::ThreadList),
        )
        .field("cwd", "/tmp/project")
        .field("cursor", "opaque");

        let params = adapter
            .encode_params(&engine, &effect, &TransportOptions::default())
            .expect("thread list params");

        assert_eq!(params, json!({"cwd": "/tmp/project", "cursor": "opaque"}));
    }

    #[test]
    fn thread_start_enables_raw_response_events() {
        let adapter = CodexAdapter::app_server();
        let engine = AngelEngine::new(
            angel_engine::ProtocolFlavor::CodexAppServer,
            adapter.capabilities(),
        );
        let effect = angel_engine::ProtocolEffect::new(
            angel_engine::ProtocolFlavor::CodexAppServer,
            ProtocolMethod::Codex(CodexMethod::ThreadStart),
        )
        .field("cwd", "/tmp/project");

        let params = adapter
            .encode_params(&engine, &effect, &TransportOptions::default())
            .expect("thread start params");

        assert_eq!(
            params,
            json!({
                "cwd": "/tmp/project",
                "experimentalRawEvents": true,
                "persistExtendedHistory": true
            })
        );
    }

    #[test]
    fn thread_resume_encodes_common_remote_conversation_id() {
        let adapter = CodexAdapter::app_server();
        let engine = AngelEngine::new(
            angel_engine::ProtocolFlavor::CodexAppServer,
            adapter.capabilities(),
        );
        let effect = angel_engine::ProtocolEffect::new(
            angel_engine::ProtocolFlavor::CodexAppServer,
            ProtocolMethod::Codex(CodexMethod::ThreadResume),
        )
        .field("remoteConversationId", "thread")
        .field("hydrate", "false");

        let params = adapter
            .encode_params(&engine, &effect, &TransportOptions::default())
            .expect("thread resume params");

        assert_eq!(
            params,
            json!({
                "threadId": "thread",
                "excludeTurns": true,
                "persistExtendedHistory": true
            })
        );
    }

    #[test]
    fn turn_start_encodes_structured_user_input_as_codex_dto() {
        let adapter = CodexAdapter::app_server();
        let mut engine = AngelEngine::with_available_runtime(
            angel_engine::ProtocolFlavor::CodexAppServer,
            angel_engine::RuntimeCapabilities::new("test"),
            adapter.capabilities(),
        );
        let conversation_id = ConversationId::new("conv");
        engine
            .apply_event(EngineEvent::ConversationProvisionStarted {
                id: conversation_id.clone(),
                remote: RemoteConversationId::Known("thread".to_string()),
                op: angel_engine::ProvisionOp::New,
                capabilities: adapter.capabilities(),
            })
            .expect("conversation provision");
        engine
            .apply_event(EngineEvent::ConversationReady {
                id: conversation_id.clone(),
                remote: Some(RemoteConversationId::Known("thread".to_string())),
                context: ContextPatch::empty(),
                capabilities: None,
            })
            .expect("conversation ready");
        let plan = engine
            .plan_command(angel_engine::EngineCommand::StartTurn {
                conversation_id,
                input: vec![
                    angel_engine::UserInput::text("describe this"),
                    angel_engine::UserInput::image(
                        "ZmFrZQ==",
                        "image/png",
                        Some("shot.png".to_string()),
                    ),
                    angel_engine::UserInput::resource_link(
                        "Project Notes.pdf",
                        "file:///repo/Project%20Notes.pdf",
                    ),
                    angel_engine::UserInput {
                        content: "file:///repo/shot.png".to_string(),
                        kind: angel_engine::UserInputKind::ResourceLink {
                            name: "shot.png".to_string(),
                            uri: "file:///repo/shot.png".to_string(),
                            mime_type: Some("image/png".to_string()),
                            title: None,
                            description: None,
                        },
                    },
                    angel_engine::UserInput::embedded_text_resource(
                        "attachment://notes.txt",
                        "hello from a file",
                        Some("text/plain".to_string()),
                    ),
                    angel_engine::UserInput::embedded_blob_resource(
                        "attachment://archive.zip",
                        "UEsDBAo=",
                        Some("application/zip".to_string()),
                        Some("archive.zip".to_string()),
                    ),
                ],
                overrides: angel_engine::TurnOverrides::default(),
            })
            .expect("start turn");

        let params = adapter
            .encode_params(&engine, &plan.effects[0], &TransportOptions::default())
            .expect("turn start params");

        assert_eq!(params["threadId"], json!("thread"));
        assert_eq!(
            params["input"],
            json!([
                {
                    "type": "text",
                    "text": "\n# Files mentioned by the user:\n\n## Project Notes.pdf: /repo/Project Notes.pdf\n\n## My request for Codex:\ndescribe this\n",
                    "text_elements": []
                },
                {"type": "image", "url": "data:image/png;base64,ZmFrZQ=="},
                {"type": "localImage", "path": "/repo/shot.png"},
                {
                    "type": "text",
                    "text": "Attached text resource: attachment://notes.txt\nMIME type: text/plain\n\nhello from a file",
                    "text_elements": []
                },
                {
                    "type": "text",
                    "text": "Attached file: archive.zip\nURI: attachment://archive.zip\nMIME type: application/zip\nEncoding: base64\n\nUEsDBAo=",
                    "text_elements": []
                }
            ])
        );
    }
}
