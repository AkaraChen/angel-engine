use serde::{Deserialize, Serialize};

use super::context_turn::{
    ActionOutputSnapshot, ActionSnapshot, ErrorSnapshot, PlanEntrySnapshot, TurnSnapshot,
};
use super::elicitation::ElicitationSnapshot;
use super::labels::{
    action_kind_label, action_output_text, action_phase_label, default_plan_kind,
    display_message_role_label, display_text_part_kind_label, elicitation_action_phase,
    plan_display_kind_label,
};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayMessageSnapshot {
    pub id: String,
    pub role: String,
    pub content: Vec<DisplayMessagePartSnapshot>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayMessagePartSnapshot {
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub action: Option<DisplayToolActionSnapshot>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plan: Option<DisplayPlanSnapshot>,
}

impl DisplayMessagePartSnapshot {
    pub(crate) fn text(kind: &str, text: impl Into<String>) -> Self {
        Self {
            kind: kind.to_string(),
            text: Some(text.into()),
            data: None,
            mime_type: None,
            name: None,
            action: None,
            plan: None,
        }
    }

    pub(crate) fn image(
        data: impl Into<String>,
        mime_type: impl Into<String>,
        name: Option<String>,
    ) -> Self {
        Self {
            kind: "image".to_string(),
            text: None,
            data: Some(data.into()),
            mime_type: Some(mime_type.into()),
            name,
            action: None,
            plan: None,
        }
    }

    pub(crate) fn file(
        data: impl Into<String>,
        mime_type: impl Into<String>,
        name: Option<String>,
    ) -> Self {
        Self {
            kind: "file".to_string(),
            text: None,
            data: Some(data.into()),
            mime_type: Some(mime_type.into()),
            name,
            action: None,
            plan: None,
        }
    }

    pub(crate) fn tool(action: DisplayToolActionSnapshot) -> Self {
        Self {
            kind: "tool-call".to_string(),
            text: None,
            data: None,
            mime_type: None,
            name: None,
            action: Some(action),
            plan: None,
        }
    }

    pub(crate) fn plan(plan: DisplayPlanSnapshot) -> Self {
        Self {
            kind: "plan".to_string(),
            text: None,
            data: None,
            mime_type: None,
            name: None,
            action: None,
            plan: Some(plan),
        }
    }
}

impl From<&angel_engine::DisplayMessage> for DisplayMessageSnapshot {
    fn from(message: &angel_engine::DisplayMessage) -> Self {
        Self {
            id: message.id.clone(),
            role: display_message_role_label(&message.role),
            content: message
                .content
                .iter()
                .map(DisplayMessagePartSnapshot::from)
                .collect(),
        }
    }
}

impl From<&angel_engine::DisplayMessagePart> for DisplayMessagePartSnapshot {
    fn from(part: &angel_engine::DisplayMessagePart) -> Self {
        match part {
            angel_engine::DisplayMessagePart::Text { kind, text } => {
                Self::text(&display_text_part_kind_label(kind), text.clone())
            }
            angel_engine::DisplayMessagePart::Image {
                data,
                mime_type,
                name,
            } => Self::image(data.clone(), mime_type.clone(), name.clone()),
            angel_engine::DisplayMessagePart::File {
                data,
                mime_type,
                name,
            } => Self::file(data.clone(), mime_type.clone(), name.clone()),
            angel_engine::DisplayMessagePart::Plan {
                kind,
                entries,
                text,
                path,
            } => Self::plan(DisplayPlanSnapshot {
                kind: plan_display_kind_label(kind),
                entries: entries.iter().map(PlanEntrySnapshot::from).collect(),
                text: text.clone(),
                path: path.clone(),
            }),
            angel_engine::DisplayMessagePart::ToolCall { action } => {
                Self::tool(DisplayToolActionSnapshot::from(action))
            }
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayPlanSnapshot {
    #[serde(default = "default_plan_kind")]
    pub kind: String,
    #[serde(default)]
    pub entries: Vec<PlanEntrySnapshot>,
    #[serde(default)]
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

impl Default for DisplayPlanSnapshot {
    fn default() -> Self {
        Self {
            kind: default_plan_kind(),
            entries: Vec::new(),
            text: String::new(),
            path: None,
        }
    }
}

impl DisplayPlanSnapshot {
    pub(crate) fn from_turn(turn: &TurnSnapshot) -> Option<Self> {
        let plan = Self {
            kind: default_plan_kind(),
            entries: turn.plan.clone(),
            text: turn.plan_text.clone(),
            path: turn.plan_path.clone(),
        };
        (!plan.is_empty()).then_some(plan)
    }

    pub(crate) fn todo_from_turn(turn: &TurnSnapshot) -> Self {
        Self {
            kind: "todo".to_string(),
            entries: turn.todo.clone(),
            text: String::new(),
            path: None,
        }
    }

    pub(crate) fn is_empty(&self) -> bool {
        self.entries.is_empty() && self.text.trim().is_empty() && self.path.is_none()
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayToolActionSnapshot {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub elicitation_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    pub phase: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub input_summary: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub raw_input: Option<String>,
    pub output_text: String,
    pub output: Vec<ActionOutputSnapshot>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<ErrorSnapshot>,
}

impl From<&ActionSnapshot> for DisplayToolActionSnapshot {
    fn from(action: &ActionSnapshot) -> Self {
        Self {
            id: action.id.clone(),
            turn_id: Some(action.turn_id.clone()),
            elicitation_id: action.elicitation_id.clone(),
            kind: Some(action.kind.clone()),
            phase: action.phase.clone(),
            title: action.title.clone(),
            input_summary: action.input_summary.clone(),
            raw_input: action.raw_input.clone(),
            output_text: action.output_text.clone(),
            output: action.output.clone(),
            error: action.error.clone(),
        }
    }
}

impl From<&angel_engine::DisplayToolAction> for DisplayToolActionSnapshot {
    fn from(action: &angel_engine::DisplayToolAction) -> Self {
        let output = action
            .output
            .iter()
            .map(ActionOutputSnapshot::from)
            .collect::<Vec<_>>();
        Self {
            id: action.id.clone(),
            turn_id: action.turn_id.as_ref().map(ToString::to_string),
            elicitation_id: None,
            kind: action.kind.as_ref().map(action_kind_label),
            phase: action_phase_label(&action.phase),
            title: action.title.clone(),
            input_summary: action.input_summary.clone(),
            raw_input: action.raw_input.clone(),
            output_text: action.output_text.clone(),
            output,
            error: action.error.as_ref().map(ErrorSnapshot::from),
        }
    }
}

impl DisplayToolActionSnapshot {
    pub(crate) fn from_output_delta(
        turn_id: String,
        action_id: String,
        content: ActionOutputSnapshot,
    ) -> Self {
        Self {
            id: action_id,
            turn_id: Some(turn_id),
            elicitation_id: None,
            kind: None,
            phase: "streamingResult".to_string(),
            title: None,
            input_summary: None,
            raw_input: None,
            output_text: action_output_text(std::slice::from_ref(&content)),
            output: vec![content],
            error: None,
        }
    }

    pub(crate) fn single_output_delta(&self, content: ActionOutputSnapshot) -> Self {
        Self {
            id: self.id.clone(),
            turn_id: self.turn_id.clone(),
            elicitation_id: self.elicitation_id.clone(),
            kind: self.kind.clone(),
            phase: self.phase.clone(),
            title: self.title.clone(),
            input_summary: self.input_summary.clone(),
            raw_input: self.raw_input.clone(),
            output_text: content.text.clone(),
            output: vec![content],
            error: self.error.clone(),
        }
    }

    pub(crate) fn from_elicitation(elicitation: &ElicitationSnapshot) -> Self {
        let input_summary = elicitation.body.clone().or_else(|| {
            let questions = elicitation
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
        });
        Self {
            id: elicitation.id.clone(),
            turn_id: elicitation.turn_id.clone(),
            elicitation_id: Some(elicitation.id.clone()),
            kind: Some("elicitation".to_string()),
            phase: elicitation_action_phase(elicitation.phase.as_str()).to_string(),
            title: elicitation.title.clone(),
            input_summary,
            raw_input: serde_json::to_string(elicitation).ok(),
            output_text: String::new(),
            output: Vec::new(),
            error: None,
        }
    }
}
