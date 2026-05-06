use crate::capabilities::{CapabilitySupport, ConversationCapabilities, RuntimeCapabilities};
use crate::command::{EngineCommand, TurnOverrides, UserInput};
use crate::event::EngineEvent;
use crate::ids::{ConversationId, RemoteConversationId, RemoteTurnId, TurnId};
use crate::protocol::ProtocolFlavor;
use crate::state::ConversationLifecycle;

use super::AngelEngine;

mod codex_commands;
mod context;
mod discovery;
mod elicitation;
mod events;
mod history;
mod turn_control;

pub(super) fn runtime(name: &str) -> RuntimeCapabilities {
    RuntimeCapabilities::new(name)
}

pub(super) fn acp_capabilities() -> ConversationCapabilities {
    ConversationCapabilities::acp_standard()
}

pub(super) fn acp_capabilities_with_steer_extension(name: &str) -> ConversationCapabilities {
    let mut capabilities = ConversationCapabilities::acp_standard();
    capabilities.turn.steer = CapabilitySupport::Extension {
        name: name.to_string(),
    };
    capabilities
}

pub(super) fn codex_capabilities() -> ConversationCapabilities {
    ConversationCapabilities::codex_app_server()
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
            remote: RemoteTurnId::Known("remote-turn".to_string()),
            input: Vec::new(),
        })
        .expect("codex turn accepted");
}
