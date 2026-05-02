use super::*;

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
