use super::helpers::*;
use super::*;

impl AcpAdapter {
    pub(super) fn encode_params(
        &self,
        engine: &AngelEngine,
        effect: &crate::angel_engine::ProtocolEffect,
        options: &TransportOptions,
    ) -> Result<Value, crate::angel_engine::EngineError> {
        match &effect.method {
            ProtocolMethod::Acp(AcpMethod::Initialize) => Ok(json!({
                "protocolVersion": 2,
                "clientCapabilities": {
                    "auth": {
                        "terminal": true,
                    },
                },
                "clientInfo": client_info_json(&options.client_info),
            })),
            ProtocolMethod::Acp(AcpMethod::Authenticate) => Ok(json!({
                "methodId": effect
                    .payload
                    .fields
                    .get("methodId")
                    .or_else(|| effect.payload.fields.get("method"))
                    .cloned()
                    .unwrap_or_default(),
            })),
            ProtocolMethod::Acp(AcpMethod::SessionNew) => Ok(json!({
                "cwd": effect.payload.fields.get("cwd").cloned().unwrap_or_else(|| {
                    std::env::current_dir()
                        .map(|path| path.display().to_string())
                        .unwrap_or_else(|_| ".".to_string())
                }),
                "mcpServers": [],
            })),
            ProtocolMethod::Acp(AcpMethod::SessionLoad)
            | ProtocolMethod::Acp(AcpMethod::SessionResume) => Ok(json!({
                "sessionId": effect.payload.fields.get("sessionId").cloned().unwrap_or_default(),
            })),
            ProtocolMethod::Acp(AcpMethod::SessionPrompt) => Ok(json!({
                "sessionId": acp_session_id(engine, effect)?,
                "prompt": [
                    {
                        "type": "text",
                        "text": effect.payload.fields.get("input").cloned().unwrap_or_default(),
                    }
                ],
            })),
            ProtocolMethod::Acp(AcpMethod::SessionCancel)
            | ProtocolMethod::Acp(AcpMethod::SessionClose) => Ok(json!({
                "sessionId": acp_session_id(engine, effect)?,
            })),
            ProtocolMethod::Acp(AcpMethod::SessionList) => Ok(json!({})),
            ProtocolMethod::Acp(AcpMethod::SetSessionConfigOption) => Ok(json!({
                "sessionId": acp_session_id(engine, effect)?,
            })),
            ProtocolMethod::Acp(AcpMethod::SetSessionMode) => Ok(json!({
                "sessionId": acp_session_id(engine, effect)?,
            })),
            ProtocolMethod::Acp(AcpMethod::RequestPermissionResponse) => {
                Err(crate::angel_engine::EngineError::InvalidCommand {
                    message: "permission responses are encoded by encode_permission_response"
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

    pub(super) fn encode_permission_response(
        &self,
        engine: &AngelEngine,
        effect: &crate::angel_engine::ProtocolEffect,
    ) -> Result<TransportOutput, crate::angel_engine::EngineError> {
        let conversation_id = effect.conversation_id.clone().ok_or_else(|| {
            crate::angel_engine::EngineError::InvalidCommand {
                message: "missing conversation id for permission response".to_string(),
            }
        })?;
        let elicitation_id = ElicitationId::new(
            effect
                .payload
                .fields
                .get("elicitationId")
                .cloned()
                .ok_or_else(|| crate::angel_engine::EngineError::InvalidCommand {
                    message: "missing elicitation id".to_string(),
                })?,
        );
        let conversation = engine.conversations.get(&conversation_id).ok_or_else(|| {
            crate::angel_engine::EngineError::ConversationNotFound {
                conversation_id: conversation_id.to_string(),
            }
        })?;
        let elicitation = conversation
            .elicitations
            .get(&elicitation_id)
            .ok_or_else(|| crate::angel_engine::EngineError::ElicitationNotFound {
                elicitation_id: elicitation_id.to_string(),
            })?;
        let remote_request_id = match &elicitation.remote_request_id {
            RemoteRequestId::Acp(id) => id.clone(),
            other => {
                return Err(crate::angel_engine::EngineError::InvalidState {
                    expected: "ACP permission request id".to_string(),
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
        let selected_option = select_permission_option(&elicitation.options.choices, decision);
        let result = if let Some(option_id) = selected_option {
            json!({"outcome": {"outcome": "selected", "optionId": option_id}})
        } else {
            json!({"outcome": {"outcome": "cancelled"}})
        };
        let mut output = TransportOutput::default()
            .message(JsonRpcMessage::response(remote_request_id, result))
            .event(EngineEvent::ElicitationResolved {
                conversation_id,
                elicitation_id,
                decision: crate::angel_engine::ElicitationDecision::Raw(decision.to_string()),
            })
            .log(TransportLogKind::Send, "answered ACP permission request");
        if let Some(request_id) = &effect.request_id {
            output.completed_requests.push(request_id.clone());
        }
        Ok(output)
    }
}

fn select_permission_option(choices: &[String], decision: &str) -> Option<String> {
    let desired = match decision {
        "AllowForSession" => choices
            .iter()
            .find(|choice| {
                let choice = choice.to_ascii_lowercase();
                choice.contains("session") || choice.contains("always")
            })
            .or_else(|| find_allow_choice(choices)),
        "Allow" => find_allow_choice(choices),
        "Deny" => choices.iter().find(|choice| {
            let choice = choice.to_ascii_lowercase();
            choice.contains("deny") || choice.contains("reject")
        }),
        _ => None,
    };
    desired.cloned()
}

fn find_allow_choice(choices: &[String]) -> Option<&String> {
    choices.iter().find(|choice| {
        let choice = choice.to_ascii_lowercase();
        (choice.contains("allow") || choice.contains("approve"))
            && !choice.contains("session")
            && !choice.contains("always")
    })
}
