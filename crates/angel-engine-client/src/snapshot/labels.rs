use angel_engine::{
    ActionKind, ActionPhase, ContentPart, ConversationLifecycle, ElicitationKind, ElicitationPhase,
    QuestionValueType, TurnPhase,
};

use super::context_turn::{ActionOutputSnapshot, ContentChunk};

pub(super) fn elicitation_action_phase(phase: &str) -> &'static str {
    if phase.starts_with("resolved:") {
        return "completed";
    }
    match phase {
        "open" => "awaitingDecision",
        "resolving" => "running",
        "cancelled" => "cancelled",
        _ => "running",
    }
}
pub(super) fn lifecycle_label(lifecycle: &ConversationLifecycle) -> String {
    match lifecycle {
        ConversationLifecycle::Discovered => "discovered".to_string(),
        ConversationLifecycle::Provisioning { op } => format!("provisioning:{op:?}"),
        ConversationLifecycle::Hydrating { source } => format!("hydrating:{source:?}"),
        ConversationLifecycle::Idle => "idle".to_string(),
        ConversationLifecycle::Active => "active".to_string(),
        ConversationLifecycle::Cancelling { .. } => "cancelling".to_string(),
        ConversationLifecycle::MutatingHistory { .. } => "mutatingHistory".to_string(),
        ConversationLifecycle::Archived => "archived".to_string(),
        ConversationLifecycle::Closing => "closing".to_string(),
        ConversationLifecycle::Closed => "closed".to_string(),
        ConversationLifecycle::Faulted(error) => format!("faulted:{}", error.code),
    }
}

pub(super) fn turn_phase_label(phase: &TurnPhase) -> String {
    match phase {
        TurnPhase::Starting => "starting".to_string(),
        TurnPhase::Reasoning => "reasoning".to_string(),
        TurnPhase::StreamingOutput => "streamingOutput".to_string(),
        TurnPhase::Planning => "planning".to_string(),
        TurnPhase::Acting { .. } => "acting".to_string(),
        TurnPhase::AwaitingUser { .. } => "awaitingUser".to_string(),
        TurnPhase::Cancelling => "cancelling".to_string(),
        TurnPhase::Terminal(outcome) => format!("terminal:{outcome:?}"),
    }
}

pub(super) fn action_kind_label(kind: &ActionKind) -> String {
    match kind {
        ActionKind::Command => "command",
        ActionKind::FileChange => "fileChange",
        ActionKind::Read => "read",
        ActionKind::Write => "write",
        ActionKind::McpTool => "mcpTool",
        ActionKind::DynamicTool => "dynamicTool",
        ActionKind::SubAgent => "subAgent",
        ActionKind::WebSearch => "webSearch",
        ActionKind::Media => "media",
        ActionKind::Reasoning => "reasoning",
        ActionKind::Plan => "plan",
        ActionKind::HostCapability => "hostCapability",
    }
    .to_string()
}

pub(super) fn display_message_role_label(role: &angel_engine::DisplayMessageRole) -> String {
    match role {
        angel_engine::DisplayMessageRole::User => "user".to_string(),
        angel_engine::DisplayMessageRole::Assistant => "assistant".to_string(),
        angel_engine::DisplayMessageRole::Unknown(value) => value.clone(),
    }
}

pub(super) fn display_text_part_kind_label(kind: &angel_engine::DisplayTextPartKind) -> String {
    match kind {
        angel_engine::DisplayTextPartKind::Text => "text".to_string(),
        angel_engine::DisplayTextPartKind::Reasoning => "reasoning".to_string(),
        angel_engine::DisplayTextPartKind::Unknown(value) => value.clone(),
    }
}

pub(super) fn plan_display_kind_label(kind: &angel_engine::PlanDisplayKind) -> String {
    match kind {
        angel_engine::PlanDisplayKind::Review => "review",
        angel_engine::PlanDisplayKind::Todo => "todo",
    }
    .to_string()
}

pub(super) fn default_plan_kind() -> String {
    "review".to_string()
}

pub(super) fn action_elicitation_id(phase: &ActionPhase) -> Option<String> {
    match phase {
        ActionPhase::AwaitingDecision { elicitation_id } => Some(elicitation_id.to_string()),
        _ => None,
    }
}

pub(super) fn action_phase_label(phase: &ActionPhase) -> String {
    match phase {
        ActionPhase::Proposed => "proposed",
        ActionPhase::AwaitingDecision { .. } => "awaitingDecision",
        ActionPhase::Running => "running",
        ActionPhase::StreamingResult => "streamingResult",
        ActionPhase::Completed => "completed",
        ActionPhase::Failed => "failed",
        ActionPhase::Declined => "declined",
        ActionPhase::Cancelled => "cancelled",
    }
    .to_string()
}

pub(super) fn elicitation_kind_label(kind: &ElicitationKind) -> String {
    match kind {
        ElicitationKind::Approval => "approval",
        ElicitationKind::UserInput => "userInput",
        ElicitationKind::ExternalFlow => "externalFlow",
        ElicitationKind::DynamicToolCall => "dynamicToolCall",
        ElicitationKind::PermissionProfile => "permissionProfile",
    }
    .to_string()
}

pub(super) fn elicitation_phase_label(phase: &ElicitationPhase) -> String {
    match phase {
        ElicitationPhase::Open => "open".to_string(),
        ElicitationPhase::Resolving => "resolving".to_string(),
        ElicitationPhase::Resolved { decision } => format!("resolved:{decision:?}"),
        ElicitationPhase::Cancelled => "cancelled".to_string(),
    }
}

pub(super) fn question_value_type(value_type: &QuestionValueType) -> String {
    match value_type {
        QuestionValueType::String => "string".to_string(),
        QuestionValueType::Number => "number".to_string(),
        QuestionValueType::Integer => "integer".to_string(),
        QuestionValueType::Boolean => "boolean".to_string(),
        QuestionValueType::Array => "array".to_string(),
        QuestionValueType::Object => "object".to_string(),
        QuestionValueType::Unknown(value) => value.clone(),
    }
}

pub(super) fn chunks_text(chunks: &[ContentChunk]) -> String {
    chunks
        .iter()
        .filter(|chunk| chunk.kind == "text" || chunk.kind == "parts")
        .map(|chunk| chunk.text.as_str())
        .collect::<Vec<_>>()
        .join("")
}

pub(super) fn parts_text(parts: &[ContentPart]) -> String {
    parts
        .iter()
        .filter_map(|part| match part {
            ContentPart::Text(text) => Some(text.as_str()),
            ContentPart::Image { .. } | ContentPart::File { .. } => None,
        })
        .collect::<Vec<_>>()
        .join("")
}

pub(super) fn action_output_text(chunks: &[ActionOutputSnapshot]) -> String {
    chunks
        .iter()
        .filter(|chunk| chunk.kind == "text" || chunk.kind == "terminal")
        .map(|chunk| chunk.text.as_str())
        .collect::<Vec<_>>()
        .join("")
}
