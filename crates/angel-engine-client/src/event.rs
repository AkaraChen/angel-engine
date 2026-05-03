use angel_engine::{
    ContentDelta, EngineEvent, JsonRpcMessage, RuntimeState, TransportLog, TransportLogKind,
};
use serde::{Deserialize, Serialize};

use crate::error::ClientResult;
use crate::snapshot::{
    ActionSnapshot, ContentChunk, ConversationSnapshot, ElicitationSnapshot, SessionUsageSnapshot,
    conversation_snapshot, runtime_auth_methods,
};

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientUpdate {
    #[serde(default)]
    pub outgoing: Vec<JsonRpcOutbound>,
    #[serde(default)]
    pub events: Vec<ClientEvent>,
    #[serde(default)]
    pub logs: Vec<ClientLog>,
    #[serde(default)]
    pub completed_request_ids: Vec<String>,
}

impl ClientUpdate {
    pub fn is_empty(&self) -> bool {
        self.outgoing.is_empty()
            && self.events.is_empty()
            && self.logs.is_empty()
            && self.completed_request_ids.is_empty()
    }

    pub fn merge(&mut self, mut other: Self) {
        self.outgoing.append(&mut other.outgoing);
        self.events.append(&mut other.events);
        self.logs.append(&mut other.logs);
        self.completed_request_ids
            .append(&mut other.completed_request_ids);
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonRpcOutbound {
    pub value: serde_json::Value,
    pub line: String,
}

impl JsonRpcOutbound {
    pub(crate) fn from_message(message: &JsonRpcMessage) -> ClientResult<Self> {
        Ok(Self {
            value: message.to_value(),
            line: message.to_json_line()?,
        })
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientLog {
    pub kind: ClientLogKind,
    pub message: String,
}

impl From<&TransportLog> for ClientLog {
    fn from(log: &TransportLog) -> Self {
        Self {
            kind: match log.kind {
                TransportLogKind::Send => ClientLogKind::Send,
                TransportLogKind::Receive => ClientLogKind::Receive,
                TransportLogKind::State => ClientLogKind::State,
                TransportLogKind::Output => ClientLogKind::Output,
                TransportLogKind::Warning => ClientLogKind::Warning,
                TransportLogKind::Error => ClientLogKind::Error,
            },
            message: log.message.clone(),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ClientLogKind {
    Send,
    Receive,
    State,
    Output,
    Warning,
    Error,
    ProcessStdout,
    ProcessStderr,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ClientEvent {
    Log {
        log: ClientLog,
    },
    RuntimeAuthRequired {
        methods: Vec<RuntimeAuthMethod>,
    },
    RuntimeReady {
        name: String,
        version: Option<String>,
    },
    RuntimeFaulted {
        code: String,
        message: String,
    },
    ConversationDiscovered {
        conversation: ConversationSnapshot,
    },
    ConversationReady {
        conversation: ConversationSnapshot,
    },
    ConversationUpdated {
        conversation_id: String,
    },
    AvailableCommandsUpdated {
        conversation_id: String,
        count: usize,
    },
    SessionUsageUpdated {
        conversation_id: String,
        usage: SessionUsageSnapshot,
    },
    TurnStarted {
        conversation_id: String,
        turn_id: String,
    },
    TurnSteered {
        conversation_id: String,
        turn_id: String,
    },
    AssistantDelta {
        conversation_id: String,
        turn_id: String,
        content: ContentChunk,
    },
    ReasoningDelta {
        conversation_id: String,
        turn_id: String,
        content: ContentChunk,
    },
    PlanDelta {
        conversation_id: String,
        turn_id: String,
        content: ContentChunk,
    },
    PlanUpdated {
        conversation_id: String,
        turn_id: String,
    },
    TurnTerminal {
        conversation_id: String,
        turn_id: String,
        outcome: String,
    },
    ActionObserved {
        conversation_id: String,
        action: ActionSnapshot,
    },
    ActionUpdated {
        conversation_id: String,
        action: ActionSnapshot,
    },
    ElicitationOpened {
        conversation_id: String,
        elicitation: ElicitationSnapshot,
    },
    ElicitationUpdated {
        conversation_id: String,
        elicitation: ElicitationSnapshot,
    },
    ContextUpdated {
        conversation_id: String,
    },
    HistoryUpdated {
        conversation_id: String,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeAuthMethod {
    pub id: String,
    pub label: String,
}

pub(crate) fn events_from_engine_event(
    engine: &angel_engine::AngelEngine,
    event: &EngineEvent,
) -> Vec<ClientEvent> {
    match event {
        EngineEvent::RuntimeNegotiated { .. } => match &engine.runtime {
            RuntimeState::Available { capabilities } => vec![ClientEvent::RuntimeReady {
                name: capabilities.name.clone(),
                version: capabilities.version.clone(),
            }],
            _ => Vec::new(),
        },
        EngineEvent::RuntimeAuthRequired { .. } => vec![ClientEvent::RuntimeAuthRequired {
            methods: runtime_auth_methods(&engine.runtime),
        }],
        EngineEvent::RuntimeFaulted { error } => vec![ClientEvent::RuntimeFaulted {
            code: error.code.clone(),
            message: error.message.clone(),
        }],
        EngineEvent::ConversationDiscovered { id, .. } => engine
            .conversations
            .get(id)
            .map(conversation_snapshot)
            .map(|conversation| vec![ClientEvent::ConversationDiscovered { conversation }])
            .unwrap_or_default(),
        EngineEvent::ConversationReady { id, .. } => engine
            .conversations
            .get(id)
            .map(conversation_snapshot)
            .map(|conversation| vec![ClientEvent::ConversationReady { conversation }])
            .unwrap_or_default(),
        EngineEvent::ConversationProvisionStarted { id, .. }
        | EngineEvent::ConversationHydrationStarted { id, .. }
        | EngineEvent::ConversationStatusChanged { id, .. }
        | EngineEvent::ConversationClosed { id } => vec![ClientEvent::ConversationUpdated {
            conversation_id: id.to_string(),
        }],
        EngineEvent::AvailableCommandsUpdated {
            conversation_id,
            commands,
        } => vec![ClientEvent::AvailableCommandsUpdated {
            conversation_id: conversation_id.to_string(),
            count: commands.len(),
        }],
        EngineEvent::SessionConfigOptionsUpdated {
            conversation_id, ..
        }
        | EngineEvent::SessionModesUpdated {
            conversation_id, ..
        }
        | EngineEvent::SessionModeChanged {
            conversation_id, ..
        }
        | EngineEvent::SessionModelsUpdated {
            conversation_id, ..
        }
        | EngineEvent::ContextUpdated {
            conversation_id, ..
        }
        | EngineEvent::ObserverChanged {
            conversation_id, ..
        } => vec![ClientEvent::ContextUpdated {
            conversation_id: conversation_id.to_string(),
        }],
        EngineEvent::SessionUsageUpdated {
            conversation_id,
            usage,
        } => vec![ClientEvent::SessionUsageUpdated {
            conversation_id: conversation_id.to_string(),
            usage: usage.into(),
        }],
        EngineEvent::ConversationDiscoveryPage { .. } => Vec::new(),
        EngineEvent::TurnStarted {
            conversation_id,
            turn_id,
            ..
        } => vec![ClientEvent::TurnStarted {
            conversation_id: conversation_id.to_string(),
            turn_id: turn_id.to_string(),
        }],
        EngineEvent::TurnSteered {
            conversation_id,
            turn_id,
            ..
        } => vec![ClientEvent::TurnSteered {
            conversation_id: conversation_id.to_string(),
            turn_id: turn_id.to_string(),
        }],
        EngineEvent::AssistantDelta {
            conversation_id,
            turn_id,
            delta,
        } => vec![ClientEvent::AssistantDelta {
            conversation_id: conversation_id.to_string(),
            turn_id: turn_id.to_string(),
            content: content_chunk(delta),
        }],
        EngineEvent::ReasoningDelta {
            conversation_id,
            turn_id,
            delta,
        } => vec![ClientEvent::ReasoningDelta {
            conversation_id: conversation_id.to_string(),
            turn_id: turn_id.to_string(),
            content: content_chunk(delta),
        }],
        EngineEvent::PlanDelta {
            conversation_id,
            turn_id,
            delta,
        } => vec![ClientEvent::PlanDelta {
            conversation_id: conversation_id.to_string(),
            turn_id: turn_id.to_string(),
            content: content_chunk(delta),
        }],
        EngineEvent::PlanUpdated {
            conversation_id,
            turn_id,
            ..
        }
        | EngineEvent::PlanPathUpdated {
            conversation_id,
            turn_id,
            ..
        } => vec![ClientEvent::PlanUpdated {
            conversation_id: conversation_id.to_string(),
            turn_id: turn_id.to_string(),
        }],
        EngineEvent::TurnTerminal {
            conversation_id,
            turn_id,
            outcome,
        } => vec![ClientEvent::TurnTerminal {
            conversation_id: conversation_id.to_string(),
            turn_id: turn_id.to_string(),
            outcome: format!("{outcome:?}"),
        }],
        EngineEvent::ActionObserved {
            conversation_id,
            action,
        } => vec![ClientEvent::ActionObserved {
            conversation_id: conversation_id.to_string(),
            action: action.into(),
        }],
        EngineEvent::ActionUpdated {
            conversation_id,
            action_id,
            ..
        } => engine
            .conversations
            .get(conversation_id)
            .and_then(|conversation| conversation.actions.get(action_id))
            .map(ActionSnapshot::from)
            .map(|action| {
                vec![ClientEvent::ActionUpdated {
                    conversation_id: conversation_id.to_string(),
                    action,
                }]
            })
            .unwrap_or_default(),
        EngineEvent::ElicitationOpened {
            conversation_id,
            elicitation,
        } => vec![ClientEvent::ElicitationOpened {
            conversation_id: conversation_id.to_string(),
            elicitation: elicitation.into(),
        }],
        EngineEvent::ElicitationResolving {
            conversation_id,
            elicitation_id,
        }
        | EngineEvent::ElicitationResolved {
            conversation_id,
            elicitation_id,
            ..
        }
        | EngineEvent::ElicitationCancelled {
            conversation_id,
            elicitation_id,
        } => engine
            .conversations
            .get(conversation_id)
            .and_then(|conversation| conversation.elicitations.get(elicitation_id))
            .map(ElicitationSnapshot::from)
            .map(|elicitation| {
                vec![ClientEvent::ElicitationUpdated {
                    conversation_id: conversation_id.to_string(),
                    elicitation,
                }]
            })
            .unwrap_or_default(),
        EngineEvent::HistoryMutationStarted {
            conversation_id, ..
        }
        | EngineEvent::HistoryMutationFinished {
            conversation_id, ..
        }
        | EngineEvent::HistoryReplayChunk {
            conversation_id, ..
        } => vec![ClientEvent::HistoryUpdated {
            conversation_id: conversation_id.to_string(),
        }],
    }
}

pub(crate) fn log_event(log: ClientLog) -> ClientEvent {
    ClientEvent::Log { log }
}

fn content_chunk(delta: &ContentDelta) -> ContentChunk {
    delta.into()
}
