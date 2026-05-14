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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CodexCollaborationMode {
    Default,
    Plan,
}

impl CodexCollaborationMode {
    pub const ALL: [Self; 2] = [Self::Default, Self::Plan];

    pub fn from_id(value: &str) -> Option<Self> {
        match value {
            "default" => Some(Self::Default),
            "plan" => Some(Self::Plan),
            _ => None,
        }
    }

    pub fn id(self) -> &'static str {
        match self {
            Self::Default => "default",
            Self::Plan => "plan",
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            Self::Default => "Default",
            Self::Plan => "Plan",
        }
    }

    pub fn description(self) -> Option<&'static str> {
        match self {
            Self::Default => None,
            Self::Plan => Some("Plan before making changes."),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CodexPermissionMode {
    Untrusted,
    OnFailure,
    OnRequest,
    Never,
}

impl CodexPermissionMode {
    pub const ALL: [Self; 4] = [
        Self::Untrusted,
        Self::OnFailure,
        Self::OnRequest,
        Self::Never,
    ];

    pub fn from_id(value: &str) -> Option<Self> {
        match value {
            "untrusted" => Some(Self::Untrusted),
            "on-failure" => Some(Self::OnFailure),
            "on-request" => Some(Self::OnRequest),
            "never" => Some(Self::Never),
            _ => None,
        }
    }

    pub fn from_approval_policy(policy: &angel_engine::ApprovalPolicy) -> Self {
        match policy {
            angel_engine::ApprovalPolicy::Never => Self::Never,
            angel_engine::ApprovalPolicy::OnRequest => Self::OnRequest,
            angel_engine::ApprovalPolicy::OnFailure => Self::OnFailure,
            angel_engine::ApprovalPolicy::UnlessTrusted => Self::Untrusted,
        }
    }

    pub fn id(self) -> &'static str {
        match self {
            Self::Untrusted => "untrusted",
            Self::OnFailure => "on-failure",
            Self::OnRequest => "on-request",
            Self::Never => "never",
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            Self::Untrusted => "Untrusted",
            Self::OnFailure => "On Failure",
            Self::OnRequest => "On Request",
            Self::Never => "Never",
        }
    }

    pub fn description(self) -> Option<&'static str> {
        match self {
            Self::Untrusted => Some("Ask before commands outside the trusted set."),
            Self::OnFailure => Some("Only ask after a command fails."),
            Self::OnRequest => Some("Let the agent request approval when needed."),
            Self::Never => Some("Do not ask for approval."),
        }
    }
}
