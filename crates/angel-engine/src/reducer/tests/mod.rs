use crate::capabilities::{ConversationCapabilities, RuntimeCapabilities};
use crate::command::{EngineCommand, TurnOverrides, UserInput};
use crate::event::EngineEvent;
use crate::ids::{ConversationId, RemoteConversationId, RemoteTurnId, TurnId};
use crate::protocol::ProtocolFlavor;
use crate::state::ConversationLifecycle;

use super::AngelEngine;

mod codex_commands;
mod context;
mod elicitation;
mod events;
mod history;
mod turn_control;

pub(super) fn runtime(name: &str) -> RuntimeCapabilities {
    RuntimeCapabilities::new(name)
}

pub(super) fn engine_with(
    protocol: ProtocolFlavor,
    capabilities: ConversationCapabilities,
) -> AngelEngine {
    AngelEngine::with_available_runtime(protocol, runtime("test"), capabilities)
}

pub(super) fn insert_ready_conversation(
    engine: &mut AngelEngine,
    id: &str,
    remote: RemoteConversationId,
    capabilities: ConversationCapabilities,
) -> ConversationId {
    let id = ConversationId::new(id);
    let state = crate::ConversationState::new(
        id.clone(),
        remote,
        ConversationLifecycle::Idle,
        capabilities,
    );
    engine.conversations.insert(id.clone(), state);
    engine.selected = Some(id.clone());
    id
}

pub(super) fn start_turn(engine: &mut AngelEngine, conversation_id: ConversationId) -> TurnId {
    engine
        .plan_command(EngineCommand::StartTurn {
            conversation_id,
            input: vec![UserInput::text("hello")],
            overrides: TurnOverrides::default(),
        })
        .expect("start turn")
        .turn_id
        .expect("turn id")
}

pub(super) fn accept_codex_turn(
    engine: &mut AngelEngine,
    conversation_id: ConversationId,
    turn_id: TurnId,
) {
    engine
        .apply_event(EngineEvent::TurnStarted {
            conversation_id,
            turn_id,
            remote: RemoteTurnId::CodexTurn("remote-turn".to_string()),
            input: Vec::new(),
        })
        .expect("codex turn accepted");
}
