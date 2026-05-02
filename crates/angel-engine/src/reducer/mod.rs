use std::collections::BTreeMap;

use crate::capabilities::ConversationCapabilities;
use crate::error::EngineError;
use crate::ids::{ConversationId, JsonRpcRequestId, TurnId};
use crate::protocol::ProtocolFlavor;
use crate::state::{ConversationDiscoveryState, ConversationState, RuntimeState};

mod action_events;
mod command_planning;
mod context_effects;
mod context_planning;
mod conversation_planning;
mod elicitation_events;
mod elicitation_planning;
mod event_dispatch;
mod event_helpers;
mod history_events;
mod history_planning;
mod methods;
mod pending;
mod turn_events;
mod turn_planning;
mod types;

pub use pending::{PendingRequest, PendingTable};
pub use types::{CommandPlan, EnginePolicy, InvalidEventPolicy};

#[cfg(test)]
mod tests;

#[derive(Clone, Debug)]
pub struct AngelEngine {
    pub runtime: RuntimeState,
    pub discovery: ConversationDiscoveryState,
    pub selected: Option<ConversationId>,
    pub conversations: BTreeMap<ConversationId, ConversationState>,
    pub pending: PendingTable,
    pub protocol: ProtocolFlavor,
    pub default_capabilities: ConversationCapabilities,
    pub policy: EnginePolicy,
    pub generation: u64,
    id_sequence: u64,
    request_sequence: u64,
    turn_sequence: u64,
}

impl AngelEngine {
    pub fn new(protocol: ProtocolFlavor, default_capabilities: ConversationCapabilities) -> Self {
        Self {
            runtime: RuntimeState::Offline,
            discovery: ConversationDiscoveryState::default(),
            selected: None,
            conversations: BTreeMap::new(),
            pending: PendingTable::default(),
            protocol,
            default_capabilities,
            policy: EnginePolicy::default(),
            generation: 0,
            id_sequence: 0,
            request_sequence: 0,
            turn_sequence: 0,
        }
    }

    pub fn with_available_runtime(
        protocol: ProtocolFlavor,
        runtime_capabilities: crate::RuntimeCapabilities,
        default_capabilities: ConversationCapabilities,
    ) -> Self {
        let mut engine = Self::new(protocol, default_capabilities);
        engine.runtime = RuntimeState::Available {
            capabilities: runtime_capabilities,
        };
        engine
    }

    fn conversation(
        &self,
        conversation_id: &ConversationId,
    ) -> Result<&ConversationState, EngineError> {
        self.conversations
            .get(conversation_id)
            .ok_or_else(|| EngineError::ConversationNotFound {
                conversation_id: conversation_id.to_string(),
            })
    }

    fn conversation_mut(
        &mut self,
        conversation_id: &ConversationId,
    ) -> Result<&mut ConversationState, EngineError> {
        self.conversations.get_mut(conversation_id).ok_or_else(|| {
            EngineError::ConversationNotFound {
                conversation_id: conversation_id.to_string(),
            }
        })
    }

    fn next_conversation_id(&mut self) -> ConversationId {
        self.id_sequence += 1;
        ConversationId::new(format!("conv-{}", self.id_sequence))
    }

    fn next_turn_id(&mut self) -> TurnId {
        self.id_sequence += 1;
        TurnId::new(format!("turn-{}", self.id_sequence))
    }

    fn next_request_id(&mut self) -> JsonRpcRequestId {
        self.request_sequence += 1;
        JsonRpcRequestId::new(format!("req-{}", self.request_sequence))
    }

    fn next_turn_sequence(&mut self) -> u64 {
        self.turn_sequence += 1;
        self.turn_sequence
    }
}
