use angel_engine::{ElicitationState, UserQuestion, UserQuestionOption, UserQuestionSchema};
use serde::{Deserialize, Serialize};

use super::labels::{elicitation_kind_label, elicitation_phase_label, question_value_type};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElicitationSnapshot {
    pub id: String,
    pub turn_id: Option<String>,
    pub action_id: Option<String>,
    pub kind: String,
    pub phase: String,
    pub title: Option<String>,
    pub body: Option<String>,
    pub choices: Vec<String>,
    pub questions: Vec<QuestionSnapshot>,
}

impl From<&ElicitationState> for ElicitationSnapshot {
    fn from(elicitation: &ElicitationState) -> Self {
        Self {
            id: elicitation.id.to_string(),
            turn_id: elicitation.turn_id.as_ref().map(ToString::to_string),
            action_id: elicitation.action_id.as_ref().map(ToString::to_string),
            kind: elicitation_kind_label(&elicitation.kind),
            phase: elicitation_phase_label(&elicitation.phase),
            title: elicitation.options.title.clone(),
            body: elicitation.options.body.clone(),
            choices: elicitation.options.choices.clone(),
            questions: elicitation
                .options
                .questions
                .iter()
                .map(QuestionSnapshot::from)
                .collect(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionSnapshot {
    pub id: String,
    pub header: String,
    pub question: String,
    pub is_secret: bool,
    pub is_other: bool,
    pub options: Vec<QuestionOptionSnapshot>,
    pub schema: Option<QuestionSchemaSnapshot>,
}

impl From<&UserQuestion> for QuestionSnapshot {
    fn from(question: &UserQuestion) -> Self {
        Self {
            id: question.id.clone(),
            header: question.header.clone(),
            question: question.question.clone(),
            is_secret: question.is_secret,
            is_other: question.is_other,
            options: question
                .options
                .iter()
                .map(QuestionOptionSnapshot::from)
                .collect(),
            schema: question.schema.as_ref().map(QuestionSchemaSnapshot::from),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionOptionSnapshot {
    pub label: String,
    pub description: String,
}

impl From<&UserQuestionOption> for QuestionOptionSnapshot {
    fn from(option: &UserQuestionOption) -> Self {
        Self {
            label: option.label.clone(),
            description: option.description.clone(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionSchemaSnapshot {
    pub value_type: String,
    pub item_value_type: Option<String>,
    pub required: bool,
    pub multiple: bool,
    pub format: Option<String>,
    pub default_value: Option<String>,
    pub constraints: QuestionConstraintsSnapshot,
    pub raw_schema: Option<String>,
}

impl From<&UserQuestionSchema> for QuestionSchemaSnapshot {
    fn from(schema: &UserQuestionSchema) -> Self {
        Self {
            value_type: question_value_type(&schema.value_type),
            item_value_type: schema.item_value_type.as_ref().map(question_value_type),
            required: schema.required,
            multiple: schema.multiple,
            format: schema.format.clone(),
            default_value: schema.default_value.clone(),
            constraints: QuestionConstraintsSnapshot {
                pattern: schema.constraints.pattern.clone(),
                minimum: schema.constraints.minimum.clone(),
                maximum: schema.constraints.maximum.clone(),
                min_length: schema.constraints.min_length.clone(),
                max_length: schema.constraints.max_length.clone(),
                min_items: schema.constraints.min_items.clone(),
                max_items: schema.constraints.max_items.clone(),
                unique_items: schema.constraints.unique_items,
            },
            raw_schema: schema.raw_schema.clone(),
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionConstraintsSnapshot {
    pub pattern: Option<String>,
    pub minimum: Option<String>,
    pub maximum: Option<String>,
    pub min_length: Option<String>,
    pub max_length: Option<String>,
    pub min_items: Option<String>,
    pub max_items: Option<String>,
    pub unique_items: Option<bool>,
}
