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
    let mut capabilities = ConversationCapabilities::unknown();
    capabilities.lifecycle.create = CapabilitySupport::Supported;
    capabilities.lifecycle.list = CapabilitySupport::Supported;
    capabilities.lifecycle.fork = CapabilitySupport::Unsupported;
    capabilities.lifecycle.archive = CapabilitySupport::Unsupported;
    capabilities.turn.start = CapabilitySupport::Supported;
    capabilities.turn.steer = CapabilitySupport::Unsupported;
    capabilities.turn.cancel = CapabilitySupport::Supported;
    capabilities.action.observe = CapabilitySupport::Supported;
    capabilities.action.stream_output = CapabilitySupport::Supported;
    capabilities.action.decline = CapabilitySupport::Supported;
    capabilities.elicitation.approval = CapabilitySupport::Supported;
    capabilities.history.compact = CapabilitySupport::Unsupported;
    capabilities.history.rollback = CapabilitySupport::Unsupported;
    capabilities.history.inject_items = CapabilitySupport::Unsupported;
    capabilities.history.shell_command = CapabilitySupport::Unsupported;
    capabilities.context.turn_overrides = CapabilitySupport::Unsupported;
    capabilities.observer.unsubscribe = CapabilitySupport::Unsupported;
    capabilities
}

pub(super) fn acp_capabilities_with_steer_extension(name: &str) -> ConversationCapabilities {
    let mut capabilities = acp_capabilities();
    capabilities.turn.steer = CapabilitySupport::Extension {
        name: name.to_string(),
    };
    capabilities
}

pub(super) fn codex_capabilities() -> ConversationCapabilities {
    let mut capabilities = ConversationCapabilities::unknown();
    capabilities.lifecycle.create = CapabilitySupport::Supported;
    capabilities.lifecycle.list = CapabilitySupport::Supported;
    capabilities.lifecycle.load = CapabilitySupport::Supported;
    capabilities.lifecycle.resume = CapabilitySupport::Supported;
    capabilities.lifecycle.fork = CapabilitySupport::Supported;
    capabilities.lifecycle.archive = CapabilitySupport::Supported;
    capabilities.turn.start = CapabilitySupport::Supported;
    capabilities.turn.steer = CapabilitySupport::Supported;
    capabilities.turn.cancel = CapabilitySupport::Supported;
    capabilities.turn.requires_expected_turn_id_for_steer = true;
    capabilities.action.observe = CapabilitySupport::Supported;
    capabilities.action.stream_output = CapabilitySupport::Supported;
    capabilities.action.decline = CapabilitySupport::Supported;
    capabilities.elicitation.approval = CapabilitySupport::Supported;
    capabilities.elicitation.user_input = CapabilitySupport::Supported;
    capabilities.elicitation.external_flow = CapabilitySupport::Supported;
    capabilities.elicitation.dynamic_tool_call = CapabilitySupport::Supported;
    capabilities.history.hydrate = CapabilitySupport::Supported;
    capabilities.history.compact = CapabilitySupport::Supported;
    capabilities.history.rollback = CapabilitySupport::Supported;
    capabilities.history.inject_items = CapabilitySupport::Supported;
    capabilities.history.shell_command = CapabilitySupport::Supported;
    capabilities.context.mode = CapabilitySupport::Supported;
    capabilities.context.config = CapabilitySupport::Supported;
    capabilities.context.additional_directories = CapabilitySupport::Unsupported;
    capabilities.context.turn_overrides = CapabilitySupport::Supported;
    capabilities.observer.unsubscribe = CapabilitySupport::Supported;
    capabilities
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
