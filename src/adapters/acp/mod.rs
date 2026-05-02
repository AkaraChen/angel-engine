use crate::capabilities::ConversationCapabilities;
use crate::error::ErrorInfo;
use crate::event::EngineEvent;
use crate::ids::{
    ActionId, ConversationId, ElicitationId, JsonRpcRequestId, RemoteConversationId,
    RemoteRequestId, TurnId,
};
use crate::protocol::{AcpMethod, ProtocolMethod};
use crate::reducer::{AngelEngine, PendingRequest};
use crate::state::{
    ActionInput, ActionKind, ActionOutputDelta, ActionPatch, ActionPhase, ActionState,
    ContentDelta, ContextPatch, ElicitationKind, ElicitationOptions, ElicitationState,
    ExhaustionReason, PlanEntry, PlanEntryStatus, PlanState, TurnOutcome,
};
use crate::transport::{
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
        adapter.capabilities.turn.steer = crate::CapabilitySupport::Extension { name: name.into() };
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
