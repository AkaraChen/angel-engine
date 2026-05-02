use crate::ids::{ConversationId, ElicitationId, TurnId};
use crate::state::{ContextPatch, HistoryMutationOp};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum EngineCommand {
    Initialize,
    Authenticate {
        method: crate::AuthMethodId,
    },
    DiscoverConversations {
        params: DiscoverConversationsParams,
    },
    StartConversation {
        params: StartConversationParams,
    },
    ResumeConversation {
        target: ResumeTarget,
    },
    StartTurn {
        conversation_id: ConversationId,
        input: Vec<UserInput>,
        overrides: TurnOverrides,
    },
    CancelTurn {
        conversation_id: ConversationId,
        turn_id: Option<TurnId>,
    },
    ResolveElicitation {
        conversation_id: ConversationId,
        elicitation_id: ElicitationId,
        decision: crate::ElicitationDecision,
    },
    UpdateContext {
        conversation_id: ConversationId,
        patch: ContextPatch,
    },
    Extension(EngineExtensionCommand),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum EngineExtensionCommand {
    ForkConversation {
        source: ConversationId,
        at: Option<TurnId>,
    },
    SteerTurn {
        conversation_id: ConversationId,
        turn_id: Option<TurnId>,
        input: Vec<UserInput>,
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
pub struct DiscoverConversationsParams {
    pub cwd: Option<String>,
    pub cursor: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct StartConversationParams {
    pub cwd: Option<String>,
    pub context: ContextPatch,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ResumeTarget {
    Conversation(ConversationId),
    Remote { id: String, hydrate: bool },
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
}
