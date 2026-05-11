use std::collections::BTreeMap;

use crate::ids::{ConversationId, JsonRpcRequestId, TurnId};

#[derive(serde::Serialize, serde::Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProtocolFlavor {
    Acp,
    CodexAppServer,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct ProtocolEffect {
    pub flavor: ProtocolFlavor,
    pub method: ProtocolMethod,
    pub request_id: Option<JsonRpcRequestId>,
    pub conversation_id: Option<ConversationId>,
    pub turn_id: Option<TurnId>,
    pub payload: EffectPayload,
}

impl ProtocolEffect {
    pub fn new(flavor: ProtocolFlavor, method: ProtocolMethod) -> Self {
        Self {
            flavor,
            method,
            request_id: None,
            conversation_id: None,
            turn_id: None,
            payload: EffectPayload::default(),
        }
    }

    pub fn request_id(mut self, request_id: JsonRpcRequestId) -> Self {
        self.request_id = Some(request_id);
        self
    }

    pub fn conversation_id(mut self, conversation_id: ConversationId) -> Self {
        self.conversation_id = Some(conversation_id);
        self
    }

    pub fn turn_id(mut self, turn_id: TurnId) -> Self {
        self.turn_id = Some(turn_id);
        self
    }

    pub fn field(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.payload.fields.insert(key.into(), value.into());
        self
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub enum ProtocolMethod {
    Initialize,
    Authenticate,
    ListConversations,
    StartConversation,
    ResumeConversation,
    ForkConversation,
    StartTurn,
    SteerTurn,
    CancelTurn,
    ResolveElicitation,
    ArchiveConversation,
    UnarchiveConversation,
    CompactHistory,
    RollbackHistory,
    InjectHistoryItems,
    CloseConversation,
    Unsubscribe,
    SetSessionModel,
    SetSessionMode,
    SetSessionConfigOption,
    RunShellCommand,
    Extension(String),
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct EffectPayload {
    pub fields: BTreeMap<String, String>,
}
