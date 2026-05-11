use crate::command::{EngineCommand, EngineExtensionCommand, TurnOverrides, UserInput};
use crate::error::EngineError;
use crate::event::EngineEvent;
use crate::ids::RemoteConversationId;
use crate::protocol::{ProtocolFlavor, ProtocolMethod};
use crate::reducer::PendingRequest;
use crate::state::{ConversationLifecycle, TurnOutcome, TurnPhase};

use super::{
    accept_codex_turn, acp_capabilities, acp_capabilities_with_steer_extension, codex_capabilities,
    engine_with, insert_ready_conversation, start_turn,
};

#[test]
fn acp_standard_steer_is_capability_unsupported() {
    let capabilities = acp_capabilities();
    let mut engine = engine_with(ProtocolFlavor::Acp, capabilities.clone());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        capabilities.clone(),
    );
    start_turn(&mut engine, conversation_id.clone());

    let err = engine
        .plan_command(EngineCommand::Extension(
            EngineExtensionCommand::SteerTurn {
                conversation_id,
                turn_id: None,
                input: vec![UserInput::text("extra")],
            },
        ))
        .expect_err("standard ACP does not support steer");
    assert!(matches!(
        err,
        EngineError::CapabilityUnsupported { capability } if capability == "turn.steer"
    ));
}

#[test]
fn acp_extension_steer_uses_extension_method() {
    let capabilities = acp_capabilities_with_steer_extension("acp/session/steer");
    let mut engine = engine_with(ProtocolFlavor::Acp, capabilities.clone());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        capabilities.clone(),
    );
    let turn_id = start_turn(&mut engine, conversation_id.clone());

    let plan = engine
        .plan_command(EngineCommand::Extension(
            EngineExtensionCommand::SteerTurn {
                conversation_id,
                turn_id: None,
                input: vec![UserInput::text("extra")],
            },
        ))
        .expect("extension steer");
    assert_eq!(plan.turn_id, Some(turn_id));
    assert!(matches!(
        &plan.effects[0].method,
        ProtocolMethod::Extension(name) if name == "acp/session/steer"
    ));
}

#[test]
fn cancel_turn_emits_neutral_request() {
    let capabilities = acp_capabilities();
    let mut engine = engine_with(ProtocolFlavor::Acp, capabilities.clone());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        capabilities.clone(),
    );
    let turn_id = start_turn(&mut engine, conversation_id.clone());

    let plan = engine
        .plan_command(EngineCommand::CancelTurn {
            conversation_id: conversation_id.clone(),
            turn_id: None,
        })
        .expect("cancel turn");

    assert!(plan.request_id.is_some());
    assert_eq!(plan.effects[0].request_id, plan.request_id);
    assert!(matches!(plan.effects[0].method, ProtocolMethod::CancelTurn));
    assert!(
        engine
            .pending
            .requests
            .values()
            .any(|pending| matches!(pending, PendingRequest::CancelTurn { .. }))
    );
    let conversation = engine.conversations.get(&conversation_id).unwrap();
    assert!(matches!(
        &conversation.lifecycle,
        ConversationLifecycle::Cancelling { turn_id: id } if id == &turn_id
    ));
}

#[test]
fn codex_standard_steer_uses_turn_steer() {
    let capabilities = codex_capabilities();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, capabilities.clone());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        capabilities.clone(),
    );
    let turn_id = start_turn(&mut engine, conversation_id.clone());
    accept_codex_turn(&mut engine, conversation_id.clone(), turn_id);

    let plan = engine
        .plan_command(EngineCommand::Extension(
            EngineExtensionCommand::SteerTurn {
                conversation_id,
                turn_id: None,
                input: vec![UserInput::text("extra")],
            },
        ))
        .expect("codex steer");
    assert!(matches!(&plan.effects[0].method, ProtocolMethod::SteerTurn));
}
#[test]
fn active_turn_limit_blocks_second_start_by_default() {
    let capabilities = codex_capabilities();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, capabilities.clone());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        capabilities.clone(),
    );
    start_turn(&mut engine, conversation_id.clone());

    let err = engine
        .plan_command(EngineCommand::StartTurn {
            conversation_id,
            input: vec![UserInput::text("second")],
            overrides: TurnOverrides::default(),
        })
        .expect_err("single active turn by default");
    assert!(matches!(err, EngineError::InvalidState { .. }));
}

#[test]
fn start_turn_effect_fields_include_file_mention_input() {
    let capabilities = codex_capabilities();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, capabilities.clone());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        capabilities.clone(),
    );

    let plan = engine
        .plan_command(EngineCommand::StartTurn {
            conversation_id,
            input: vec![
                UserInput::text("inspect this"),
                UserInput::file_mention(
                    "lib.rs",
                    "/repo/src/lib.rs",
                    Some("text/x-rust".to_string()),
                ),
            ],
            overrides: TurnOverrides::default(),
        })
        .expect("start turn");
    let fields = &plan.effects[0].payload.fields;

    assert_eq!(fields.get("inputCount").map(String::as_str), Some("2"));
    assert_eq!(
        fields.get("input.1.type").map(String::as_str),
        Some("file_mention")
    );
    assert_eq!(
        fields.get("input.1.name").map(String::as_str),
        Some("lib.rs")
    );
    assert_eq!(
        fields.get("input.1.path").map(String::as_str),
        Some("/repo/src/lib.rs")
    );
    assert_eq!(
        fields.get("input.1.mimeType").map(String::as_str),
        Some("text/x-rust")
    );
}

#[test]
fn cancel_is_two_phase_until_terminal_event() {
    let capabilities = codex_capabilities();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, capabilities.clone());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        capabilities.clone(),
    );
    let turn_id = start_turn(&mut engine, conversation_id.clone());
    accept_codex_turn(&mut engine, conversation_id.clone(), turn_id.clone());

    engine
        .plan_command(EngineCommand::CancelTurn {
            conversation_id: conversation_id.clone(),
            turn_id: None,
        })
        .expect("cancel");
    let conversation = engine.conversations.get(&conversation_id).unwrap();
    assert!(matches!(
        conversation.lifecycle,
        ConversationLifecycle::Cancelling { .. }
    ));
    assert!(matches!(
        conversation.turns.get(&turn_id).unwrap().phase,
        TurnPhase::Cancelling
    ));

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
}
