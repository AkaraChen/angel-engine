use super::super::wire::{parse_stop_reason, parse_tool_kind, parse_tool_status};
use super::super::*;

pub(in crate::acp) fn acp_stop_reason(value: &str) -> AcpStopReason {
    match parse_stop_reason(value) {
        Some(agent_client_protocol_schema::StopReason::MaxTokens) => AcpStopReason::MaxTokens,
        Some(agent_client_protocol_schema::StopReason::MaxTurnRequests) => {
            AcpStopReason::MaxTurnRequests
        }
        Some(agent_client_protocol_schema::StopReason::Refusal) => AcpStopReason::Refusal,
        Some(agent_client_protocol_schema::StopReason::Cancelled) => AcpStopReason::Cancelled,
        Some(agent_client_protocol_schema::StopReason::EndTurn) | Some(_) | None => {
            AcpStopReason::EndTurn
        }
    }
}

pub(in crate::acp) fn acp_tool_status(value: &str) -> AcpToolStatus {
    match parse_tool_status(value) {
        Some(agent_client_protocol_schema::ToolCallStatus::Pending) => AcpToolStatus::Pending,
        Some(agent_client_protocol_schema::ToolCallStatus::Completed) => AcpToolStatus::Completed,
        Some(agent_client_protocol_schema::ToolCallStatus::Failed) => AcpToolStatus::Failed,
        Some(agent_client_protocol_schema::ToolCallStatus::InProgress) | Some(_) | None => {
            AcpToolStatus::InProgress
        }
    }
}

pub(in crate::acp) fn duplicate_active_acp_tool_action_id(
    engine: &AngelEngine,
    conversation_id: &ConversationId,
    update: &Value,
    incoming_action_id: &ActionId,
) -> Option<ActionId> {
    matching_acp_tool_action_id_by_phase(
        engine,
        conversation_id,
        update,
        incoming_action_id,
        |phase| !is_terminal_acp_action_phase(phase),
    )
}

pub(in crate::acp) fn matching_acp_tool_action_id(
    engine: &AngelEngine,
    conversation_id: &ConversationId,
    update: &Value,
    incoming_action_id: &ActionId,
) -> Option<ActionId> {
    matching_acp_tool_action_id_by_phase(
        engine,
        conversation_id,
        update,
        incoming_action_id,
        |_| true,
    )
}

impl AcpAdapter {
    pub(in crate::acp) fn remember_duplicate_tool_action(
        &self,
        duplicate_id: impl Into<String>,
        action_id: ActionId,
    ) {
        self.duplicate_tool_actions
            .lock()
            .expect("lock duplicate ACP tool action map")
            .insert(duplicate_id.into(), action_id);
    }

    pub(in crate::acp) fn duplicate_tool_action_id(&self, duplicate_id: &str) -> Option<ActionId> {
        self.duplicate_tool_actions
            .lock()
            .expect("lock duplicate ACP tool action map")
            .get(duplicate_id)
            .cloned()
    }
}

fn matching_acp_tool_action_id_by_phase(
    engine: &AngelEngine,
    conversation_id: &ConversationId,
    update: &Value,
    incoming_action_id: &ActionId,
    phase_matches: impl Fn(&ActionPhase) -> bool,
) -> Option<ActionId> {
    let incoming_signature = acp_tool_signature(update)?;
    let conversation = engine.conversations.get(conversation_id)?;
    let turn_id = conversation.primary_active_turn()?;

    conversation
        .actions
        .values()
        .find(|action| {
            &action.turn_id == turn_id
                && &action.id != incoming_action_id
                && phase_matches(&action.phase)
                && acp_action_signature(action).as_ref() == Some(&incoming_signature)
        })
        .map(|action| action.id.clone())
}

pub(in crate::acp) fn acp_tool_action_kind(value: &Value) -> ActionKind {
    match value
        .get("kind")
        .and_then(Value::as_str)
        .and_then(parse_tool_kind)
    {
        Some(agent_client_protocol_schema::ToolKind::Read) => ActionKind::Read,
        Some(
            agent_client_protocol_schema::ToolKind::Edit
            | agent_client_protocol_schema::ToolKind::Delete
            | agent_client_protocol_schema::ToolKind::Move,
        ) => ActionKind::FileChange,
        Some(agent_client_protocol_schema::ToolKind::Execute) => ActionKind::Command,
        Some(agent_client_protocol_schema::ToolKind::Search) => ActionKind::WebSearch,
        Some(agent_client_protocol_schema::ToolKind::Think) => ActionKind::Reasoning,
        Some(agent_client_protocol_schema::ToolKind::Fetch) => ActionKind::DynamicTool,
        Some(agent_client_protocol_schema::ToolKind::SwitchMode) => ActionKind::HostCapability,
        Some(agent_client_protocol_schema::ToolKind::Other) | Some(_) | None => ActionKind::McpTool,
    }
}

#[derive(Debug, PartialEq, Eq)]
struct AcpToolSignature {
    kind: ActionKind,
    title: Option<String>,
    raw_input: Option<Value>,
    content: Option<Value>,
}

fn acp_tool_signature(value: &Value) -> Option<AcpToolSignature> {
    let value = acp_tool_signature_source(value);
    let title = value
        .get("title")
        .and_then(Value::as_str)
        .map(str::to_string);
    let raw_input = value.get("rawInput").cloned();
    let content = value.get("content").cloned();

    if title.is_none() && raw_input.is_none() && content.is_none() {
        return None;
    }

    Some(AcpToolSignature {
        kind: acp_tool_action_kind(value),
        title,
        raw_input,
        content,
    })
}

fn acp_action_signature(action: &ActionState) -> Option<AcpToolSignature> {
    let raw = action
        .input
        .raw
        .as_deref()
        .and_then(|raw| serde_json::from_str::<Value>(raw).ok());
    let value = raw.as_ref().map(acp_tool_signature_source);
    let title = value
        .and_then(|value| value.get("title"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| action.title.clone())
        .or_else(|| action.input.summary.clone());
    let raw_input = value.and_then(|value| value.get("rawInput")).cloned();
    let content = value.and_then(|value| value.get("content")).cloned();

    if title.is_none() && raw_input.is_none() && content.is_none() {
        return None;
    }

    Some(AcpToolSignature {
        kind: value
            .map(acp_tool_action_kind)
            .unwrap_or_else(|| action.kind.clone()),
        title,
        raw_input,
        content,
    })
}

fn acp_tool_signature_source(value: &Value) -> &Value {
    value.get("toolCall").unwrap_or(value)
}

fn is_terminal_acp_action_phase(phase: &ActionPhase) -> bool {
    matches!(
        phase,
        ActionPhase::Completed
            | ActionPhase::Failed
            | ActionPhase::Declined
            | ActionPhase::Cancelled
    )
}
