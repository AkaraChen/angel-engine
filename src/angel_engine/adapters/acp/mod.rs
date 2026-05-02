use crate::angel_engine::capabilities::ConversationCapabilities;
use crate::angel_engine::error::ErrorInfo;
use crate::angel_engine::event::EngineEvent;
use crate::angel_engine::ids::{
    ActionId, ConversationId, ElicitationId, JsonRpcRequestId, RemoteConversationId,
    RemoteRequestId, TurnId,
};
use crate::angel_engine::protocol::{AcpMethod, ProtocolMethod};
use crate::angel_engine::reducer::{AngelEngine, PendingRequest};
use crate::angel_engine::state::{
    ActionInput, ActionKind, ActionOutputDelta, ActionPatch, ActionPhase, ActionState,
    ContentDelta, ContextPatch, ElicitationKind, ElicitationOptions, ElicitationState,
    ExhaustionReason, PlanEntry, PlanEntryStatus, PlanState, TurnOutcome,
};
use crate::angel_engine::transport::{
    JsonRpcMessage, ProtocolTransport, TransportLogKind, TransportOptions, TransportOutput,
    client_info_json, method_name,
};
use serde_json::{Value, json};

mod encode;
mod helpers;
mod notifications;
mod requests;
mod response;
mod transport;
mod types;

pub use types::*;

#[derive(Clone, Debug)]
pub struct AcpAdapter {
    capabilities: ConversationCapabilities,
}

impl AcpAdapter {
    pub fn standard() -> Self {
        Self {
            capabilities: ConversationCapabilities::acp_standard(),
        }
    }

    pub fn with_steer_extension(name: impl Into<String>) -> Self {
        let mut adapter = Self::standard();
        adapter.capabilities.turn.steer =
            crate::angel_engine::CapabilitySupport::Extension { name: name.into() };
        adapter
    }

    pub fn capabilities(&self) -> ConversationCapabilities {
        self.capabilities.clone()
    }

    pub fn stop_reason_event(
        &self,
        conversation_id: ConversationId,
        turn_id: TurnId,
        reason: AcpStopReason,
    ) -> EngineEvent {
        EngineEvent::TurnTerminal {
            conversation_id,
            turn_id,
            outcome: reason.into(),
        }
    }

    pub fn tool_status_to_phase(status: AcpToolStatus) -> ActionPhase {
        match status {
            AcpToolStatus::Pending => ActionPhase::Proposed,
            AcpToolStatus::InProgress => ActionPhase::Running,
            AcpToolStatus::Completed => ActionPhase::Completed,
            AcpToolStatus::Failed => ActionPhase::Failed,
        }
    }
}
