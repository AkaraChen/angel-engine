use crate::adapters::acp::AcpAdapter;
use crate::adapters::codex::CodexAdapter;
use crate::command::{EngineCommand, EngineExtensionCommand, TurnOverrides, UserInput};
use crate::error::EngineError;
use crate::event::EngineEvent;
use crate::ids::RemoteConversationId;
use crate::protocol::{AcpMethod, CodexMethod, ProtocolFlavor, ProtocolMethod};
use crate::reducer::PendingRequest;
use crate::state::{ConversationLifecycle, TurnOutcome, TurnPhase};

use super::{accept_codex_turn, engine_with, insert_ready_conversation, start_turn};

#[test]
fn acp_standard_steer_is_capability_unsupported() {
    let adapter = AcpAdapter::standard();
    let mut engine = engine_with(ProtocolFlavor::Acp, adapter.capabilities());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::AcpSession("sess".to_string()),
        adapter.capabilities(),
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
    let adapter = AcpAdapter::with_steer_extension("acp/session/steer");
    let mut engine = engine_with(ProtocolFlavor::Acp, adapter.capabilities());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::AcpSession("sess".to_string()),
        adapter.capabilities(),
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
fn acp_cancel_turn_is_notification_not_public_raw_protocol() {
    let adapter = AcpAdapter::standard();
    let mut engine = engine_with(ProtocolFlavor::Acp, adapter.capabilities());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::AcpSession("sess".to_string()),
        adapter.capabilities(),
    );
    let turn_id = start_turn(&mut engine, conversation_id.clone());

    let plan = engine
        .plan_command(EngineCommand::CancelTurn {
            conversation_id: conversation_id.clone(),
            turn_id: None,
        })
        .expect("cancel turn");

    assert_eq!(plan.request_id, None);
    assert_eq!(plan.effects[0].request_id, None);
    assert!(matches!(
        plan.effects[0].method,
        ProtocolMethod::Acp(AcpMethod::SessionCancel)
    ));
    assert!(
        engine
            .pending
            .requests
            .values()
            .all(|pending| !matches!(pending, PendingRequest::CancelTurn { .. }))
    );
    let conversation = engine.conversations.get(&conversation_id).unwrap();
    assert!(matches!(
        &conversation.lifecycle,
        ConversationLifecycle::Cancelling { turn_id: id } if id == &turn_id
    ));
}

#[test]
fn codex_standard_steer_uses_turn_steer() {
    let adapter = CodexAdapter::app_server();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, adapter.capabilities());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::CodexThread("thread".to_string()),
        adapter.capabilities(),
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
    assert!(matches!(
        &plan.effects[0].method,
        ProtocolMethod::Codex(CodexMethod::TurnSteer)
    ));
}
#[test]
fn active_turn_limit_blocks_second_start_by_default() {
    let adapter = CodexAdapter::app_server();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, adapter.capabilities());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::CodexThread("thread".to_string()),
        adapter.capabilities(),
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
fn cancel_is_two_phase_until_terminal_event() {
    let adapter = CodexAdapter::app_server();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, adapter.capabilities());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::CodexThread("thread".to_string()),
        adapter.capabilities(),
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
