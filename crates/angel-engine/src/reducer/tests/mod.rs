use crate::capabilities::{
    ActionCapabilities, CapabilitySupport, ConversationCapabilities, ContextCapabilities,
    ElicitationCapabilities, HistoryCapabilities, LifecycleCapabilities, ObserverCapabilities,
    RuntimeCapabilities, TurnCapabilities,
};
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
    ConversationCapabilities {
        lifecycle: LifecycleCapabilities {
            create: CapabilitySupport::Supported,
            list: CapabilitySupport::Supported,
            load: CapabilitySupport::Unknown,
            resume: CapabilitySupport::Unknown,
            fork: CapabilitySupport::Unsupported,
            archive: CapabilitySupport::Unsupported,
            close: CapabilitySupport::Unknown,
        },
        turn: TurnCapabilities {
            start: CapabilitySupport::Supported,
            steer: CapabilitySupport::Unsupported,
            cancel: CapabilitySupport::Supported,
            max_active_turns: 1,
            requires_expected_turn_id_for_steer: false,
        },
        action: ActionCapabilities {
            observe: CapabilitySupport::Supported,
            stream_output: CapabilitySupport::Supported,
            decline: CapabilitySupport::Supported,
        },
        elicitation: ElicitationCapabilities {
            approval: CapabilitySupport::Supported,
            user_input: CapabilitySupport::Unknown,
            external_flow: CapabilitySupport::Unknown,
            dynamic_tool_call: CapabilitySupport::Unknown,
        },
        history: HistoryCapabilities {
            hydrate: CapabilitySupport::Unknown,
            compact: CapabilitySupport::Unsupported,
            rollback: CapabilitySupport::Unsupported,
            inject_items: CapabilitySupport::Unsupported,
        },
        context: ContextCapabilities {
            mode: CapabilitySupport::Supported,
            config: CapabilitySupport::Unknown,
            additional_directories: CapabilitySupport::Unknown,
            turn_overrides: CapabilitySupport::Unsupported,
            explicit_context_updates: CapabilitySupport::Supported,
            model: CapabilitySupport::Supported,
        },
        observer: ObserverCapabilities {
            unsubscribe: CapabilitySupport::Unsupported,
        },
    }
}

pub(super) fn acp_capabilities_with_steer_extension(name: &str) -> ConversationCapabilities {
    let mut capabilities = acp_capabilities();
    capabilities.turn.steer = CapabilitySupport::Extension {
        name: name.to_string(),
    };
    capabilities
}

pub(super) fn codex_capabilities() -> ConversationCapabilities {
    ConversationCapabilities {
        lifecycle: LifecycleCapabilities {
            create: CapabilitySupport::Supported,
            list: CapabilitySupport::Supported,
            load: CapabilitySupport::Supported,
            resume: CapabilitySupport::Supported,
            fork: CapabilitySupport::Supported,
            archive: CapabilitySupport::Supported,
            close: CapabilitySupport::Unknown,
        },
        turn: TurnCapabilities {
            start: CapabilitySupport::Supported,
            steer: CapabilitySupport::Supported,
            cancel: CapabilitySupport::Supported,
            max_active_turns: 1,
            requires_expected_turn_id_for_steer: true,
        },
        action: ActionCapabilities {
            observe: CapabilitySupport::Supported,
            stream_output: CapabilitySupport::Supported,
            decline: CapabilitySupport::Supported,
        },
        elicitation: ElicitationCapabilities {
            approval: CapabilitySupport::Supported,
            user_input: CapabilitySupport::Supported,
            external_flow: CapabilitySupport::Supported,
            dynamic_tool_call: CapabilitySupport::Supported,
        },
        history: HistoryCapabilities {
            hydrate: CapabilitySupport::Supported,
            compact: CapabilitySupport::Supported,
            rollback: CapabilitySupport::Supported,
            inject_items: CapabilitySupport::Supported,
        },
        context: ContextCapabilities {
            mode: CapabilitySupport::Supported,
            config: CapabilitySupport::Supported,
            additional_directories: CapabilitySupport::Unsupported,
            turn_overrides: CapabilitySupport::Supported,
            explicit_context_updates: CapabilitySupport::Unsupported,
            model: CapabilitySupport::Supported,
        },
        observer: ObserverCapabilities {
            unsubscribe: CapabilitySupport::Supported,
        },
    }
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
