use super::helpers::*;
use super::*;

impl AcpAdapter {
    pub(super) fn encode_params(
        &self,
        engine: &AngelEngine,
        effect: &crate::ProtocolEffect,
        options: &TransportOptions,
    ) -> Result<Value, crate::EngineError> {
        match &effect.method {
            ProtocolMethod::Acp(AcpMethod::Initialize) => {
                let mut client_capabilities = serde_json::Map::new();
                if self.capabilities.runtime.authentication.is_supported() {
                    client_capabilities.insert(
                        "auth".to_string(),
                        json!({
                            "terminal": true,
                        }),
                    );
                }
                if options.experimental_api {
                    client_capabilities.insert(
                        "elicitation".to_string(),
                        json!({
                            "form": {},
                            "url": {},
                        }),
                    );
                }
                Ok(json!({
                    "protocolVersion": 1,
                    "clientCapabilities": client_capabilities,
                    "clientInfo": client_info_json(&options.client_info),
                }))
            }
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
                "configId": effect.payload.fields.get("configId").cloned().unwrap_or_default(),
                "value": effect.payload.fields.get("value").cloned().unwrap_or_default(),
            })),
            ProtocolMethod::Acp(AcpMethod::SetSessionMode) => Ok(json!({
                "sessionId": acp_session_id(engine, effect)?,
                "modeId": effect.payload.fields.get("modeId").cloned().unwrap_or_default(),
            })),
            ProtocolMethod::Acp(AcpMethod::SetSessionModel) => Ok(json!({
                "sessionId": acp_session_id(engine, effect)?,
                "modelId": effect.payload.fields.get("modelId").cloned().unwrap_or_default(),
            })),
            ProtocolMethod::Acp(AcpMethod::RequestPermissionResponse) => {
                Err(crate::EngineError::InvalidCommand {
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
        effect: &crate::ProtocolEffect,
    ) -> Result<TransportOutput, crate::EngineError> {
        let conversation_id =
            effect
                .conversation_id
                .clone()
                .ok_or_else(|| crate::EngineError::InvalidCommand {
                    message: "missing conversation id for permission response".to_string(),
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
            RemoteRequestId::Acp(id) => id.clone(),
            other => {
                return Err(crate::EngineError::InvalidState {
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
        if matches!(
            elicitation.kind,
            crate::ElicitationKind::UserInput | crate::ElicitationKind::ExternalFlow
        ) {
            let result = acp_elicitation_response(decision, &effect.payload.fields);
            let mut output = TransportOutput::default()
                .message(JsonRpcMessage::response(remote_request_id, result))
                .event(EngineEvent::ElicitationResolved {
                    conversation_id,
                    elicitation_id,
                    decision: crate::ElicitationDecision::Raw(decision.to_string()),
                })
                .log(TransportLogKind::Send, "answered ACP elicitation request");
            if let Some(request_id) = &effect.request_id {
                output.completed_requests.push(request_id.clone());
            }
            return Ok(output);
        }
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
                decision: crate::ElicitationDecision::Raw(decision.to_string()),
            })
            .log(TransportLogKind::Send, "answered ACP permission request");
        if let Some(request_id) = &effect.request_id {
            output.completed_requests.push(request_id.clone());
        }
        Ok(output)
    }
}

fn acp_elicitation_response(
    decision: &str,
    fields: &std::collections::BTreeMap<String, String>,
) -> Value {
    match decision {
        "Deny" => json!({"action": "decline"}),
        "Cancel" => json!({"action": "cancel"}),
        _ => json!({
            "action": "accept",
            "content": acp_elicitation_answer_content(fields),
        }),
    }
}

fn acp_elicitation_answer_content(fields: &std::collections::BTreeMap<String, String>) -> Value {
    let answer_count = fields
        .get("answerCount")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(0);
    let mut grouped: std::collections::BTreeMap<String, Vec<String>> =
        std::collections::BTreeMap::new();
    for index in 0..answer_count {
        let Some(id) = fields.get(&format!("answer.{index}.id")) else {
            continue;
        };
        grouped.entry(id.clone()).or_default().push(
            fields
                .get(&format!("answer.{index}.value"))
                .cloned()
                .unwrap_or_default(),
        );
    }
    Value::Object(
        grouped
            .into_iter()
            .map(|(id, values)| {
                let value = if values.len() == 1 {
                    json!(values[0])
                } else {
                    json!(values)
                };
                (id, value)
            })
            .collect(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initialize_omits_auth_client_capability_when_authentication_is_unsupported() {
        let adapter = AcpAdapter::without_authentication();
        let engine = AngelEngine::new(crate::ProtocolFlavor::Acp, adapter.capabilities());
        let options = TransportOptions {
            experimental_api: false,
            ..TransportOptions::default()
        };
        let effect = crate::ProtocolEffect::new(
            crate::ProtocolFlavor::Acp,
            ProtocolMethod::Acp(AcpMethod::Initialize),
        );

        let params = adapter
            .encode_params(&engine, &effect, &options)
            .expect("initialize params");

        assert_eq!(params["clientCapabilities"], json!({}));
    }

    #[test]
    fn initialize_advertises_experimental_elicitation_capability() {
        let adapter = AcpAdapter::without_authentication();
        let engine = AngelEngine::new(crate::ProtocolFlavor::Acp, adapter.capabilities());
        let effect = crate::ProtocolEffect::new(
            crate::ProtocolFlavor::Acp,
            ProtocolMethod::Acp(AcpMethod::Initialize),
        );

        let params = adapter
            .encode_params(&engine, &effect, &TransportOptions::default())
            .expect("initialize params");

        assert_eq!(
            params["clientCapabilities"]["elicitation"],
            json!({"form": {}, "url": {}})
        );
    }

    #[test]
    fn initialize_uses_stable_acp_version_and_only_advertised_host_capabilities() {
        let adapter = AcpAdapter::standard();
        let engine = AngelEngine::new(crate::ProtocolFlavor::Acp, adapter.capabilities());
        let effect = crate::ProtocolEffect::new(
            crate::ProtocolFlavor::Acp,
            ProtocolMethod::Acp(AcpMethod::Initialize),
        );

        let params = adapter
            .encode_params(&engine, &effect, &TransportOptions::default())
            .expect("initialize params");

        assert_eq!(params["protocolVersion"], json!(1));
        assert!(params["clientCapabilities"].get("auth").is_some());
        assert!(params["clientCapabilities"].get("elicitation").is_some());
        assert!(params["clientCapabilities"].get("fs").is_none());
        assert!(params["clientCapabilities"].get("terminal").is_none());
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
