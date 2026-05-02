use super::helpers::*;
use super::*;

impl AcpAdapter {
    pub(super) fn decode_response(
        &self,
        engine: &AngelEngine,
        id: &JsonRpcRequestId,
        result: &Value,
    ) -> Result<TransportOutput, crate::EngineError> {
        let Some(pending) = engine.pending.requests.get(id) else {
            return Ok(TransportOutput::default().log(
                TransportLogKind::Receive,
                format!("response {id} with no pending request"),
            ));
        };
        let mut output = TransportOutput::default().completed(id.clone());
        match pending {
            PendingRequest::Initialize => {
                let auth_methods = result
                    .get("authMethods")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                let runtime_authentication = &self.capabilities.runtime.authentication;
                if auth_methods.is_empty() || !runtime_authentication.is_supported() {
                    let authentication = if runtime_authentication.is_supported() {
                        crate::CapabilitySupport::Unknown
                    } else {
                        runtime_authentication.clone()
                    };
                    output = output
                        .event(EngineEvent::RuntimeNegotiated {
                            capabilities: crate::RuntimeCapabilities {
                                name: "acp".to_string(),
                                version: result.get("protocolVersion").map(Value::to_string),
                                discovery: crate::CapabilitySupport::Supported,
                                authentication,
                            },
                        })
                        .log(TransportLogKind::State, "ACP runtime initialized");
                } else {
                    output = output.event(EngineEvent::RuntimeAuthRequired {
                        methods: auth_methods
                            .iter()
                            .filter_map(|method| {
                                let id = method.get("id").and_then(Value::as_str)?;
                                Some(crate::AuthMethod {
                                    id: crate::AuthMethodId::new(id.to_string()),
                                    label: method
                                        .get("name")
                                        .or_else(|| method.get("label"))
                                        .and_then(Value::as_str)
                                        .unwrap_or(id)
                                        .to_string(),
                                })
                            })
                            .collect(),
                    });
                }
            }
            PendingRequest::StartConversation { conversation_id }
            | PendingRequest::ResumeConversation { conversation_id } => {
                let session_id =
                    result
                        .get("sessionId")
                        .and_then(Value::as_str)
                        .ok_or_else(|| crate::EngineError::InvalidCommand {
                            message: "ACP session response missing sessionId".to_string(),
                        })?;
                output = output
                    .event(EngineEvent::ConversationReady {
                        id: conversation_id.clone(),
                        remote: Some(RemoteConversationId::AcpSession(session_id.to_string())),
                        context: ContextPatch::empty(),
                        capabilities: Some(self.capabilities()),
                    })
                    .log(
                        TransportLogKind::State,
                        format!("session {session_id} ready"),
                    );
                let config_options = session_config_options(result);
                if !config_options.is_empty() {
                    output = output.event(EngineEvent::SessionConfigOptionsUpdated {
                        conversation_id: conversation_id.clone(),
                        options: config_options,
                    });
                }
                if let Some(modes) = session_mode_state(result) {
                    output = output.event(EngineEvent::SessionModesUpdated {
                        conversation_id: conversation_id.clone(),
                        modes,
                    });
                }
                if let Some(models) = session_model_state(result) {
                    output = output.event(EngineEvent::SessionModelsUpdated {
                        conversation_id: conversation_id.clone(),
                        models,
                    });
                }
            }
            PendingRequest::StartTurn {
                conversation_id,
                turn_id,
            } => {
                let reason = result
                    .get("stopReason")
                    .and_then(Value::as_str)
                    .map(acp_stop_reason)
                    .unwrap_or(AcpStopReason::EndTurn);
                output = output
                    .event(self.stop_reason_event(conversation_id.clone(), turn_id.clone(), reason))
                    .log(
                        TransportLogKind::State,
                        format!("prompt completed: {reason:?}"),
                    );
            }
            PendingRequest::CancelTurn { .. } => {
                output = output.log(TransportLogKind::State, "cancel accepted");
            }
            PendingRequest::Authenticate => {
                output = output
                    .event(EngineEvent::RuntimeNegotiated {
                        capabilities: crate::RuntimeCapabilities {
                            name: "acp".to_string(),
                            version: result.get("protocolVersion").map(Value::to_string),
                            discovery: crate::CapabilitySupport::Supported,
                            authentication: crate::CapabilitySupport::Supported,
                        },
                    })
                    .log(TransportLogKind::State, "ACP authentication accepted");
            }
            PendingRequest::ResolveElicitation { .. } => {
                output = output.log(TransportLogKind::State, "permission response accepted");
            }
            PendingRequest::UpdateContext {
                conversation_id,
                patch,
            } => {
                let config_options = session_config_options(result);
                if !config_options.is_empty() {
                    output = output.event(EngineEvent::SessionConfigOptionsUpdated {
                        conversation_id: conversation_id.clone(),
                        options: config_options,
                    });
                } else {
                    output = output.event(EngineEvent::ContextUpdated {
                        conversation_id: conversation_id.clone(),
                        patch: patch.clone(),
                    });
                }
                output = output.log(TransportLogKind::Receive, format!("response {id}"));
            }
            PendingRequest::DiscoverConversations
            | PendingRequest::ForkConversation { .. }
            | PendingRequest::SteerTurn { .. }
            | PendingRequest::HistoryMutation { .. }
            | PendingRequest::RunShellCommand { .. } => {
                output = output.log(TransportLogKind::Receive, format!("response {id}"));
            }
        }
        Ok(output)
    }

    pub(super) fn decode_error(
        &self,
        engine: &AngelEngine,
        id: Option<&JsonRpcRequestId>,
        code: i64,
        message: &str,
    ) -> Result<TransportOutput, crate::EngineError> {
        let mut output = TransportOutput::default().log(
            TransportLogKind::Error,
            format!("ACP error {code}: {message}"),
        );
        if let Some(id) = id {
            output.completed_requests.push(id.clone());
            if let Some(PendingRequest::StartTurn {
                conversation_id,
                turn_id,
            }) = engine.pending.requests.get(id)
            {
                output.events.push(EngineEvent::TurnTerminal {
                    conversation_id: conversation_id.clone(),
                    turn_id: turn_id.clone(),
                    outcome: TurnOutcome::Failed(ErrorInfo::new(
                        format!("acp.rpc.{code}"),
                        message.to_string(),
                    )),
                });
            }
        }
        Ok(output)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initialize_ignores_auth_methods_when_authentication_is_unsupported() {
        let adapter = AcpAdapter::without_authentication();
        let mut engine = AngelEngine::new(crate::ProtocolFlavor::Acp, adapter.capabilities());
        let request_id = engine
            .plan_command(crate::EngineCommand::Initialize)
            .expect("initialize plan")
            .request_id
            .expect("request id");

        let output = adapter
            .decode_response(
                &engine,
                &request_id,
                &json!({
                    "protocolVersion": 1,
                    "authMethods": [
                        {
                            "id": "opencode-login",
                            "name": "Login with opencode"
                        }
                    ]
                }),
            )
            .expect("initialize response");

        assert!(matches!(
            output.events.as_slice(),
            [EngineEvent::RuntimeNegotiated { capabilities }]
                if capabilities.authentication == crate::CapabilitySupport::Unsupported
        ));
    }
}
