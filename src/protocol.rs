use std::collections::BTreeMap;

use crate::ids::{ConversationId, JsonRpcRequestId, TurnId};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProtocolFlavor {
    Acp,
    CodexAppServer,
}

#[derive(Clone, Debug, PartialEq, Eq)]
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

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ProtocolMethod {
    Acp(AcpMethod),
    Codex(CodexMethod),
    Extension(String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum AcpMethod {
    Initialize,
    Authenticate,
    SessionList,
    SessionNew,
    SessionLoad,
    SessionResume,
    SessionPrompt,
    SessionCancel,
    SessionClose,
    SetSessionMode,
    SetSessionConfigOption,
    RequestPermissionResponse,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CodexMethod {
    Initialize,
    Initialized,
    ThreadList,
    ThreadStart,
    ThreadResume,
    ThreadFork,
    ThreadArchive,
    ThreadUnarchive,
    ThreadUnsubscribe,
    ThreadCompactStart,
    ThreadRollback,
    ThreadInjectItems,
    TurnStart,
    TurnSteer,
    TurnInterrupt,
    ServerRequestResponse,
    ThreadGoalSet,
    ThreadGoalClear,
    ThreadMemoryModeSet,
    ThreadShellCommand,
    ConfigWrite,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct EffectPayload {
    pub fields: BTreeMap<String, String>,
}
