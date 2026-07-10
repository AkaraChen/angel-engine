use angel_engine::{JsonRpcMessage, TransportLog, TransportLogKind};
use serde::{Deserialize, Serialize};

use crate::error::ClientResult;
use crate::snapshot::{
    ActionOutputSnapshot, ActionSnapshot, ContentChunk, ConversationSnapshot, DisplayPlanSnapshot,
    ElicitationSnapshot, SessionUsageSnapshot,
};

mod projection;

pub(crate) use projection::{events_from_engine_event, log_event, stream_deltas_from_engine_event};

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientUpdate {
    #[serde(default)]
    pub outgoing: Vec<JsonRpcOutbound>,
    #[serde(default)]
    pub events: Vec<ClientEvent>,
    #[serde(default)]
    pub stream_deltas: Vec<ClientStreamDelta>,
    #[serde(default)]
    pub logs: Vec<ClientLog>,
    #[serde(default)]
    pub completed_request_ids: Vec<String>,
}

impl ClientUpdate {
    pub fn is_empty(&self) -> bool {
        self.outgoing.is_empty()
            && self.events.is_empty()
            && self.stream_deltas.is_empty()
            && self.logs.is_empty()
            && self.completed_request_ids.is_empty()
    }

    pub fn merge(&mut self, mut other: Self) {
        self.outgoing.append(&mut other.outgoing);
        self.events.append(&mut other.events);
        self.stream_deltas.append(&mut other.stream_deltas);
        self.logs.append(&mut other.logs);
        self.completed_request_ids
            .append(&mut other.completed_request_ids);
    }

    pub fn stream_deltas(&self) -> &[ClientStreamDelta] {
        &self.stream_deltas
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
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
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
    AvailableSkillsUpdated {
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
        plan: DisplayPlanSnapshot,
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

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ClientStreamDelta {
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
    ActionOutputDelta {
        conversation_id: String,
        turn_id: String,
        action_id: String,
        content: ActionOutputSnapshot,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeAuthMethod {
    pub id: String,
    pub label: String,
}
