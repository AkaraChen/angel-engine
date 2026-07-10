use std::collections::BTreeMap;

use angel_engine::RuntimeState;
use serde::{Deserialize, Serialize};

use crate::event::RuntimeAuthMethod;

use super::conversation::{ConversationSnapshot, conversation_snapshot};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientSnapshot {
    pub runtime: RuntimeSnapshot,
    pub selected_conversation_id: Option<String>,
    pub conversations: Vec<ConversationSnapshot>,
}

impl From<&angel_engine::AngelEngine> for ClientSnapshot {
    fn from(engine: &angel_engine::AngelEngine) -> Self {
        Self {
            runtime: RuntimeSnapshot::from(&engine.runtime),
            selected_conversation_id: engine.selected.as_ref().map(ToString::to_string),
            conversations: engine
                .conversations
                .values()
                .map(conversation_snapshot)
                .collect(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum RuntimeSnapshot {
    Offline,
    Connecting,
    Negotiating,
    AwaitingAuth {
        methods: Vec<RuntimeAuthMethod>,
    },
    Available {
        name: String,
        version: Option<String>,
        metadata: BTreeMap<String, String>,
    },
    Faulted {
        code: String,
        message: String,
        recoverable: bool,
    },
}

impl From<&RuntimeState> for RuntimeSnapshot {
    fn from(runtime: &RuntimeState) -> Self {
        match runtime {
            RuntimeState::Offline => Self::Offline,
            RuntimeState::Connecting => Self::Connecting,
            RuntimeState::Negotiating => Self::Negotiating,
            RuntimeState::AwaitingAuth { methods } => Self::AwaitingAuth {
                methods: methods
                    .iter()
                    .map(|method| RuntimeAuthMethod {
                        id: method.id.to_string(),
                        label: method.label.clone(),
                    })
                    .collect(),
            },
            RuntimeState::Available { capabilities } => Self::Available {
                name: capabilities.name.clone(),
                version: capabilities.version.clone(),
                metadata: capabilities.metadata.clone(),
            },
            RuntimeState::Faulted(error) => Self::Faulted {
                code: error.code.clone(),
                message: error.message.clone(),
                recoverable: error.recoverable,
            },
        }
    }
}
pub(crate) fn runtime_auth_methods(runtime: &RuntimeState) -> Vec<RuntimeAuthMethod> {
    match runtime {
        RuntimeState::AwaitingAuth { methods } => methods
            .iter()
            .map(|method| RuntimeAuthMethod {
                id: method.id.to_string(),
                label: method.label.clone(),
            })
            .collect(),
        _ => Vec::new(),
    }
}
