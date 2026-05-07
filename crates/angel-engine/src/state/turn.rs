use crate::error::ErrorInfo;
use crate::ids::{ActionId, ElicitationId, RemoteTurnId, TurnId};

use super::*;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct TurnState {
    pub id: TurnId,
    pub remote: RemoteTurnId,
    pub phase: TurnPhase,
    pub input: Vec<UserInputRef>,
    pub output: OutputBuffer,
    pub reasoning: ReasoningBuffer,
    pub plan: Option<PlanState>,
    pub plan_text: OutputBuffer,
    pub plan_path: Option<String>,
    pub started_at: Timestamp,
    pub completed_at: Option<Timestamp>,
    pub outcome: Option<TurnOutcome>,
}

impl TurnState {
    pub fn new(id: TurnId, remote: RemoteTurnId, started_at: Timestamp) -> Self {
        Self {
            id,
            remote,
            phase: TurnPhase::Starting,
            input: Vec::new(),
            output: OutputBuffer::default(),
            reasoning: ReasoningBuffer::default(),
            plan: None,
            plan_text: OutputBuffer::default(),
            plan_path: None,
            started_at,
            completed_at: None,
            outcome: None,
        }
    }

    pub fn is_terminal(&self) -> bool {
        matches!(self.phase, TurnPhase::Terminal(_))
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub enum TurnPhase {
    Starting,
    Reasoning,
    StreamingOutput,
    Planning,
    Acting { action_id: ActionId },
    AwaitingUser { elicitation_id: ElicitationId },
    Cancelling,
    Terminal(TurnOutcome),
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub enum TurnOutcome {
    Succeeded,
    Exhausted { reason: ExhaustionReason },
    Refused,
    Interrupted,
    Failed(ErrorInfo),
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub enum ExhaustionReason {
    MaxTokens,
    MaxTurnRequests,
    ContextWindow,
    UsageLimit,
    Other(String),
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct OutputBuffer {
    pub chunks: Vec<ContentDelta>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct ReasoningBuffer {
    pub chunks: Vec<ContentDelta>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub enum ContentDelta {
    Text(String),
    ResourceRef(String),
    Structured(String),
    Parts(Vec<ContentPart>),
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub enum ContentPart {
    Text(String),
    Image {
        data: String,
        mime_type: String,
        name: Option<String>,
    },
}

impl ContentPart {
    pub fn text(value: impl Into<String>) -> Self {
        Self::Text(value.into())
    }

    pub fn image(
        data: impl Into<String>,
        mime_type: impl Into<String>,
        name: Option<String>,
    ) -> Self {
        Self::Image {
            data: data.into(),
            mime_type: mime_type.into(),
            name,
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct UserInputRef {
    pub content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image: Option<UserImageInputRef>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct UserImageInputRef {
    pub data: String,
    pub mime_type: String,
    pub name: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct PlanState {
    pub entries: Vec<PlanEntry>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct PlanEntry {
    pub content: String,
    pub status: PlanEntryStatus,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub enum PlanEntryStatus {
    Pending,
    InProgress,
    Completed,
}
