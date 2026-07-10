use super::super::*;
use serde_json::json;

#[test]
fn acp_start_turn_rpc_error_terminalizes_and_allows_next_turn() {
    let adapter = AcpAdapter::standard();
    let mut engine = acp_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        adapter.capabilities(),
    );
    let plan = start_turn(&mut engine, conversation_id.clone(), "bad model");
    let request_id = plan.request_id.clone().unwrap();
    let turn_id = plan.turn_id.clone().unwrap();

    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::error(Some(request_id.clone()), -32602, "invalid model", None),
    );

    assert!(!engine.pending.requests.contains_key(&request_id));
    let conversation = &engine.conversations[&conversation_id];
    assert_eq!(conversation.lifecycle, ConversationLifecycle::Idle);
    assert!(matches!(
        conversation.turns[&turn_id].outcome,
        Some(TurnOutcome::Failed(_))
    ));

    let next = start_turn(&mut engine, conversation_id, "recover");
    let (_, method, _) = encode_request(&adapter, &engine, &next.effects[0]);
    assert_eq!(method, "session/prompt");
}

#[test]
fn acp_load_hydrates_replay_updates_before_response_without_session_id() {
    let adapter = AcpAdapter::standard();
    let mut engine = acp_engine(&adapter);
    engine.default_capabilities.lifecycle.load = CapabilitySupport::Supported;
    let plan = engine
        .plan_command(EngineCommand::ResumeConversation {
            target: ResumeTarget::Remote {
                id: "sess".to_string(),
                hydrate: true,
                cwd: None,
            },
        })
        .expect("load session");
    let conversation_id = plan.conversation_id.clone().unwrap();
    let request_id = plan.request_id.clone().unwrap();
    assert!(matches!(
        engine.conversations[&conversation_id].lifecycle,
        ConversationLifecycle::Hydrating { .. }
    ));

    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::notification(
            "session/update",
            json!({
                "sessionId": "sess",
                "update": {
                    "sessionUpdate": "user_message_chunk",
                    "content": {"type": "text", "text": "old user prompt"}
                }
            }),
        ),
    );
    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::notification(
            "session/update",
            json!({
                "sessionId": "sess",
                "update": {
                    "sessionUpdate": "agent_message_chunk",
                    "content": {
                        "type": "resource_link",
                        "name": "README",
                        "uri": "file:///repo/README.md"
                    }
                }
            }),
        ),
    );
    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::response(
            request_id,
            json!({
                "modes": {
                    "currentModeId": "default",
                    "availableModes": [{"id": "default", "name": "Default"}]
                }
            }),
        ),
    );

    let conversation = &engine.conversations[&conversation_id];
    assert_eq!(conversation.lifecycle, ConversationLifecycle::Idle);
    assert!(conversation.history.hydrated);
    assert_eq!(conversation.history.turn_count, 1);
    assert!(matches!(
        conversation.history.replay.as_slice(),
        [
            HistoryReplayEntry {
                role: HistoryRole::User,
                content: ContentDelta::Text(user),
                tool: None,
            },
            HistoryReplayEntry {
                role: HistoryRole::Assistant,
                content: ContentDelta::ResourceRef(resource),
                tool: None,
            },
        ] if user == "old user prompt" && resource == "file:///repo/README.md"
    ));
    assert_eq!(
        conversation
            .mode_state
            .as_ref()
            .map(|modes| modes.current_mode_id.as_str()),
        Some("default")
    );
}

#[test]
fn acp_resume_response_without_session_id_keeps_existing_remote_session() {
    let adapter = AcpAdapter::standard();
    let mut engine = acp_engine(&adapter);
    engine.default_capabilities.lifecycle.resume = CapabilitySupport::Supported;
    let plan = engine
        .plan_command(EngineCommand::ResumeConversation {
            target: ResumeTarget::Remote {
                id: "sess".to_string(),
                hydrate: false,
                cwd: None,
            },
        })
        .expect("resume session");
    let conversation_id = plan.conversation_id.clone().unwrap();
    let request_id = plan.request_id.clone().unwrap();

    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::response(request_id, json!({})),
    );

    let conversation = &engine.conversations[&conversation_id];
    assert_eq!(
        conversation.remote,
        RemoteConversationId::Known("sess".to_string())
    );
    assert_eq!(conversation.lifecycle, ConversationLifecycle::Idle);
}

#[test]
fn acp_session_fork_uses_source_remote_session_and_marks_fork_ready() {
    let adapter = AcpAdapter::standard();
    let mut engine = acp_engine(&adapter);
    engine.default_capabilities.lifecycle.fork = CapabilitySupport::Supported;
    let capabilities = engine.default_capabilities.clone();
    let source_id = insert_ready_conversation(
        &mut engine,
        "source",
        RemoteConversationId::Known("source-sess".to_string()),
        capabilities,
    );
    engine
        .apply_event(EngineEvent::ContextUpdated {
            conversation_id: source_id.clone(),
            patch: ContextPatch::one(ContextUpdate::Cwd {
                scope: ContextScope::Conversation,
                cwd: Some("/repo/source".to_string()),
            }),
        })
        .expect("source cwd");

    let plan = engine
        .plan_command(EngineCommand::Extension(
            EngineExtensionCommand::ForkConversation {
                source: source_id.clone(),
                at: None,
            },
        ))
        .expect("fork conversation");
    let fork_id = plan.conversation_id.clone().unwrap();
    let request_id = plan.request_id.clone().unwrap();
    let (_, method, params) = encode_request(&adapter, &engine, &plan.effects[0]);

    assert_eq!(method, "session/fork");
    assert_eq!(
        params,
        json!({
            "sessionId": "source-sess",
            "cwd": "/repo/source",
            "mcpServers": []
        })
    );

    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::response(
            request_id,
            json!({
                "sessionId": "fork-sess",
                "modes": {
                    "currentModeId": "plan",
                    "availableModes": [{"id": "plan", "name": "Plan"}]
                }
            }),
        ),
    );

    let fork = &engine.conversations[&fork_id];
    assert_eq!(
        fork.remote,
        RemoteConversationId::Known("fork-sess".to_string())
    );
    assert_eq!(fork.lifecycle, ConversationLifecycle::Idle);
    assert_eq!(
        fork.mode_state
            .as_ref()
            .map(|modes| modes.current_mode_id.as_str()),
        Some("plan")
    );
}

#[test]
fn acp_additional_directories_are_capability_gated_and_encoded() {
    let adapter = AcpAdapter::standard();
    let mut unsupported = acp_engine(&adapter);
    let blocked = unsupported
        .plan_command(EngineCommand::DiscoverConversations {
            params: DiscoverConversationsParams {
                cwd: Some("/repo/main".to_string()),
                additional_directories: vec!["/repo/extra".to_string()],
                cursor: None,
            },
        })
        .expect_err("additional directories require capability");
    assert!(matches!(
        blocked,
        EngineError::CapabilityUnsupported { capability }
            if capability == "context.additional_directories"
    ));

    let mut engine = acp_engine(&adapter);
    engine.default_capabilities.context.additional_directories = CapabilitySupport::Supported;
    engine.default_capabilities.lifecycle.load = CapabilitySupport::Supported;
    let discover = engine
        .plan_command(EngineCommand::DiscoverConversations {
            params: DiscoverConversationsParams {
                cwd: Some("/repo/main".to_string()),
                additional_directories: vec!["/repo/extra".to_string()],
                cursor: Some("next".to_string()),
            },
        })
        .expect("discover with additional directories");
    let (_, method, params) = encode_request(&adapter, &engine, &discover.effects[0]);
    assert_eq!(method, "session/list");
    assert_eq!(params["additionalDirectories"], json!(["/repo/extra"]));

    let start = engine
        .plan_command(EngineCommand::StartConversation {
            params: StartConversationParams {
                cwd: Some("/repo/main".to_string()),
                additional_directories: vec!["/repo/extra".to_string()],
                context: ContextPatch::empty(),
            },
        })
        .expect("start with additional directories");
    let (_, method, params) = encode_request(&adapter, &engine, &start.effects[0]);
    assert_eq!(method, "session/new");
    assert_eq!(params["additionalDirectories"], json!(["/repo/extra"]));

    let resume = engine
        .plan_command(EngineCommand::ResumeConversation {
            target: ResumeTarget::RemoteWithContext {
                id: "sess".to_string(),
                hydrate: true,
                cwd: None,
                additional_directories: vec!["/repo/extra".to_string(), "/repo/lib".to_string()],
            },
        })
        .expect("load with additional directories");
    let (_, method, params) = encode_request(&adapter, &engine, &resume.effects[0]);
    assert_eq!(method, "session/load");
    assert_eq!(
        params["additionalDirectories"],
        json!(["/repo/extra", "/repo/lib"])
    );
}
