use super::*;

#[test]
fn initialize_ignores_auth_methods_when_authentication_is_unsupported() {
    let adapter = AcpAdapter::without_authentication();
    let mut engine = AngelEngine::new(angel_engine::ProtocolFlavor::Acp, adapter.capabilities());
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
    let mut engine = AngelEngine::new(angel_engine::ProtocolFlavor::Acp, adapter.capabilities());
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
fn authenticate_empty_response_preserves_initialize_capabilities() {
    let adapter = AcpAdapter::standard();
    let mut engine = AngelEngine::new(angel_engine::ProtocolFlavor::Acp, adapter.capabilities());
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
                    "name": "Kimi Code CLI",
                    "version": "1.40.0"
                },
                "authMethods": [
                    {
                        "id": "login",
                        "name": "Login with Kimi account"
                    }
                ],
                "agentCapabilities": {
                    "loadSession": true,
                    "sessionCapabilities": {
                        "list": {},
                        "resume": {}
                    }
                }
            }),
        )
        .expect("initialize response");
    angel_engine::apply_transport_output(&mut engine, &output).expect("apply initialize");
    assert!(matches!(
        engine.runtime,
        angel_engine::RuntimeState::AwaitingAuth { .. }
    ));

    let auth_id = engine
        .plan_command(angel_engine::EngineCommand::Authenticate {
            method: angel_engine::AuthMethodId::new("login"),
        })
        .expect("auth plan")
        .request_id
        .expect("request id");
    let output = adapter
        .decode_response(&engine, &auth_id, &json!({}))
        .expect("auth response");

    assert!(matches!(
        output.events.as_slice(),
        [EngineEvent::RuntimeNegotiated {
            capabilities,
            conversation_capabilities: Some(conversation_capabilities),
        }] if capabilities.name == "Kimi Code CLI"
            && capabilities.authentication == angel_engine::CapabilitySupport::Supported
            && conversation_capabilities.lifecycle.load == angel_engine::CapabilitySupport::Supported
            && conversation_capabilities.lifecycle.list == angel_engine::CapabilitySupport::Supported
            && conversation_capabilities.lifecycle.resume == angel_engine::CapabilitySupport::Supported
    ));
}

#[test]
fn initialize_faults_when_agent_selects_unsupported_protocol_version() {
    let adapter = AcpAdapter::standard();
    let mut engine = AngelEngine::new(angel_engine::ProtocolFlavor::Acp, adapter.capabilities());
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
