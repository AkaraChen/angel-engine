use crate::ids::{ConversationId, JsonRpcRequestId, TurnId};
use crate::protocol::ProtocolEffect;

#[derive(Clone, Debug)]
pub struct EnginePolicy {
    pub invalid_event_policy: InvalidEventPolicy,
}

impl Default for EnginePolicy {
    fn default() -> Self {
        Self {
            invalid_event_policy: InvalidEventPolicy::StrictError,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InvalidEventPolicy {
    StrictError,
    IgnoreStale,
    RecordFault,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct CommandPlan {
    pub effects: Vec<ProtocolEffect>,
    pub conversation_id: Option<ConversationId>,
    pub turn_id: Option<TurnId>,
    pub request_id: Option<JsonRpcRequestId>,
}
