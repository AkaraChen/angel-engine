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
    pub additional_directories: Vec<String>,
    pub cursor: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct StartConversationParams {
    pub cwd: Option<String>,
    pub additional_directories: Vec<String>,
    pub context: ContextPatch,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ResumeTarget {
    Conversation(ConversationId),
    Remote {
        id: String,
        hydrate: bool,
    },
    RemoteWithContext {
        id: String,
        hydrate: bool,
        additional_directories: Vec<String>,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UserInput {
    pub content: String,
    pub kind: UserInputKind,
}

impl UserInput {
    pub fn text(value: impl Into<String>) -> Self {
        Self {
            content: value.into(),
            kind: UserInputKind::Text,
        }
    }

    pub fn resource_link(name: impl Into<String>, uri: impl Into<String>) -> Self {
        let uri = uri.into();
        Self {
            content: uri.clone(),
            kind: UserInputKind::ResourceLink {
                name: name.into(),
                uri,
                mime_type: None,
                title: None,
                description: None,
            },
        }
    }

    pub fn embedded_text_resource(
        uri: impl Into<String>,
        text: impl Into<String>,
        mime_type: Option<String>,
    ) -> Self {
        Self {
            content: text.into(),
            kind: UserInputKind::EmbeddedTextResource {
                uri: uri.into(),
                mime_type,
            },
        }
    }

    pub fn raw_content_block(value: serde_json::Value) -> Self {
        Self {
            content: value.to_string(),
            kind: UserInputKind::RawContentBlock(value.to_string()),
        }
    }

    pub fn image(
        data: impl Into<String>,
        mime_type: impl Into<String>,
        name: Option<String>,
    ) -> Self {
        let name = name.filter(|name| !name.trim().is_empty());
        Self {
            content: name.clone().unwrap_or_else(|| "image".to_string()),
            kind: UserInputKind::Image {
                data: data.into(),
                mime_type: mime_type.into(),
                name,
            },
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum UserInputKind {
    Text,
    ResourceLink {
        name: String,
        uri: String,
        mime_type: Option<String>,
        title: Option<String>,
        description: Option<String>,
    },
    EmbeddedTextResource {
        uri: String,
        mime_type: Option<String>,
    },
    Image {
        data: String,
        mime_type: String,
        name: Option<String>,
    },
    RawContentBlock(String),
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct TurnOverrides {
    pub context: ContextPatch,
}
