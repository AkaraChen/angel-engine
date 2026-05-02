use crate::angel_engine::capabilities::ConversationCapabilities;
use crate::angel_engine::event::EngineEvent;
use crate::angel_engine::ids::{ConversationId, TurnId};
use crate::angel_engine::state::{ActionPhase, ExhaustionReason, TurnOutcome};

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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AcpStopReason {
    EndTurn,
    MaxTokens,
    MaxTurnRequests,
    Refusal,
    Cancelled,
}

impl From<AcpStopReason> for TurnOutcome {
    fn from(value: AcpStopReason) -> Self {
        match value {
            AcpStopReason::EndTurn => Self::Succeeded,
            AcpStopReason::MaxTokens => Self::Exhausted {
                reason: ExhaustionReason::MaxTokens,
            },
            AcpStopReason::MaxTurnRequests => Self::Exhausted {
                reason: ExhaustionReason::MaxTurnRequests,
            },
            AcpStopReason::Refusal => Self::Refused,
            AcpStopReason::Cancelled => Self::Interrupted,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AcpToolStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
}
