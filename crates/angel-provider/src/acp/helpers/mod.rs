mod config;
mod content;
mod history;
mod session;
mod tool;

use super::wire::AcpSessionUpdateKind;
use super::*;

pub(super) use config::session_config_options;
pub(super) use content::{
    content_delta_from_update, content_delta_log_text, content_text, json_string,
};
pub(crate) use history::acp_tool_history_entry;
pub(super) use session::{
    acp_action_exists, acp_session_id, acp_session_info_context, active_turn_id,
    find_acp_conversation, find_acp_conversation_or_pending_start, session_mode_state,
    session_model_state, session_usage_state,
};
pub(super) use tool::{
    acp_stop_reason, acp_tool_action_kind, acp_tool_status, duplicate_active_acp_tool_action_id,
    matching_acp_tool_action_id,
};

pub(crate) fn acp_tool_history_payload(update: &Value) -> Option<Value> {
    let session_update = update.get("sessionUpdate").and_then(Value::as_str)?;
    let session_update_kind = session_update.parse::<AcpSessionUpdateKind>().ok()?;
    if !matches!(
        session_update_kind,
        AcpSessionUpdateKind::ToolCall | AcpSessionUpdateKind::ToolCallUpdate
    ) {
        return None;
    }
    let tool_call_id = update
        .get("toolCallId")
        .or_else(|| update.get("id"))
        .and_then(Value::as_str)?;

    let mut payload = serde_json::Map::new();
    payload.insert(
        "sessionUpdate".to_string(),
        session_update_kind.wire_value(),
    );
    payload.insert("toolCallId".to_string(), json!(tool_call_id));

    if let Some(status) = update.get("status").and_then(Value::as_str) {
        payload.insert("status".to_string(), json!(status));
    } else if session_update_kind == AcpSessionUpdateKind::ToolCall {
        payload.insert(
            "status".to_string(),
            json!(agent_client_protocol_schema::ToolCallStatus::Pending),
        );
    }
    if let Some(kind) = update.get("kind").and_then(Value::as_str) {
        payload.insert("kind".to_string(), json!(kind));
    }
    if let Some(title) = update.get("title").and_then(Value::as_str) {
        payload.insert("title".to_string(), json!(title));
    }
    if let Some(raw_input) = update.get("rawInput") {
        payload.insert("rawInput".to_string(), raw_input.clone());
    }
    if let Some(content) = update.get("content") {
        payload.insert("content".to_string(), content.clone());
    }
    if let Some(raw_output) = update.get("rawOutput") {
        payload.insert("rawOutput".to_string(), raw_output.clone());
    }
    if let Some(error) = update.get("error") {
        payload.insert("error".to_string(), error.clone());
    }

    Some(Value::Object(payload))
}

pub(super) fn acp_outbound_summary(method: &str, params: &Value) -> String {
    match method {
        "session/prompt" => params
            .get("prompt")
            .and_then(Value::as_array)
            .and_then(|items| items.first())
            .and_then(|item| item.get("text"))
            .and_then(Value::as_str)
            .map(|text| {
                format!(
                    "({})",
                    text.split_whitespace().collect::<Vec<_>>().join(" ")
                )
            })
            .unwrap_or_default(),
        _ => String::new(),
    }
}
