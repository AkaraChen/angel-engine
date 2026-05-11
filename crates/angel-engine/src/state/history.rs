use crate::error::ErrorInfo;

use super::{ActionKind, ActionOutputDelta, ActionPhase};

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct HistoryState {
    pub hydrated: bool,
    pub turn_count: usize,
    pub workspace_reverted: Option<bool>,
    pub replay: Vec<HistoryReplayEntry>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct HistoryReplayEntry {
    pub role: HistoryRole,
    pub content: super::ContentDelta,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool: Option<HistoryReplayToolAction>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct HistoryReplayToolAction {
    pub id: Option<String>,
    pub kind: Option<ActionKind>,
    pub phase: ActionPhase,
    pub title: Option<String>,
    pub input_summary: Option<String>,
    pub raw_input: Option<String>,
    pub output: Vec<ActionOutputDelta>,
    pub error: Option<ErrorInfo>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub enum HistoryRole {
    User,
    Assistant,
    Reasoning,
    Tool,
    Unknown(String),
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub enum HistoryMutationOp {
    Compact,
    Rollback { num_turns: usize },
    InjectItems { count: usize },
    ReplaceHistory,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct HistoryMutationResult {
    pub success: bool,
    pub workspace_reverted: bool,
    pub message: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct ObserverState {
    pub subscribed: bool,
    pub visible: bool,
}

impl Default for ObserverState {
    fn default() -> Self {
        Self {
            subscribed: true,
            visible: true,
        }
    }
}
