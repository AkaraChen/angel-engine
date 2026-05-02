use std::collections::BTreeMap;

use crate::ids::{ConversationId, JsonRpcRequestId, TurnId};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProtocolFlavor {
    Acp,
    CodexAppServer,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProtocolEffect {
    pub(crate) flavor: ProtocolFlavor,
    pub(crate) method: ProtocolMethod,
    pub(crate) request_id: Option<JsonRpcRequestId>,
    pub(crate) conversation_id: Option<ConversationId>,
    pub(crate) turn_id: Option<TurnId>,
    pub(crate) payload: EffectPayload,
}

impl ProtocolEffect {
    pub(crate) fn new(flavor: ProtocolFlavor, method: ProtocolMethod) -> Self {
        Self {
            flavor,
            method,
            request_id: None,
            conversation_id: None,
            turn_id: None,
            payload: EffectPayload::default(),
        }
    }

    pub(crate) fn request_id(mut self, request_id: JsonRpcRequestId) -> Self {
        self.request_id = Some(request_id);
        self
    }

    pub(crate) fn conversation_id(mut self, conversation_id: ConversationId) -> Self {
        self.conversation_id = Some(conversation_id);
        self
    }

    pub(crate) fn turn_id(mut self, turn_id: TurnId) -> Self {
        self.turn_id = Some(turn_id);
        self
    }

    pub(crate) fn field(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.payload.fields.insert(key.into(), value.into());
        self
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum ProtocolMethod {
    Acp(AcpMethod),
    Codex(CodexMethod),
    Extension(String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum AcpMethod {
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
    SetSessionModel,
    RequestPermissionResponse,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum CodexMethod {
    Initialize,
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
    ThreadShellCommand,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(crate) struct EffectPayload {
    pub(crate) fields: BTreeMap<String, String>,
}
