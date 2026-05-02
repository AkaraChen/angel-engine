use crate::capabilities::ConversationCapabilities;
use crate::error::ErrorInfo;
use crate::event::EngineEvent;
use crate::ids::{
    ActionId, ConversationId, ElicitationId, JsonRpcRequestId, RemoteActionId,
    RemoteConversationId, RemoteRequestId, RemoteTurnId, TurnId,
};
use crate::protocol::{CodexMethod, ProtocolMethod};
use crate::reducer::{AngelEngine, PendingRequest};
use crate::state::{
    ActionInput, ActionKind, ActionOutputDelta, ActionPatch, ActionPhase, ActionState,
    ContentDelta, ContextPatch, ConversationLifecycle, ElicitationKind, ElicitationOptions,
    ElicitationState, ExhaustionReason, PlanEntry, PlanEntryStatus, PlanState, TurnOutcome,
    UserQuestion, UserQuestionOption,
};
use crate::transport::{
    JsonRpcMessage, ProtocolTransport, TransportLogKind, TransportOptions, TransportOutput,
    client_info_json, method_name,
};
use serde_json::{Value, json};

mod actions;
mod encode;
mod ids;
mod notifications;
mod protocol_helpers;
mod requests;
mod response;
mod summaries;
mod transport;
mod types;

pub use types::*;

#[derive(Clone, Debug)]
pub struct CodexAdapter {
    capabilities: ConversationCapabilities,
}

impl CodexAdapter {
    pub fn app_server() -> Self {
        Self {
            capabilities: ConversationCapabilities::codex_app_server(),
        }
    }

    pub fn capabilities(&self) -> ConversationCapabilities {
        self.capabilities.clone()
    }

    pub fn thread_status_event(
        &self,
        conversation_id: ConversationId,
        status: CodexThreadStatus,
    ) -> EngineEvent {
        EngineEvent::ConversationStatusChanged {
            id: conversation_id,
            lifecycle: status.into(),
        }
    }

    pub fn turn_status_to_outcome(
        status: CodexTurnStatus,
        error: Option<ErrorInfo>,
    ) -> TurnOutcome {
        match status {
            CodexTurnStatus::Completed => error.map_or(TurnOutcome::Succeeded, TurnOutcome::Failed),
            CodexTurnStatus::Interrupted => TurnOutcome::Interrupted,
            CodexTurnStatus::Failed => TurnOutcome::Failed(
                error.unwrap_or_else(|| ErrorInfo::new("codex.turn_failed", "turn failed")),
            ),
            CodexTurnStatus::InProgress => TurnOutcome::Failed(ErrorInfo::new(
                "codex.invalid_terminal",
                "inProgress is not a terminal turn status",
            )),
        }
    }

    pub fn item_status_to_phase(status: CodexItemStatus) -> ActionPhase {
        match status {
            CodexItemStatus::InProgress => ActionPhase::Running,
            CodexItemStatus::Completed => ActionPhase::Completed,
            CodexItemStatus::Failed => ActionPhase::Failed,
            CodexItemStatus::Declined => ActionPhase::Declined,
            CodexItemStatus::Interrupted => ActionPhase::Cancelled,
        }
    }

    pub fn server_request_kind(request: CodexServerRequestKind) -> ElicitationKind {
        match request {
            CodexServerRequestKind::CommandApproval
            | CodexServerRequestKind::FileChangeApproval => ElicitationKind::Approval,
            CodexServerRequestKind::PermissionsApproval => ElicitationKind::PermissionProfile,
            CodexServerRequestKind::ToolUserInput => ElicitationKind::UserInput,
            CodexServerRequestKind::McpForm => ElicitationKind::UserInput,
            CodexServerRequestKind::McpUrl => ElicitationKind::ExternalFlow,
            CodexServerRequestKind::DynamicToolCall => ElicitationKind::DynamicToolCall,
        }
    }
}
