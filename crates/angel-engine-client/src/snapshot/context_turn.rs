use std::collections::BTreeMap;

use angel_engine::{
    ActionOutputDelta, ActionState, AgentMode, ContentDelta, EffectiveContext, PermissionMode,
    PlanEntryStatus, TurnState,
};
use serde::{Deserialize, Serialize};

use super::labels::{
    action_elicitation_id, action_kind_label, action_output_text, action_phase_label, chunks_text,
    parts_text, turn_phase_label,
};

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextSnapshot {
    pub model: Option<String>,
    pub mode: Option<String>,
    pub permission_mode: Option<String>,
    pub cwd: Option<String>,
    pub additional_directories: Vec<String>,
    pub approval_policy: Option<String>,
    pub sandbox: Option<String>,
    pub permission_profile: Option<String>,
    pub raw: BTreeMap<String, String>,
}

impl From<&EffectiveContext> for ContextSnapshot {
    fn from(context: &EffectiveContext) -> Self {
        Self {
            model: context.model.effective().and_then(Clone::clone),
            mode: context
                .mode
                .effective()
                .and_then(Option::as_ref)
                .map(|AgentMode { id }| id.clone()),
            permission_mode: context
                .permission_mode
                .effective()
                .and_then(Option::as_ref)
                .map(|PermissionMode { id }| id.clone()),
            cwd: context
                .cwd
                .effective()
                .and_then(Option::as_ref)
                .map(|path| path.display().to_string()),
            additional_directories: match context.additional_directories.effective() {
                Some(directories) => directories
                    .iter()
                    .map(|directory| directory.display().to_string())
                    .collect(),
                None => Vec::new(),
            },
            approval_policy: context
                .approvals
                .effective()
                .map(|policy| format!("{policy:?}")),
            sandbox: context
                .sandbox
                .effective()
                .map(|sandbox| format!("{sandbox:?}")),
            permission_profile: context
                .permissions
                .effective()
                .map(|permissions| permissions.name.clone()),
            raw: context
                .raw
                .iter()
                .filter_map(|(key, value)| {
                    value.effective().map(|value| (key.clone(), value.clone()))
                })
                .collect(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnSnapshot {
    pub id: String,
    pub remote_id: Option<String>,
    pub remote_kind: String,
    pub phase: String,
    pub is_terminal: bool,
    pub input_text: String,
    pub output_text: String,
    pub reasoning_text: String,
    pub plan_text: String,
    pub plan_path: Option<String>,
    pub outcome: Option<String>,
    pub error: Option<ErrorSnapshot>,
    pub output: Vec<ContentChunk>,
    pub reasoning: Vec<ContentChunk>,
    pub plan: Vec<PlanEntrySnapshot>,
    #[serde(default)]
    pub todo: Vec<PlanEntrySnapshot>,
}

impl From<&TurnState> for TurnSnapshot {
    fn from(turn: &TurnState) -> Self {
        let (remote_kind, remote_id) = match &turn.remote {
            angel_engine::RemoteTurnId::Known(value) => ("known".to_string(), Some(value.clone())),
            angel_engine::RemoteTurnId::Pending { request_id } => {
                ("pending".to_string(), Some(request_id.to_string()))
            }
            angel_engine::RemoteTurnId::Local(value) => ("local".to_string(), Some(value.clone())),
        };
        let output = turn
            .output
            .chunks
            .iter()
            .map(ContentChunk::from)
            .collect::<Vec<_>>();
        let reasoning = turn
            .reasoning
            .chunks
            .iter()
            .map(ContentChunk::from)
            .collect::<Vec<_>>();
        let plan_text_chunks = turn
            .plan_text
            .chunks
            .iter()
            .map(ContentChunk::from)
            .collect::<Vec<_>>();
        let error = match turn.outcome.as_ref() {
            Some(angel_engine::TurnOutcome::Failed(error)) => Some(ErrorSnapshot::from(error)),
            _ => None,
        };
        Self {
            id: turn.id.to_string(),
            remote_id,
            remote_kind,
            phase: turn_phase_label(&turn.phase),
            is_terminal: turn.is_terminal(),
            input_text: turn
                .input
                .iter()
                .map(|input| input.content.as_str())
                .collect::<Vec<_>>()
                .join("\n"),
            output_text: chunks_text(&output),
            reasoning_text: chunks_text(&reasoning),
            plan_text: chunks_text(&plan_text_chunks),
            plan_path: turn.plan_path.clone(),
            outcome: turn.outcome.as_ref().map(|outcome| format!("{outcome:?}")),
            error,
            output,
            reasoning,
            plan: match turn.plan.as_ref() {
                Some(plan) => plan.entries.iter().map(PlanEntrySnapshot::from).collect(),
                None => Vec::new(),
            },
            todo: match turn.todo.as_ref() {
                Some(todo) => todo.entries.iter().map(PlanEntrySnapshot::from).collect(),
                None => Vec::new(),
            },
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentChunk {
    pub kind: String,
    pub text: String,
}

impl From<&ContentDelta> for ContentChunk {
    fn from(delta: &ContentDelta) -> Self {
        match delta {
            ContentDelta::Text(text) => Self {
                kind: "text".to_string(),
                text: text.clone(),
            },
            ContentDelta::ResourceRef(uri) => Self {
                kind: "resourceRef".to_string(),
                text: uri.clone(),
            },
            ContentDelta::Structured(value) => Self {
                kind: "structured".to_string(),
                text: value.clone(),
            },
            ContentDelta::Parts(parts) => Self {
                kind: "parts".to_string(),
                text: parts_text(parts),
            },
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanEntrySnapshot {
    pub content: String,
    pub status: String,
}

impl From<&angel_engine::PlanEntry> for PlanEntrySnapshot {
    fn from(entry: &angel_engine::PlanEntry) -> Self {
        Self {
            content: entry.content.clone(),
            status: match entry.status {
                PlanEntryStatus::Pending => "pending",
                PlanEntryStatus::InProgress => "in_progress",
                PlanEntryStatus::Completed => "completed",
            }
            .to_string(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionSnapshot {
    pub id: String,
    pub turn_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub elicitation_id: Option<String>,
    pub kind: String,
    pub phase: String,
    pub title: Option<String>,
    pub input_summary: Option<String>,
    pub raw_input: Option<String>,
    pub output_text: String,
    pub output: Vec<ActionOutputSnapshot>,
    pub error: Option<ErrorSnapshot>,
}

impl From<&ActionState> for ActionSnapshot {
    fn from(action: &ActionState) -> Self {
        let output = action
            .output
            .chunks
            .iter()
            .map(ActionOutputSnapshot::from)
            .collect::<Vec<_>>();
        Self {
            id: action.id.to_string(),
            turn_id: action.turn_id.to_string(),
            elicitation_id: action_elicitation_id(&action.phase),
            kind: action_kind_label(&action.kind),
            phase: action_phase_label(&action.phase),
            title: action.title.clone(),
            input_summary: action.input.summary.clone(),
            raw_input: action.input.raw.clone(),
            output_text: action_output_text(&output),
            output,
            error: action.error.as_ref().map(ErrorSnapshot::from),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionOutputSnapshot {
    pub kind: String,
    pub text: String,
}

impl From<&ActionOutputDelta> for ActionOutputSnapshot {
    fn from(delta: &ActionOutputDelta) -> Self {
        match delta {
            ActionOutputDelta::Text(text) => Self {
                kind: "text".to_string(),
                text: text.clone(),
            },
            ActionOutputDelta::Patch(text) => Self {
                kind: "patch".to_string(),
                text: text.clone(),
            },
            ActionOutputDelta::Terminal(text) => Self {
                kind: "terminal".to_string(),
                text: text.clone(),
            },
            ActionOutputDelta::Structured(text) => Self {
                kind: "structured".to_string(),
                text: text.clone(),
            },
        }
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorSnapshot {
    pub code: String,
    pub message: String,
    pub recoverable: bool,
}

impl From<&angel_engine::ErrorInfo> for ErrorSnapshot {
    fn from(error: &angel_engine::ErrorInfo) -> Self {
        Self {
            code: error.code.clone(),
            message: error.message.clone(),
            recoverable: error.recoverable,
        }
    }
}
