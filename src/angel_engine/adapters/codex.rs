use crate::angel_engine::capabilities::ConversationCapabilities;
use crate::angel_engine::error::ErrorInfo;
use crate::angel_engine::event::EngineEvent;
use crate::angel_engine::ids::ConversationId;
use crate::angel_engine::state::{
    ActionPhase, ConversationLifecycle, ElicitationKind, ExhaustionReason, TurnOutcome,
};

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

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CodexThreadStatus {
    NotLoaded,
    Idle,
    Active {
        waiting_on_approval: bool,
        waiting_on_user_input: bool,
    },
    SystemError,
}

impl From<CodexThreadStatus> for ConversationLifecycle {
    fn from(value: CodexThreadStatus) -> Self {
        match value {
            CodexThreadStatus::NotLoaded => Self::Discovered,
            CodexThreadStatus::Idle => Self::Idle,
            CodexThreadStatus::Active { .. } => Self::Active,
            CodexThreadStatus::SystemError => Self::Faulted(ErrorInfo::new(
                "codex.system_error",
                "thread entered systemError",
            )),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CodexTurnStatus {
    Completed,
    Interrupted,
    Failed,
    InProgress,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CodexItemStatus {
    InProgress,
    Completed,
    Failed,
    Declined,
    Interrupted,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CodexErrorKind {
    ContextWindowExceeded,
    UsageLimitExceeded,
    Other,
}

impl From<CodexErrorKind> for ExhaustionReason {
    fn from(value: CodexErrorKind) -> Self {
        match value {
            CodexErrorKind::ContextWindowExceeded => Self::ContextWindow,
            CodexErrorKind::UsageLimitExceeded => Self::UsageLimit,
            CodexErrorKind::Other => Self::Other("codex".to_string()),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CodexServerRequestKind {
    CommandApproval,
    FileChangeApproval,
    PermissionsApproval,
    ToolUserInput,
    McpForm,
    McpUrl,
    DynamicToolCall,
}
