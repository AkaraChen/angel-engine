use super::helpers::*;
use super::*;

impl AcpAdapter {
    pub(super) fn decode_response(
        &self,
        engine: &AngelEngine,
        id: &JsonRpcRequestId,
        result: &Value,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
        let Some(pending) = engine.pending.requests.get(id) else {
            return Ok(TransportOutput::default().log(
                TransportLogKind::Receive,
                format!("response {id} with no pending request"),
            ));
        };
        let mut output = TransportOutput::default().completed(id.clone());
        match pending {
            PendingRequest::Initialize => {
                if !acp_protocol_version_is_supported(result) {
                    return Ok(output
                        .event(EngineEvent::RuntimeFaulted {
                            error: ErrorInfo::new(
                                "acp.unsupported_protocol_version",
                                format!(
                                    "unsupported ACP protocol version {}",
                                    result
                                        .get("protocolVersion")
                                        .map(acp_value_label)
                                        .unwrap_or_else(|| "missing".to_string())
                                ),
                            ),
                        })
                        .log(TransportLogKind::Error, "unsupported ACP protocol version"));
                }
                let auth_methods = result
                    .get("authMethods")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                let runtime_authentication = &self.capabilities.runtime.authentication;
                if auth_methods.is_empty() || !runtime_authentication.is_supported() {
                    let authentication = if runtime_authentication.is_supported() {
                        angel_engine::CapabilitySupport::Unknown
                    } else {
                        runtime_authentication.clone()
                    };
                    output = output
                        .event(EngineEvent::RuntimeNegotiated {
                            capabilities: acp_runtime_capabilities(result, authentication),
                            conversation_capabilities: Some(acp_conversation_capabilities(
                                result,
                                self.capabilities(),
                            )),
                        })
                        .log(TransportLogKind::State, "ACP runtime initialized");
                } else {
                    output = output.event(EngineEvent::RuntimeAuthRequired {
                        methods: auth_methods
                            .iter()
                            .filter_map(|method| {
                                let id = method.get("id").and_then(Value::as_str)?;
                                Some(angel_engine::AuthMethod {
                                    id: angel_engine::AuthMethodId::new(id.to_string()),
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
            PendingRequest::StartConversation { conversation_id } => {
                let session_id =
                    result
                        .get("sessionId")
                        .and_then(Value::as_str)
                        .ok_or_else(|| angel_engine::EngineError::InvalidCommand {
                            message: "ACP session response missing sessionId".to_string(),
                        })?;
                append_session_ready_events(
                    &mut output,
                    engine,
                    conversation_id,
                    Some(session_id.to_string()),
                    result,
                );
            }
            PendingRequest::ResumeConversation {
                conversation_id,
                hydrate,
            } => {
                append_session_ready_events(
                    &mut output,
                    engine,
                    conversation_id,
                    result
                        .get("sessionId")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                    result,
                );
                output = output.log(
                    TransportLogKind::State,
                    if *hydrate {
                        "session load complete"
                    } else {
                        "session resume complete"
                    },
                );
            }
            PendingRequest::ForkConversation { conversation_id } => {
                let session_id =
                    result
                        .get("sessionId")
                        .and_then(Value::as_str)
                        .ok_or_else(|| angel_engine::EngineError::InvalidCommand {
                            message: "ACP fork response missing sessionId".to_string(),
                        })?;
                append_session_ready_events(
                    &mut output,
                    engine,
                    conversation_id,
                    Some(session_id.to_string()),
                    result,
                );
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
                        capabilities: acp_runtime_capabilities(
                            result,
                            angel_engine::CapabilitySupport::Supported,
                        ),
                        conversation_capabilities: Some(acp_conversation_capabilities(
                            result,
                            self.capabilities(),
                        )),
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
            PendingRequest::DiscoverConversations { params } => {
                for session in result
                    .get("sessions")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                {
                    let Some(session_id) = session.get("sessionId").and_then(Value::as_str) else {
                        output = output.log(
                            TransportLogKind::Warning,
                            "ignoring ACP session/list entry without sessionId",
                        );
                        continue;
                    };
                    let remote = RemoteConversationId::Known(session_id.to_string());
                    output = output.event(EngineEvent::ConversationDiscovered {
                        id: discovered_conversation_id(
                            engine,
                            &remote,
                            format!("acp-session-{session_id}"),
                        ),
                        remote,
                        context: acp_session_info_context(session),
                        capabilities: engine.default_capabilities.clone(),
                    });
                }
                output = output.event(EngineEvent::ConversationDiscoveryPage {
                    cursor: params.cursor.clone(),
                    next_cursor: result
                        .get("nextCursor")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                });
                output = output.log(TransportLogKind::Receive, format!("response {id}"));
            }
            PendingRequest::SteerTurn { .. }
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
    ) -> Result<TransportOutput, angel_engine::EngineError> {
        let mut output = TransportOutput::default().log(
            TransportLogKind::Error,
            format!("ACP error {code}: {message}"),
        );
        if let Some(id) = id {
            output.completed_requests.push(id.clone());
            if let Some(event) = engine
                .pending
                .requests
                .get(id)
                .and_then(|pending| acp_rpc_error_event(pending, code, message))
            {
                output.events.push(event);
            }
        }
        Ok(output)
    }
}

fn acp_rpc_error_event(pending: &PendingRequest, code: i64, message: &str) -> Option<EngineEvent> {
    match pending {
        PendingRequest::StartTurn {
            conversation_id,
            turn_id,
        } => Some(EngineEvent::TurnTerminal {
            conversation_id: conversation_id.clone(),
            turn_id: turn_id.clone(),
            outcome: TurnOutcome::Failed(ErrorInfo::new(
                format!("acp.rpc.{code}"),
                message.to_string(),
            )),
        }),
        PendingRequest::HistoryMutation { conversation_id } => {
            Some(history_mutation_failed_event(conversation_id, message))
        }
        _ => None,
    }
}

fn history_mutation_failed_event(conversation_id: &ConversationId, message: &str) -> EngineEvent {
    EngineEvent::HistoryMutationFinished {
        conversation_id: conversation_id.clone(),
        result: angel_engine::HistoryMutationResult {
            success: false,
            workspace_reverted: false,
            message: Some(message.to_string()),
        },
    }
}

fn append_session_ready_events(
    output: &mut TransportOutput,
    engine: &AngelEngine,
    conversation_id: &ConversationId,
    session_id: Option<String>,
    result: &Value,
) {
    output.events.push(EngineEvent::ConversationReady {
        id: conversation_id.clone(),
        remote: session_id.clone().map(RemoteConversationId::Known),
        context: ContextPatch::empty(),
        capabilities: Some(engine.default_capabilities.clone()),
    });
    let session_label = session_id.unwrap_or_else(|| {
        engine
            .conversations
            .get(conversation_id)
            .and_then(|conversation| conversation.remote.as_protocol_id())
            .map(str::to_string)
            .unwrap_or_else(|| conversation_id.to_string())
    });
    output.logs.push(angel_engine::TransportLog::new(
        TransportLogKind::State,
        format!("session {session_label} ready"),
    ));
    let config_options = session_config_options(result);
    if !config_options.is_empty() {
        output
            .events
            .push(EngineEvent::SessionConfigOptionsUpdated {
                conversation_id: conversation_id.clone(),
                options: config_options,
            });
    }
    if let Some(modes) = session_mode_state(result) {
        output.events.push(EngineEvent::SessionModesUpdated {
            conversation_id: conversation_id.clone(),
            modes,
        });
    }
    if let Some(models) = session_model_state(result) {
        output.events.push(EngineEvent::SessionModelsUpdated {
            conversation_id: conversation_id.clone(),
            models,
        });
    }
}

fn acp_runtime_capabilities(
    result: &Value,
    authentication: angel_engine::CapabilitySupport,
) -> angel_engine::RuntimeCapabilities {
    let mut capabilities = angel_engine::RuntimeCapabilities {
        name: result
            .get("agentInfo")
            .and_then(|agent| agent.get("name"))
            .and_then(Value::as_str)
            .unwrap_or("acp")
            .to_string(),
        version: result
            .get("agentInfo")
            .and_then(|agent| agent.get("version"))
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| result.get("protocolVersion").map(acp_value_label)),
        discovery: acp_session_capability(result, "list"),
        authentication,
        metadata: Default::default(),
    };
    if let Some(title) = result
        .get("agentInfo")
        .and_then(|agent| agent.get("title"))
        .and_then(Value::as_str)
    {
        capabilities
            .metadata
            .insert("acp.agentInfo.title".to_string(), title.to_string());
    }
    if let Some(version) = result.get("protocolVersion").map(acp_value_label) {
        capabilities
            .metadata
            .insert("acp.protocolVersion".to_string(), version);
    }
    for (key, value) in [
        (
            "acp.promptCapabilities",
            result
                .get("agentCapabilities")
                .and_then(|capabilities| capabilities.get("promptCapabilities")),
        ),
        (
            "acp.mcpCapabilities",
            result
                .get("agentCapabilities")
                .and_then(|capabilities| capabilities.get("mcpCapabilities")),
        ),
        (
            "acp.sessionCapabilities",
            result
                .get("agentCapabilities")
                .and_then(|capabilities| capabilities.get("sessionCapabilities")),
        ),
    ] {
        if let Some(value) = value {
            capabilities
                .metadata
                .insert(key.to_string(), compact_json(value));
        }
    }
    capabilities
}

fn acp_protocol_version_is_supported(result: &Value) -> bool {
    match result.get("protocolVersion") {
        Some(Value::Number(number)) => number.as_u64() == Some(1),
        Some(Value::String(version)) => version == "1",
        Some(_) => false,
        None => true,
    }
}

fn acp_value_label(value: &Value) -> String {
    value
        .as_str()
        .map(str::to_string)
        .unwrap_or_else(|| value.to_string())
}

fn compact_json(value: &Value) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| value.to_string())
}

fn acp_conversation_capabilities(
    result: &Value,
    mut capabilities: angel_engine::ConversationCapabilities,
) -> angel_engine::ConversationCapabilities {
    capabilities.lifecycle.list = acp_session_capability(result, "list");
    capabilities.lifecycle.load = if result
        .get("agentCapabilities")
        .and_then(|capabilities| capabilities.get("loadSession"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        angel_engine::CapabilitySupport::Supported
    } else {
        angel_engine::CapabilitySupport::Unsupported
    };
    capabilities.history.hydrate = capabilities.lifecycle.load.clone();
    capabilities.lifecycle.resume = acp_session_capability(result, "resume");
    capabilities.lifecycle.fork = acp_session_capability(result, "fork");
    capabilities.lifecycle.close = acp_session_capability(result, "close");
    capabilities.context.additional_directories =
        acp_session_capability(result, "additionalDirectories");
    capabilities
}

fn acp_session_capability(result: &Value, name: &str) -> angel_engine::CapabilitySupport {
    if result
        .get("agentCapabilities")
        .and_then(|capabilities| capabilities.get("sessionCapabilities"))
        .and_then(|capabilities| capabilities.get(name))
        .is_some()
    {
        angel_engine::CapabilitySupport::Supported
    } else {
        angel_engine::CapabilitySupport::Unsupported
    }
}

fn discovered_conversation_id(
    engine: &AngelEngine,
    remote: &RemoteConversationId,
    fallback: String,
) -> ConversationId {
    engine
        .conversations
        .iter()
        .find(|(_, conversation)| &conversation.remote == remote)
        .map(|(id, _)| id.clone())
        .unwrap_or_else(|| ConversationId::new(fallback))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initialize_ignores_auth_methods_when_authentication_is_unsupported() {
        let adapter = AcpAdapter::without_authentication();
        let mut engine =
            AngelEngine::new(angel_engine::ProtocolFlavor::Acp, adapter.capabilities());
        let request_id = engine
            .plan_command(angel_engine::EngineCommand::Initialize)
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
            [EngineEvent::RuntimeNegotiated { capabilities, .. }]
                if capabilities.authentication == angel_engine::CapabilitySupport::Unsupported
        ));
    }

    #[test]
    fn initialize_maps_session_capabilities_to_common_capabilities() {
        let adapter = AcpAdapter::standard();
        let mut engine =
            AngelEngine::new(angel_engine::ProtocolFlavor::Acp, adapter.capabilities());
        let request_id = engine
            .plan_command(angel_engine::EngineCommand::Initialize)
            .expect("initialize plan")
            .request_id
            .expect("request id");

        let output = adapter
            .decode_response(
                &engine,
                &request_id,
                &json!({
                    "protocolVersion": 1,
                    "agentInfo": {
                        "name": "kimi",
                        "title": "Kimi CLI",
                        "version": "0.9.0"
                    },
                    "agentCapabilities": {
                        "loadSession": true,
                        "promptCapabilities": {
                            "image": true,
                            "audio": false,
                            "embeddedContext": true
                        },
                        "mcpCapabilities": {
                            "http": true,
                            "sse": false
                        },
                        "sessionCapabilities": {
                            "list": {},
                            "resume": {},
                            "fork": {},
                            "additionalDirectories": {},
                            "close": {}
                        }
                    }
                }),
            )
            .expect("initialize response");

        assert!(matches!(
            output.events.as_slice(),
            [EngineEvent::RuntimeNegotiated {
                capabilities,
                conversation_capabilities: Some(conversation_capabilities),
            }] if capabilities.name == "kimi"
                && capabilities.version.as_deref() == Some("0.9.0")
                && capabilities.discovery == angel_engine::CapabilitySupport::Supported
                && capabilities.metadata.get("acp.agentInfo.title").map(String::as_str) == Some("Kimi CLI")
                && capabilities.metadata.get("acp.protocolVersion").map(String::as_str) == Some("1")
                && capabilities.metadata.get("acp.promptCapabilities").is_some_and(|value| value.contains("\"embeddedContext\":true"))
                && capabilities.metadata.get("acp.mcpCapabilities").is_some_and(|value| value.contains("\"http\":true"))
                && conversation_capabilities.lifecycle.list == angel_engine::CapabilitySupport::Supported
                && conversation_capabilities.lifecycle.load == angel_engine::CapabilitySupport::Supported
                && conversation_capabilities.lifecycle.resume == angel_engine::CapabilitySupport::Supported
                && conversation_capabilities.lifecycle.fork == angel_engine::CapabilitySupport::Supported
                && conversation_capabilities.context.additional_directories == angel_engine::CapabilitySupport::Supported
                && conversation_capabilities.lifecycle.close == angel_engine::CapabilitySupport::Supported
        ));
    }

    #[test]
    fn initialize_faults_when_agent_selects_unsupported_protocol_version() {
        let adapter = AcpAdapter::standard();
        let mut engine =
            AngelEngine::new(angel_engine::ProtocolFlavor::Acp, adapter.capabilities());
        let request_id = engine
            .plan_command(angel_engine::EngineCommand::Initialize)
            .expect("initialize plan")
            .request_id
            .expect("request id");

        let output = adapter
            .decode_response(
                &engine,
                &request_id,
                &json!({
                    "protocolVersion": 2,
                    "agentCapabilities": {
                        "sessionCapabilities": {
                            "list": {}
                        }
                    }
                }),
            )
            .expect("initialize response");

        assert!(matches!(
            output.events.as_slice(),
            [EngineEvent::RuntimeFaulted { error }]
                if error.code == "acp.unsupported_protocol_version"
                    && error.message.contains("2")
        ));
    }

    #[test]
    fn session_list_discovers_sessions_with_common_metadata() {
        let adapter = AcpAdapter::standard();
        let mut engine = AngelEngine::with_available_runtime(
            angel_engine::ProtocolFlavor::Acp,
            angel_engine::RuntimeCapabilities::new("test"),
            adapter.capabilities(),
        );
        let request_id = engine
            .plan_command(angel_engine::EngineCommand::DiscoverConversations {
                params: angel_engine::DiscoverConversationsParams::default(),
            })
            .expect("discover plan")
            .request_id
            .expect("request id");

        let output = adapter
            .decode_response(
                &engine,
                &request_id,
                &json!({
                    "sessions": [
                        {
                            "sessionId": "sess_1",
                            "cwd": "/tmp/project",
                            "additionalDirectories": ["/tmp/extra"],
                            "title": "Fix tests",
                            "updatedAt": "2026-05-03T10:00:00Z"
                        }
                    ],
                    "nextCursor": "next-page"
                }),
            )
            .expect("session list response");

        assert!(matches!(
            output.events.as_slice(),
            [EngineEvent::ConversationDiscovered {
                id,
                remote: RemoteConversationId::Known(session_id),
                context,
                ..
            }, EngineEvent::ConversationDiscoveryPage {
                cursor,
                next_cursor,
            }] if id.as_str() == "acp-session-sess_1"
                && session_id == "sess_1"
                && cursor.is_none()
                && next_cursor.as_deref() == Some("next-page")
                && context.updates.iter().any(|update| matches!(
                    update,
                    angel_engine::ContextUpdate::Cwd { cwd: Some(cwd), .. } if cwd == "/tmp/project"
                ))
                && context.updates.iter().any(|update| matches!(
                    update,
                    angel_engine::ContextUpdate::Raw { key, value, .. }
                        if key == "conversation.title" && value == "Fix tests"
                ))
                && context.updates.iter().any(|update| matches!(
                    update,
                    angel_engine::ContextUpdate::AdditionalDirectories { directories, .. }
                        if directories == &vec!["/tmp/extra".to_string()]
                ))
        ));
    }
}
