use crate::error::ErrorInfo;
use crate::ids::{ActionId, TurnId};

use super::super::{
    ActionKind, ActionOutputDelta, ActionPhase, ActionState, ElicitationState,
    HistoryReplayToolAction, PlanDisplayKind, PlanEntry,
};
use super::history::history_tool_title;
use super::text_plan::action_output_text;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DisplayMessage {
    pub id: String,
    pub role: DisplayMessageRole,
    pub content: Vec<DisplayMessagePart>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DisplayMessageRole {
    User,
    Assistant,
    Unknown(String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DisplayMessagePart {
    Text {
        kind: DisplayTextPartKind,
        text: String,
    },
    Image {
        data: String,
        mime_type: String,
        name: Option<String>,
    },
    File {
        data: String,
        mime_type: String,
        name: Option<String>,
    },
    Plan {
        kind: PlanDisplayKind,
        entries: Vec<PlanEntry>,
        text: String,
        path: Option<String>,
    },
    ToolCall {
        action: DisplayToolAction,
    },
}

impl DisplayMessagePart {
    pub fn text(kind: DisplayTextPartKind, text: impl Into<String>) -> Self {
        Self::Text {
            kind,
            text: text.into(),
        }
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

    pub fn file(
        data: impl Into<String>,
        mime_type: impl Into<String>,
        name: Option<String>,
    ) -> Self {
        Self::File {
            data: data.into(),
            mime_type: mime_type.into(),
            name,
        }
    }

    pub fn plan(
        kind: PlanDisplayKind,
        entries: Vec<PlanEntry>,
        text: impl Into<String>,
        path: Option<String>,
    ) -> Self {
        Self::Plan {
            kind,
            entries,
            text: text.into(),
            path,
        }
    }

    pub fn tool(action: DisplayToolAction) -> Self {
        Self::ToolCall { action }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DisplayTextPartKind {
    Text,
    Reasoning,
    Unknown(String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DisplayToolAction {
    pub id: String,
    pub turn_id: Option<TurnId>,
    pub kind: Option<ActionKind>,
    pub phase: ActionPhase,
    pub title: Option<String>,
    pub input_summary: Option<String>,
    pub raw_input: Option<String>,
    pub output_text: String,
    pub output: Vec<ActionOutputDelta>,
    pub error: Option<ErrorInfo>,
}

impl DisplayToolAction {
    pub fn from_action(action: &ActionState) -> Self {
        let output = action.output.chunks.clone();
        Self {
            id: action.id.to_string(),
            turn_id: Some(action.turn_id.clone()),
            kind: Some(action.kind.clone()),
            phase: action.phase.clone(),
            title: action.title.clone(),
            input_summary: action.input.summary.clone(),
            raw_input: action.input.raw.clone(),
            output_text: action_output_text(&output),
            output,
            error: action.error.clone(),
        }
    }

    pub fn from_output_delta(
        turn_id: TurnId,
        action_id: ActionId,
        content: ActionOutputDelta,
    ) -> Self {
        Self {
            id: action_id.to_string(),
            turn_id: Some(turn_id),
            kind: None,
            phase: ActionPhase::StreamingResult,
            title: None,
            input_summary: None,
            raw_input: None,
            output_text: action_output_text(std::slice::from_ref(&content)),
            output: vec![content],
            error: None,
        }
    }

    pub fn from_elicitation(elicitation: &ElicitationState) -> Self {
        Self {
            id: elicitation.id.to_string(),
            turn_id: elicitation.turn_id.clone(),
            kind: Some(ActionKind::HostCapability),
            phase: ActionPhase::AwaitingDecision {
                elicitation_id: elicitation.id.clone(),
            },
            title: elicitation.options.title.clone(),
            input_summary: elicitation_input_summary(elicitation),
            raw_input: None,
            output_text: String::new(),
            output: Vec::new(),
            error: None,
        }
    }

    pub fn from_history(tool: &HistoryReplayToolAction, turn_id: TurnId) -> Self {
        let output = tool.output.clone();
        Self {
            id: tool
                .id
                .clone()
                .expect("history tool replay entry must include tool id"),
            turn_id: Some(turn_id),
            kind: tool.kind.clone(),
            phase: tool.phase.clone(),
            title: history_tool_title(tool),
            input_summary: tool.input_summary.clone(),
            raw_input: tool.raw_input.clone(),
            output_text: action_output_text(&output),
            output,
            error: tool.error.clone(),
        }
    }
}

fn elicitation_input_summary(elicitation: &ElicitationState) -> Option<String> {
    elicitation.options.body.clone().or_else(|| {
        let questions = elicitation
            .options
            .questions
            .iter()
            .map(|question| {
                if question.question.is_empty() {
                    question.header.as_str()
                } else {
                    question.question.as_str()
                }
            })
            .filter(|text| !text.is_empty())
            .collect::<Vec<_>>()
            .join("\n");
        (!questions.is_empty()).then_some(questions)
    })
}
