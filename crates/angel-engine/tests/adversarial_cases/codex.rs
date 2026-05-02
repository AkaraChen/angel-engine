use super::*;
use serde_json::json;

#[test]
fn codex_unknown_thread_notifications_do_not_mutate_selected_conversation() {
    let adapter = CodexAdapter::app_server();
    let mut engine = codex_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::CodexThread("thread-a".to_string()),
        adapter.capabilities(),
    );

    let output = decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::notification(
            "thread/status/changed",
            json!({
                "threadId": "thread-b",
                "status": {
                    "type": "active",
                    "activeFlags": ["waitingOnApproval"]
                }
            }),
        ),
    );

    assert!(output.events.is_empty());
    assert!(
        output
            .logs
            .iter()
            .any(|log| log.message.contains("unknown thread thread-b"))
    );
    assert_eq!(
        engine.conversations[&conversation_id].lifecycle,
        ConversationLifecycle::Idle
    );
}

#[test]
fn codex_bad_server_request_returns_json_rpc_error_and_followup_can_run() {
    let adapter = CodexAdapter::app_server();
    let mut engine = codex_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::CodexThread("thread".to_string()),
        adapter.capabilities(),
    );

    let missing_thread = decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::request(
            JsonRpcRequestId::new("bad-1"),
            "item/tool/requestUserInput",
            json!({
                "questions": [
                    {
                        "id": "mode",
                        "question": "Pick one",
                        "options": [{"label": "A"}]
                    }
                ]
            }),
        ),
    );
    assert_error_message(&missing_thread, "bad-1", -32602);

    let unknown_thread = decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::request(
            JsonRpcRequestId::new("bad-2"),
            "item/commandExecution/requestApproval",
            json!({
                "threadId": "missing-thread",
                "turnId": "turn",
                "itemId": "cmd",
                "command": "rm -rf /tmp/nope"
            }),
        ),
    );
    assert_error_message(&unknown_thread, "bad-2", -32602);

    let plan = start_turn(&mut engine, conversation_id, "still works");
    assert!(matches!(
        plan.effects[0].method,
        ProtocolMethod::Codex(CodexMethod::TurnStart)
    ));
}

#[test]
fn codex_request_before_turn_started_creates_missing_turn_and_action() {
    let adapter = CodexAdapter::app_server();
    let mut engine = codex_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::CodexThread("thread".to_string()),
        adapter.capabilities(),
    );

    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::request(
            JsonRpcRequestId::new("approval"),
            "item/commandExecution/requestApproval",
            json!({
                "threadId": "thread",
                "turnId": "turn-remote",
                "itemId": "cmd-1",
                "command": "dangerous --flag"
            }),
        ),
    );

    let turn_id = TurnId::new("codex-turn-remote");
    let action_id = ActionId::new("cmd-1");
    let conversation = &engine.conversations[&conversation_id];
    assert!(conversation.turns.contains_key(&turn_id));
    assert!(matches!(
        conversation.actions[&action_id].phase,
        ActionPhase::AwaitingDecision { .. }
    ));
    assert_eq!(conversation.elicitations.len(), 1);
}

#[test]
fn codex_item_request_without_turn_id_opens_detached_elicitation() {
    let adapter = CodexAdapter::app_server();
    let mut engine = codex_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::CodexThread("thread".to_string()),
        adapter.capabilities(),
    );

    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::request(
            JsonRpcRequestId::new("detached"),
            "item/fileChange/requestApproval",
            json!({
                "threadId": "thread",
                "itemId": "patch-1",
                "reason": "missing turn id should not poison state"
            }),
        ),
    );

    let conversation = &engine.conversations[&conversation_id];
    let elicitation = conversation.elicitations.values().next().unwrap();
    assert_eq!(elicitation.turn_id, None);
    assert_eq!(elicitation.action_id, None);
    assert_eq!(conversation.lifecycle, ConversationLifecycle::Active);
}

#[test]
fn codex_start_turn_rpc_error_terminalizes_and_allows_next_turn() {
    let adapter = CodexAdapter::app_server();
    let mut engine = codex_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::CodexThread("thread".to_string()),
        adapter.capabilities(),
    );
    let plan = start_turn(&mut engine, conversation_id.clone(), "bad effort please");
    let request_id = plan.request_id.clone().unwrap();
    let turn_id = plan.turn_id.clone().unwrap();

    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::error(Some(request_id.clone()), -32602, "invalid effort", None),
    );

    assert!(!engine.pending.requests.contains_key(&request_id));
    let conversation = &engine.conversations[&conversation_id];
    assert_eq!(conversation.lifecycle, ConversationLifecycle::Idle);
    assert!(matches!(
        conversation.turns[&turn_id].outcome,
        Some(TurnOutcome::Failed(_))
    ));

    let next = start_turn(&mut engine, conversation_id, "recover");
    assert!(matches!(
        next.effects[0].method,
        ProtocolMethod::Codex(CodexMethod::TurnStart)
    ));
}

#[test]
fn codex_rejects_steer_and_cancel_before_remote_turn_id_without_mutation() {
    let adapter = CodexAdapter::app_server();
    let mut engine = codex_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::CodexThread("thread".to_string()),
        adapter.capabilities(),
    );
    let plan = start_turn(&mut engine, conversation_id.clone(), "initial");
    let turn_id = plan.turn_id.clone().unwrap();
    let pending_len = engine.pending.requests.len();

    let steer = engine
        .plan_command(EngineCommand::Extension(
            EngineExtensionCommand::SteerTurn {
                conversation_id: conversation_id.clone(),
                turn_id: None,
                input: vec![UserInput::text("too early")],
            },
        ))
        .expect_err("steer needs remote turn id");
    assert!(matches!(steer, EngineError::InvalidState { .. }));

    let cancel = engine
        .plan_command(EngineCommand::CancelTurn {
            conversation_id: conversation_id.clone(),
            turn_id: None,
        })
        .expect_err("cancel needs remote turn id");
    assert!(matches!(cancel, EngineError::InvalidState { .. }));

    let conversation = &engine.conversations[&conversation_id];
    assert_eq!(engine.pending.requests.len(), pending_len);
    assert_eq!(conversation.turns[&turn_id].input.len(), 1);
    assert_eq!(conversation.lifecycle, ConversationLifecycle::Active);
    assert!(matches!(
        conversation.turns[&turn_id].phase,
        TurnPhase::Starting
    ));
}

#[test]
fn codex_encodes_invalid_model_and_effort_as_server_validated_overrides() {
    let adapter = CodexAdapter::app_server();
    let mut engine = codex_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::CodexThread("thread".to_string()),
        adapter.capabilities(),
    );

    engine
        .plan_command(EngineCommand::UpdateContext {
            conversation_id: conversation_id.clone(),
            patch: ContextPatch {
                updates: vec![
                    ContextUpdate::Model {
                        scope: ContextScope::TurnAndFuture,
                        model: Some("definitely-not-a-model".to_string()),
                    },
                    ContextUpdate::Reasoning {
                        scope: ContextScope::TurnAndFuture,
                        reasoning: Some(ReasoningProfile {
                            effort: Some("sideways".to_string()),
                            summary: Some("verbose".to_string()),
                        }),
                    },
                    ContextUpdate::Mode {
                        scope: ContextScope::TurnAndFuture,
                        mode: Some(AgentMode {
                            id: "plan".to_string(),
                        }),
                    },
                ],
            },
        })
        .expect("codex context update");

    let plan = start_turn(&mut engine, conversation_id, "encode hostile overrides");
    let encoded = adapter
        .encode_effect(&engine, &plan.effects[0], &TransportOptions::default())
        .expect("encode turn");
    let JsonRpcMessage::Request { params, .. } = &encoded.messages[0] else {
        panic!("expected request");
    };

    assert_eq!(params["model"], json!("definitely-not-a-model"));
    assert_eq!(params["effort"], json!("sideways"));
    assert_eq!(params["summary"], json!("verbose"));
    assert_eq!(params["collaborationMode"]["mode"], json!("plan"));
    assert_eq!(
        params["collaborationMode"]["settings"]["model"],
        json!("definitely-not-a-model")
    );
    assert_eq!(
        params["collaborationMode"]["settings"]["reasoning_effort"],
        json!("sideways")
    );
}
