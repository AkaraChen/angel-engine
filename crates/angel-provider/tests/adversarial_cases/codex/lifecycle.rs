use super::super::*;
use serde_json::json;

#[test]
fn codex_fork_from_pending_source_rejects_before_sending_local_conversation_id() {
    let adapter = CodexAdapter::app_server();
    let mut engine = codex_engine(&adapter);

    let start = engine
        .plan_command(EngineCommand::StartConversation {
            params: StartConversationParams::default(),
        })
        .expect("start pending conversation");
    let source_id = start.conversation_id.expect("source conversation id");
    assert!(matches!(
        engine.conversations[&source_id].remote,
        RemoteConversationId::Pending(_)
    ));

    let fork = engine
        .plan_command(EngineCommand::Extension(
            EngineExtensionCommand::ForkConversation {
                source: source_id,
                at: None,
            },
        ))
        .expect("plan fork");
    let encode_error = adapter
        .encode_effect(&engine, &fork.effects[0], &TransportOptions::default())
        .expect_err("pending source has no remote thread id");

    assert!(matches!(
        encode_error,
        EngineError::InvalidState { expected, actual }
            if expected == "source Codex thread id" && actual.contains("Pending")
    ));
}

#[test]
fn codex_start_turn_rpc_error_terminalizes_and_allows_next_turn() {
    let adapter = CodexAdapter::app_server();
    let mut engine = codex_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
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
    let (_, method, _) = encode_request(&adapter, &engine, &next.effects[0]);
    assert_eq!(method, "turn/start");
}

#[test]
fn codex_rejects_steer_in_engine_and_cancel_in_adapter_before_remote_turn_id() {
    let adapter = CodexAdapter::app_server();
    let mut engine = codex_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
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
        .expect("neutral cancel can be planned");
    let cancel_encode = adapter
        .encode_effect(&engine, &cancel.effects[0], &TransportOptions::default())
        .expect_err("Codex cancel needs remote turn id");
    assert!(matches!(cancel_encode, EngineError::InvalidState { .. }));

    let conversation = &engine.conversations[&conversation_id];
    assert_eq!(engine.pending.requests.len(), pending_len + 1);
    assert_eq!(conversation.turns[&turn_id].input.len(), 1);
    assert!(matches!(
        conversation.lifecycle,
        ConversationLifecycle::Cancelling { .. }
    ));
    assert!(matches!(
        conversation.turns[&turn_id].phase,
        TurnPhase::Cancelling
    ));
}

#[test]
fn codex_encodes_invalid_model_and_effort_as_server_validated_overrides() {
    let adapter = CodexAdapter::app_server();
    let mut engine = codex_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
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
    assert_eq!(params["summary"], json!("auto"));
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
