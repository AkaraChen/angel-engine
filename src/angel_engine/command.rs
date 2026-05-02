use crate::angel_engine::ids::{ConversationId, ElicitationId, TurnId};
use crate::angel_engine::state::{ContextPatch, HistoryMutationOp};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum EngineCommand {
    Initialize,
    Authenticate {
        method: crate::angel_engine::AuthMethodId,
    },
    DiscoverConversations,
    StartConversation {
        params: StartConversationParams,
    },
    ResumeConversation {
        target: ResumeTarget,
    },
    ForkConversation {
        source: ConversationId,
        at: Option<TurnId>,
    },
    StartTurn {
        conversation_id: ConversationId,
        input: Vec<UserInput>,
        overrides: TurnOverrides,
    },
    SteerTurn {
        conversation_id: ConversationId,
        turn_id: Option<TurnId>,
        input: Vec<UserInput>,
    },
    CancelTurn {
        conversation_id: ConversationId,
        turn_id: Option<TurnId>,
    },
    ResolveElicitation {
        conversation_id: ConversationId,
        elicitation_id: ElicitationId,
        decision: crate::angel_engine::ElicitationDecision,
    },
    UpdateContext {
        conversation_id: ConversationId,
        patch: ContextPatch,
    },
    MutateHistory {
        conversation_id: ConversationId,
        op: HistoryMutationOp,
    },
    RunShellCommand {
        conversation_id: ConversationId,
        command: String,
    },
    ArchiveConversation {
        conversation_id: ConversationId,
    },
    UnarchiveConversation {
        conversation_id: ConversationId,
    },
    CloseConversation {
        conversation_id: ConversationId,
    },
    Unsubscribe {
        conversation_id: ConversationId,
    },
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct StartConversationParams {
    pub cwd: Option<String>,
    pub service_name: Option<String>,
    pub context: ContextPatch,
    pub ephemeral: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ResumeTarget {
    Conversation(ConversationId),
    AcpSession {
        session_id: String,
        load_history: bool,
    },
    CodexThread {
        thread_id: String,
    },
    Path(String),
    History(String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UserInput {
    pub content: String,
}

impl UserInput {
    pub fn text(value: impl Into<String>) -> Self {
        Self {
            content: value.into(),
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct TurnOverrides {
    pub context: ContextPatch,
    pub user_message_id: Option<String>,
}
