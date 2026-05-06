use crate::error::ErrorInfo;
use crate::ids::{ActionId, ElicitationId, RemoteActionId, TurnId};

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct ActionState {
    pub id: ActionId,
    pub turn_id: TurnId,
    pub remote: Option<RemoteActionId>,
    pub kind: ActionKind,
    pub phase: ActionPhase,
    pub title: Option<String>,
    pub input: ActionInput,
    pub output: ActionOutput,
    pub error: Option<ErrorInfo>,
}

impl ActionState {
    pub fn new(id: ActionId, turn_id: TurnId, kind: ActionKind) -> Self {
        Self {
            id,
            turn_id,
            remote: None,
            kind,
            phase: ActionPhase::Proposed,
            title: None,
            input: ActionInput::default(),
            output: ActionOutput::default(),
            error: None,
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub enum ActionKind {
    Command,
    FileChange,
    Read,
    Write,
    McpTool,
    DynamicTool,
    SubAgent,
    WebSearch,
    Media,
    Reasoning,
    Plan,
    HostCapability,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub enum ActionPhase {
    Proposed,
    AwaitingDecision { elicitation_id: ElicitationId },
    Running,
    StreamingResult,
    Completed,
    Failed,
    Declined,
    Cancelled,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct ActionInput {
    pub summary: Option<String>,
    pub raw: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct ActionOutput {
    pub chunks: Vec<ActionOutputDelta>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub enum ActionOutputDelta {
    Text(String),
    Patch(String),
    Terminal(String),
    Structured(String),
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct ActionPatch {
    pub phase: Option<ActionPhase>,
    pub output_delta: Option<ActionOutputDelta>,
    pub error: Option<ErrorInfo>,
    pub title: Option<String>,
}

impl ActionPatch {
    pub fn phase(phase: ActionPhase) -> Self {
        Self {
            phase: Some(phase),
            output_delta: None,
            error: None,
            title: None,
        }
    }
}
