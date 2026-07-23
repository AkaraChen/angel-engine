use super::super::*;

#[test]
fn thread_list_encodes_common_discovery_params() {
    let adapter = CodexAdapter::app_server();
    let engine = AngelEngine::new(
        angel_engine::ProtocolFlavor::CodexAppServer,
        adapter.capabilities(),
    );
    let effect = angel_engine::ProtocolEffect::new(
        angel_engine::ProtocolFlavor::CodexAppServer,
        ProtocolMethod::ListConversations,
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
        ProtocolMethod::StartConversation,
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
fn thread_start_uses_sandbox_policy_override_shape() {
    let adapter = CodexAdapter::app_server();
    let mut engine = AngelEngine::with_available_runtime(
        angel_engine::ProtocolFlavor::CodexAppServer,
        angel_engine::RuntimeCapabilities::new("test"),
        adapter.capabilities(),
    );
    let plan = engine
        .plan_command(angel_engine::EngineCommand::StartConversation {
            params: angel_engine::StartConversationParams {
                context: ContextPatch::one(angel_engine::ContextUpdate::Sandbox {
                    scope: angel_engine::ContextScope::Conversation,
                    sandbox: angel_engine::SandboxProfile::WorkspaceWrite,
                }),
                ..angel_engine::StartConversationParams::default()
            },
        })
        .expect("start conversation");

    let params = adapter
        .encode_params(&engine, &plan.effects[0], &TransportOptions::default())
        .expect("thread start params");

    assert_eq!(params["sandboxPolicy"], json!({"type": "workspaceWrite"}));
    assert!(params.get("sandbox").is_none());
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
        ProtocolMethod::ResumeConversation,
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
fn thread_read_encodes_include_turns_for_history_hydrate() {
    let adapter = CodexAdapter::app_server();
    let engine = AngelEngine::new(
        angel_engine::ProtocolFlavor::CodexAppServer,
        adapter.capabilities(),
    );
    let effect = angel_engine::ProtocolEffect::new(
        angel_engine::ProtocolFlavor::CodexAppServer,
        ProtocolMethod::ReadConversation,
    )
    .field("remoteConversationId", "thread")
    .field("includeTurns", "true");

    let params = adapter
        .encode_params(&engine, &effect, &TransportOptions::default())
        .expect("thread read params");

    assert_eq!(
        params,
        json!({
            "threadId": "thread",
            "includeTurns": true,
        })
    );
}

#[test]
fn skills_list_encodes_conversation_cwd_and_force_reload() {
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
            context: ContextPatch::one(angel_engine::ContextUpdate::Cwd {
                scope: angel_engine::ContextScope::Conversation,
                cwd: Some("/repo".to_string()),
            }),
            capabilities: None,
        })
        .expect("conversation ready");

    let plan = engine
        .plan_command(angel_engine::EngineCommand::Extension(
            angel_engine::EngineExtensionCommand::RefreshSkills {
                conversation_id,
                force_reload: true,
            },
        ))
        .expect("refresh skills plan");

    let params = adapter
        .encode_params(&engine, &plan.effects[0], &TransportOptions::default())
        .expect("skills list params");

    assert_eq!(params, json!({"cwds": ["/repo"], "forceReload": true}));
}

#[test]
fn goal_commands_encode_codex_thread_goal_params() {
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

    let set_plan = engine
        .plan_command(angel_engine::EngineCommand::Extension(
            angel_engine::EngineExtensionCommand::SetGoal {
                conversation_id: conversation_id.clone(),
                objective: "ship goal support".to_string(),
            },
        ))
        .expect("set goal plan");
    let set_output = adapter
        .encode_effect(&engine, &set_plan.effects[0], &TransportOptions::default())
        .expect("set goal output");
    assert!(matches!(
        set_output.messages.as_slice(),
        [JsonRpcMessage::Request { method, params, .. }]
            if method == "thread/goal/set"
                && params == &json!({
                    "threadId": "thread",
                    "objective": "ship goal support"
                })
    ));

    let pause_plan = engine
        .plan_command(angel_engine::EngineCommand::Extension(
            angel_engine::EngineExtensionCommand::SetGoalStatus {
                conversation_id: conversation_id.clone(),
                status: angel_engine::GoalStatus::Paused,
            },
        ))
        .expect("pause goal plan");
    let pause_params = adapter
        .encode_params(
            &engine,
            &pause_plan.effects[0],
            &TransportOptions::default(),
        )
        .expect("pause goal params");
    assert_eq!(
        pause_params,
        json!({"threadId": "thread", "status": "paused"})
    );

    let clear_plan = engine
        .plan_command(angel_engine::EngineCommand::Extension(
            angel_engine::EngineExtensionCommand::ClearGoal { conversation_id },
        ))
        .expect("clear goal plan");
    let clear_output = adapter
        .encode_effect(
            &engine,
            &clear_plan.effects[0],
            &TransportOptions::default(),
        )
        .expect("clear goal output");
    assert!(matches!(
        clear_output.messages.as_slice(),
        [JsonRpcMessage::Request { method, params, .. }]
            if method == "thread/goal/clear"
                && params == &json!({"threadId": "thread"})
    ));
}
