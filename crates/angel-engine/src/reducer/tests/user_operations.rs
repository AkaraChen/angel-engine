use crate::command::{EngineCommand, TurnOverrides, UserInput};
use crate::error::{EngineError, ErrorInfo};
use crate::event::EngineEvent;
use crate::ids::{
    ActionId, ElicitationId, JsonRpcRequestId, RemoteConversationId, RemoteRequestId, TurnId,
};
use crate::protocol::ProtocolFlavor;
use crate::state::{
    ActionKind, ActionPhase, ActionState, ConversationLifecycle, ElicitationDecision,
    ElicitationKind, ElicitationPhase, ElicitationState, HistoryMutationOp, HydrationSource,
    TurnOutcome,
};

use super::{codex_capabilities, engine_with, insert_ready_conversation, start_turn};

#[test]
fn start_turn_rejects_non_interactive_conversation_lifecycles() {
    let blocked_lifecycles = vec![
        ConversationLifecycle::Cancelling {
            turn_id: TurnId::new("turn-cancelling"),
        },
        ConversationLifecycle::Hydrating {
            source: HydrationSource::Load,
        },
        ConversationLifecycle::MutatingHistory {
            op: HistoryMutationOp::Compact,
        },
        ConversationLifecycle::Archived,
        ConversationLifecycle::Closing,
        ConversationLifecycle::Closed,
        ConversationLifecycle::Faulted(ErrorInfo::new("fault", "runtime fault")),
    ];

    for lifecycle in blocked_lifecycles {
        let capabilities = codex_capabilities();
        let mut engine = engine_with(ProtocolFlavor::CodexAppServer, capabilities.clone());
        let conversation_id = insert_ready_conversation(
            &mut engine,
            "conv",
            RemoteConversationId::Known("thread".to_string()),
            capabilities,
        );
        engine
            .conversations
            .get_mut(&conversation_id)
            .expect("conversation")
            .lifecycle = lifecycle.clone();

        let error = engine
            .plan_command(EngineCommand::StartTurn {
                conversation_id: conversation_id.clone(),
                input: vec![UserInput::text("should not start")],
                overrides: TurnOverrides::default(),
            })
            .expect_err("blocked lifecycle rejects start turn");

        assert!(
            matches!(error, EngineError::InvalidState { .. }),
            "unexpected error for lifecycle {lifecycle:?}: {error:?}",
        );
        let conversation = engine.conversations.get(&conversation_id).unwrap();
        assert!(conversation.turns.is_empty());
        assert!(conversation.active_turns.is_empty());
        assert!(engine.pending.requests.is_empty());
    }
}

#[test]
fn settings_user_choices_ignore_empty_same_and_unknown_values() {
    let capabilities = codex_capabilities();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, capabilities.clone());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        capabilities,
    );

    engine
        .apply_event(EngineEvent::SessionModelsUpdated {
            conversation_id: conversation_id.clone(),
            models: crate::state::SessionModelState {
                current_model_id: "model-a".to_string(),
                available_models: vec![
                    crate::state::SessionModel {
                        id: "model-a".to_string(),
                        name: "Model A".to_string(),
                        description: None,
                    },
                    crate::state::SessionModel {
                        id: "model-b".to_string(),
                        name: "Model B".to_string(),
                        description: None,
                    },
                ],
            },
        })
        .expect("models");
    engine
        .apply_event(EngineEvent::SessionModesUpdated {
            conversation_id: conversation_id.clone(),
            modes: crate::state::SessionModeState {
                current_mode_id: "default".to_string(),
                available_modes: vec![
                    crate::state::SessionMode {
                        id: "default".to_string(),
                        name: "Default".to_string(),
                        description: None,
                    },
                    crate::state::SessionMode {
                        id: "plan".to_string(),
                        name: "Plan".to_string(),
                        description: None,
                    },
                ],
            },
        })
        .expect("modes");

    for plan in [
        engine
            .set_model(conversation_id.clone(), "")
            .expect("empty model"),
        engine
            .set_model(conversation_id.clone(), "model-a")
            .expect("same model"),
        engine
            .set_model(conversation_id.clone(), "unknown-model")
            .expect("unknown model"),
        engine
            .set_mode(conversation_id.clone(), "")
            .expect("empty mode"),
        engine
            .set_mode(conversation_id.clone(), "unknown-mode")
            .expect("unknown mode"),
    ] {
        assert!(plan.effects.is_empty());
        assert!(plan.request_id.is_none());
        assert_eq!(plan.conversation_id.as_ref(), Some(&conversation_id));
    }

    let conversation = engine.conversations.get(&conversation_id).unwrap();
    assert_eq!(
        conversation.context.model.effective(),
        Some(&Some("model-a".to_string()))
    );
    assert_eq!(
        conversation
            .context
            .mode
            .effective()
            .and_then(Option::as_ref)
            .map(|mode| mode.id.as_str()),
        Some("default")
    );
    assert!(engine.pending.requests.is_empty());
}

#[test]
fn start_turn_preserves_every_user_input_shape_for_runtime_projection() {
    let capabilities = codex_capabilities();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, capabilities.clone());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        capabilities,
    );

    let plan = engine
        .plan_command(EngineCommand::StartTurn {
            conversation_id: conversation_id.clone(),
            input: vec![
                UserInput::text("inspect these inputs"),
                UserInput::resource_link("docs", "file:///repo/docs/readme.md"),
                UserInput::file_mention(
                    "lib.rs",
                    "/repo/src/lib.rs",
                    Some("text/x-rust".to_string()),
                ),
                UserInput::embedded_text_resource(
                    "memory://note",
                    "inline note",
                    Some("text/plain".to_string()),
                ),
                UserInput::embedded_blob_resource(
                    "file:///repo/archive.bin",
                    "AAEC",
                    None,
                    Some("archive.bin".to_string()),
                ),
                UserInput::image(
                    "iVBORw0KGgo=",
                    "image/png",
                    Some("screenshot.png".to_string()),
                ),
                UserInput::raw_content_block(serde_json::json!({
                    "type": "text",
                    "text": "raw block",
                })),
            ],
            overrides: TurnOverrides::default(),
        })
        .expect("start turn");
    let fields = &plan.effects[0].payload.fields;

    assert_eq!(fields.get("inputCount").map(String::as_str), Some("7"));
    assert_eq!(fields.get("input.0.type").map(String::as_str), Some("text"));
    assert_eq!(
        fields.get("input.1.type").map(String::as_str),
        Some("resource_link")
    );
    assert_eq!(
        fields.get("input.2.type").map(String::as_str),
        Some("file_mention")
    );
    assert_eq!(
        fields.get("input.3.type").map(String::as_str),
        Some("resource")
    );
    assert_eq!(
        fields.get("input.4.type").map(String::as_str),
        Some("resource_blob")
    );
    assert_eq!(
        fields.get("input.5.type").map(String::as_str),
        Some("image")
    );
    assert_eq!(fields.get("input.6.type").map(String::as_str), Some("raw"));

    let turn_id = plan.turn_id.expect("turn id");
    let conversation = engine.conversations.get(&conversation_id).unwrap();
    let turn = conversation.turns.get(&turn_id).expect("turn");
    assert_eq!(turn.input.len(), 7);
    assert!(turn.input[4].file.is_some());
    assert_eq!(
        turn.input[4].file.as_ref().expect("file ref").mime_type,
        "application/octet-stream"
    );
    assert!(turn.input[5].image.is_some());
    assert_eq!(
        turn.input[5]
            .image
            .as_ref()
            .expect("image ref")
            .name
            .as_deref(),
        Some("screenshot.png")
    );
}

#[test]
fn terminal_turn_cleans_up_waiting_permission_state() {
    let capabilities = codex_capabilities();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, capabilities.clone());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        capabilities,
    );
    let turn_id = start_turn(&mut engine, conversation_id.clone());
    let action_id = ActionId::new("write-file");
    let action = ActionState::new(action_id.clone(), turn_id.clone(), ActionKind::Write);
    engine
        .apply_event(EngineEvent::ActionObserved {
            conversation_id: conversation_id.clone(),
            action,
        })
        .expect("action");

    let elicitation_id = ElicitationId::new("approval");
    let mut elicitation = ElicitationState::new(
        elicitation_id.clone(),
        RemoteRequestId::JsonRpc(JsonRpcRequestId::new("request")),
        ElicitationKind::Approval,
    );
    elicitation.turn_id = Some(turn_id.clone());
    elicitation.action_id = Some(action_id.clone());
    engine
        .apply_event(EngineEvent::ElicitationOpened {
            conversation_id: conversation_id.clone(),
            elicitation,
        })
        .expect("open elicitation");

    engine
        .apply_event(EngineEvent::TurnTerminal {
            conversation_id: conversation_id.clone(),
            turn_id: turn_id.clone(),
            outcome: TurnOutcome::Interrupted,
        })
        .expect("terminal");

    let conversation = engine.conversations.get(&conversation_id).unwrap();
    assert_eq!(conversation.lifecycle, ConversationLifecycle::Idle);
    assert!(conversation.active_turns.is_empty());
    assert_eq!(
        conversation.actions.get(&action_id).unwrap().phase,
        ActionPhase::Cancelled
    );
    assert_eq!(
        conversation
            .elicitations
            .get(&elicitation_id)
            .unwrap()
            .phase,
        ElicitationPhase::Cancelled
    );
}

#[test]
fn resolving_elicitation_rejects_double_submit_without_new_request() {
    let capabilities = codex_capabilities();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, capabilities.clone());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        capabilities,
    );
    let elicitation_id = ElicitationId::new("approval");
    engine
        .apply_event(EngineEvent::ElicitationOpened {
            conversation_id: conversation_id.clone(),
            elicitation: ElicitationState::new(
                elicitation_id.clone(),
                RemoteRequestId::JsonRpc(JsonRpcRequestId::new("request")),
                ElicitationKind::Approval,
            ),
        })
        .expect("open elicitation");

    let first = engine
        .plan_command(EngineCommand::ResolveElicitation {
            conversation_id: conversation_id.clone(),
            elicitation_id: elicitation_id.clone(),
            decision: ElicitationDecision::Allow,
        })
        .expect("first resolve");
    assert!(first.request_id.is_some());
    assert_eq!(engine.pending.requests.len(), 1);

    let second = engine
        .plan_command(EngineCommand::ResolveElicitation {
            conversation_id: conversation_id.clone(),
            elicitation_id: elicitation_id.clone(),
            decision: ElicitationDecision::Deny,
        })
        .expect_err("double submit should reject");
    assert!(matches!(
        second,
        EngineError::InvalidState { expected, actual }
            if expected == "open elicitation" && actual == "Resolving"
    ));
    assert_eq!(engine.pending.requests.len(), 1);
    assert_eq!(
        engine.conversations[&conversation_id].elicitations[&elicitation_id].phase,
        ElicitationPhase::Resolving
    );
}

#[test]
fn history_mutation_rejects_active_turn_without_losing_run_state() {
    let capabilities = codex_capabilities();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, capabilities.clone());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        capabilities,
    );
    let turn_id = start_turn(&mut engine, conversation_id.clone());
    let pending_before = engine.pending.requests.len();

    let error = engine
        .plan_command(EngineCommand::Extension(
            crate::EngineExtensionCommand::MutateHistory {
                conversation_id: conversation_id.clone(),
                op: HistoryMutationOp::Compact,
            },
        ))
        .expect_err("active turn blocks history mutation");

    assert!(matches!(
        error,
        EngineError::InvalidState { expected, actual }
            if expected == "idle conversation" && actual == "active turns present"
    ));
    let conversation = engine.conversations.get(&conversation_id).unwrap();
    assert_eq!(conversation.lifecycle, ConversationLifecycle::Active);
    assert!(conversation.active_turns.contains(&turn_id));
    assert_eq!(engine.pending.requests.len(), pending_before);
}
