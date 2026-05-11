use super::wire::{AcpSessionUpdateKind, parse_stop_reason, parse_tool_kind, parse_tool_status};
use super::*;

pub(super) fn acp_session_id(
    engine: &AngelEngine,
    effect: &angel_engine::ProtocolEffect,
) -> Result<String, angel_engine::EngineError> {
    let conversation_id = effect.conversation_id.as_ref().ok_or_else(|| {
        angel_engine::EngineError::InvalidCommand {
            message: "missing conversation id".to_string(),
        }
    })?;
    let conversation = engine.conversations.get(conversation_id).ok_or_else(|| {
        angel_engine::EngineError::ConversationNotFound {
            conversation_id: conversation_id.to_string(),
        }
    })?;
    match &conversation.remote {
        RemoteConversationId::Known(session_id) => Ok(session_id.clone()),
        other => Err(angel_engine::EngineError::InvalidState {
            expected: "ACP session id".to_string(),
            actual: format!("{other:?}"),
        }),
    }
}

pub(super) fn find_acp_conversation(
    engine: &AngelEngine,
    session_id: &str,
) -> Option<ConversationId> {
    engine
        .conversations
        .iter()
        .find_map(|(id, conversation)| match &conversation.remote {
            RemoteConversationId::Known(remote) if remote == session_id => Some(id.clone()),
            _ => None,
        })
}

pub(super) fn active_turn_id(
    engine: &AngelEngine,
    conversation_id: &ConversationId,
) -> Option<TurnId> {
    engine
        .conversations
        .get(conversation_id)
        .and_then(|conversation| conversation.primary_active_turn().cloned())
}

pub(super) fn acp_action_exists(
    engine: &AngelEngine,
    conversation_id: &ConversationId,
    action_id: &ActionId,
) -> bool {
    engine
        .conversations
        .get(conversation_id)
        .map(|conversation| conversation.actions.contains_key(action_id))
        .unwrap_or(false)
}

pub(super) fn acp_stop_reason(value: &str) -> AcpStopReason {
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

pub(super) fn acp_tool_status(value: &str) -> AcpToolStatus {
    match parse_tool_status(value) {
        Some(agent_client_protocol_schema::ToolCallStatus::Pending) => AcpToolStatus::Pending,
        Some(agent_client_protocol_schema::ToolCallStatus::Completed) => AcpToolStatus::Completed,
        Some(agent_client_protocol_schema::ToolCallStatus::Failed) => AcpToolStatus::Failed,
        Some(agent_client_protocol_schema::ToolCallStatus::InProgress) | Some(_) | None => {
            AcpToolStatus::InProgress
        }
    }
}

pub(crate) fn acp_tool_history_entry(update: &Value) -> Option<HistoryReplayEntry> {
    let payload = acp_tool_history_payload(update)?;
    Some(HistoryReplayEntry {
        role: HistoryRole::Tool,
        content: ContentDelta::Structured(json_string(&payload)),
        tool: Some(acp_tool_history_action(&payload)),
    })
}

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

fn acp_tool_history_action(value: &Value) -> HistoryReplayToolAction {
    let phase = value
        .get("status")
        .and_then(Value::as_str)
        .map(acp_tool_status)
        .map(AcpAdapter::tool_status_to_phase)
        .unwrap_or(ActionPhase::Running);
    let title = value
        .get("title")
        .and_then(Value::as_str)
        .map(str::to_string);
    let output = acp_tool_history_output(
        value
            .get("content")
            .or_else(|| value.get("rawOutput"))
            .unwrap_or(&Value::Null),
    );
    let output_text = output
        .iter()
        .filter_map(|chunk| match chunk {
            ActionOutputDelta::Text(text) | ActionOutputDelta::Terminal(text) => {
                Some(text.as_str())
            }
            ActionOutputDelta::Patch(_) | ActionOutputDelta::Structured(_) => None,
        })
        .collect::<Vec<_>>()
        .join("");
    let error = if phase == ActionPhase::Failed {
        Some(ErrorInfo::new(
            "acp.tool_call_failed",
            value
                .get("error")
                .and_then(Value::as_str)
                .map(str::to_string)
                .or_else(|| (!output_text.trim().is_empty()).then_some(output_text))
                .unwrap_or_else(|| "ACP tool call failed".to_string()),
        ))
    } else {
        None
    };
    HistoryReplayToolAction {
        id: value
            .get("toolCallId")
            .or_else(|| value.get("id"))
            .and_then(Value::as_str)
            .map(str::to_string),
        kind: Some(acp_history_action_kind(
            value.get("kind").and_then(Value::as_str),
        )),
        phase,
        title: title.clone(),
        input_summary: title,
        raw_input: value.get("rawInput").map(|raw| {
            raw.as_str()
                .map_or_else(|| json_string(raw), str::to_string)
        }),
        output,
        error,
    }
}

fn acp_history_action_kind(kind: Option<&str>) -> ActionKind {
    match kind.and_then(parse_tool_kind) {
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

fn acp_tool_history_output(value: &Value) -> Vec<ActionOutputDelta> {
    match value {
        Value::Null => Vec::new(),
        Value::Array(items) => items.iter().flat_map(acp_tool_history_output).collect(),
        Value::String(text) => vec![ActionOutputDelta::Text(text.clone())],
        Value::Bool(value) => vec![ActionOutputDelta::Text(value.to_string())],
        Value::Number(value) => vec![ActionOutputDelta::Text(value.to_string())],
        Value::Object(_) => acp_tool_history_output_object(value),
    }
}

fn acp_tool_history_output_object(value: &Value) -> Vec<ActionOutputDelta> {
    match value.get("type").and_then(Value::as_str) {
        Some("content") => value
            .get("content")
            .map(acp_tool_history_output)
            .filter(|output| !output.is_empty())
            .unwrap_or_else(|| vec![ActionOutputDelta::Structured(json_string(value))]),
        Some("diff") => vec![ActionOutputDelta::Patch(acp_history_diff_text(value))],
        Some("terminal") => vec![ActionOutputDelta::Terminal(
            value
                .get("terminalId")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
        )],
        Some("patch") => vec![ActionOutputDelta::Patch(
            content_text(value).unwrap_or_else(|| json_string(value)),
        )],
        Some("text") => content_text(value)
            .map(|text| vec![ActionOutputDelta::Text(text)])
            .unwrap_or_else(|| vec![ActionOutputDelta::Structured(json_string(value))]),
        Some(_) | None => content_text(value)
            .map(|text| vec![ActionOutputDelta::Text(text)])
            .unwrap_or_else(|| vec![ActionOutputDelta::Structured(json_string(value))]),
    }
}

fn acp_history_diff_text(value: &Value) -> String {
    let path = value
        .get("path")
        .and_then(Value::as_str)
        .unwrap_or("<unknown>");
    let old_text = value
        .get("oldText")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let new_text = value
        .get("newText")
        .and_then(Value::as_str)
        .unwrap_or_default();
    format!("diff -- {path}\n--- old\n{old_text}\n+++ new\n{new_text}")
}

pub(super) fn content_delta_from_update(update: &Value) -> ContentDelta {
    update
        .get("content")
        .map(content_delta)
        .or_else(|| update.get("text").map(content_delta))
        .unwrap_or_else(|| ContentDelta::Text(String::new()))
}

pub(super) fn content_delta_log_text(delta: &ContentDelta) -> String {
    match delta {
        ContentDelta::Text(text) => text.clone(),
        ContentDelta::ResourceRef(uri) => format!("[resource] {uri}"),
        ContentDelta::Structured(value) => value.clone(),
        ContentDelta::Parts(parts) => parts
            .iter()
            .filter_map(|part| match part {
                ContentPart::Text(text) => Some(text.as_str()),
                ContentPart::Image { name, .. } => name.as_deref(),
                ContentPart::File { name, .. } => name.as_deref(),
            })
            .collect::<Vec<_>>()
            .join(""),
    }
}

pub(super) fn content_text(value: &Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        return Some(text.to_string());
    }
    if value.get("type").and_then(Value::as_str) == Some("text") {
        return value
            .get("text")
            .and_then(Value::as_str)
            .map(str::to_string);
    }
    value
        .get("text")
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn content_delta(value: &Value) -> ContentDelta {
    if let Some(parts) = content_parts(value)
        && !parts.is_empty()
        && value.is_array()
    {
        return ContentDelta::Parts(parts);
    }
    if let Some(text) = content_text(value) {
        return ContentDelta::Text(text);
    }
    match value.get("type").and_then(Value::as_str) {
        Some("resource_link") => value
            .get("uri")
            .or_else(|| value.get("name"))
            .and_then(Value::as_str)
            .map(|uri| ContentDelta::ResourceRef(uri.to_string()))
            .unwrap_or_else(|| ContentDelta::Structured(json_string(value))),
        Some("resource") => value
            .get("resource")
            .and_then(resource_uri)
            .map(ContentDelta::ResourceRef)
            .unwrap_or_else(|| ContentDelta::Structured(json_string(value))),
        _ => ContentDelta::Structured(json_string(value)),
    }
}

fn content_parts(value: &Value) -> Option<Vec<ContentPart>> {
    if let Some(items) = value.as_array() {
        return Some(items.iter().filter_map(content_part).collect());
    }
    content_part(value).map(|part| vec![part])
}

fn content_part(value: &Value) -> Option<ContentPart> {
    match value.get("type").and_then(Value::as_str) {
        Some("text") => value
            .get("text")
            .and_then(Value::as_str)
            .map(|text| ContentPart::text(text.to_string())),
        Some("image") => {
            let data = value.get("data").and_then(Value::as_str)?.to_string();
            let mime_type = value
                .get("mimeType")
                .or_else(|| value.get("mime_type"))
                .and_then(Value::as_str)?
                .to_string();
            if !mime_type.starts_with("image/") || data.is_empty() {
                return None;
            }
            let name = value
                .get("name")
                .and_then(Value::as_str)
                .filter(|name| !name.trim().is_empty())
                .map(str::to_string);
            Some(ContentPart::image(data, mime_type, name))
        }
        _ => None,
    }
}

fn resource_uri(value: &Value) -> Option<String> {
    value.get("uri").and_then(Value::as_str).map(str::to_string)
}

pub(super) fn json_string(value: &Value) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| value.to_string())
}

pub(super) fn acp_session_info_context(value: &Value) -> ContextPatch {
    let mut updates = Vec::new();
    if let Some(cwd) = value.get("cwd").and_then(Value::as_str) {
        updates.push(angel_engine::ContextUpdate::Cwd {
            scope: angel_engine::ContextScope::Conversation,
            cwd: Some(cwd.to_string()),
        });
    }
    if let Some(directories) = value.get("additionalDirectories").and_then(Value::as_array) {
        updates.push(angel_engine::ContextUpdate::AdditionalDirectories {
            scope: angel_engine::ContextScope::Conversation,
            directories: directories
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect(),
        });
    }
    if let Some(title) = optional_string_field(value, "title") {
        updates.push(angel_engine::ContextUpdate::Raw {
            scope: angel_engine::ContextScope::Conversation,
            key: "conversation.title".to_string(),
            value: title,
        });
    }
    if let Some(updated_at) = optional_string_field(value, "updatedAt") {
        updates.push(angel_engine::ContextUpdate::Raw {
            scope: angel_engine::ContextScope::Conversation,
            key: "conversation.updatedAt".to_string(),
            value: updated_at,
        });
    }
    ContextPatch { updates }
}

fn optional_string_field(value: &Value, key: &str) -> Option<String> {
    match value.get(key) {
        Some(Value::String(value)) => Some(value.clone()),
        Some(Value::Null) => Some(String::new()),
        _ => None,
    }
}

pub(super) fn session_config_options(value: &Value) -> Vec<SessionConfigOption> {
    value
        .get("configOptions")
        .and_then(Value::as_array)
        .map(|options| {
            options
                .iter()
                .filter_map(|option| {
                    let id = option.get("id").and_then(Value::as_str)?;
                    let name = option
                        .get("name")
                        .and_then(Value::as_str)
                        .unwrap_or(id)
                        .to_string();
                    Some(SessionConfigOption {
                        id: id.to_string(),
                        name,
                        description: option
                            .get("description")
                            .and_then(Value::as_str)
                            .map(str::to_string),
                        category: option
                            .get("category")
                            .and_then(Value::as_str)
                            .map(str::to_string),
                        current_value: config_current_value(option),
                        values: config_values(option),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

pub(super) fn session_mode_state(value: &Value) -> Option<SessionModeState> {
    let modes = value.get("modes")?;
    let current_mode_id = modes.get("currentModeId").and_then(Value::as_str)?;
    let available_modes = modes
        .get("availableModes")
        .and_then(Value::as_array)
        .map(|modes| {
            modes
                .iter()
                .filter_map(|mode| {
                    let id = mode.get("id").and_then(Value::as_str)?;
                    Some(SessionMode {
                        id: id.to_string(),
                        name: mode
                            .get("name")
                            .and_then(Value::as_str)
                            .unwrap_or(id)
                            .to_string(),
                        description: mode
                            .get("description")
                            .and_then(Value::as_str)
                            .map(str::to_string),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    Some(SessionModeState {
        current_mode_id: current_mode_id.to_string(),
        available_modes,
    })
}

pub(super) fn session_model_state(value: &Value) -> Option<SessionModelState> {
    let models = value.get("models")?;
    let current_model_id = models.get("currentModelId").and_then(Value::as_str)?;
    let available_models = models
        .get("availableModels")
        .and_then(Value::as_array)
        .map(|models| {
            models
                .iter()
                .filter_map(|model| {
                    let id = model
                        .get("modelId")
                        .or_else(|| model.get("id"))
                        .and_then(Value::as_str)?;
                    Some(SessionModel {
                        id: id.to_string(),
                        name: model
                            .get("name")
                            .and_then(Value::as_str)
                            .unwrap_or(id)
                            .to_string(),
                        description: model
                            .get("description")
                            .and_then(Value::as_str)
                            .map(str::to_string),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    Some(SessionModelState {
        current_model_id: current_model_id.to_string(),
        available_models,
    })
}

pub(super) fn session_usage_state(value: &Value) -> Option<SessionUsageState> {
    let used = value.get("used").and_then(Value::as_u64)?;
    let size = value.get("size").and_then(Value::as_u64)?;
    let cost = value.get("cost").and_then(|cost| {
        let amount = cost.get("amount")?;
        let currency = cost.get("currency").and_then(Value::as_str)?;
        Some(SessionUsageCost {
            amount: json_label(amount),
            currency: currency.to_string(),
        })
    });
    Some(SessionUsageState { used, size, cost })
}

fn json_label(value: &Value) -> String {
    value
        .as_str()
        .map(str::to_string)
        .unwrap_or_else(|| value.to_string())
}

fn config_current_value(option: &Value) -> String {
    option
        .get("currentValue")
        .map(|value| match value {
            Value::String(value) => value.clone(),
            Value::Bool(value) => value.to_string(),
            other => other.to_string(),
        })
        .unwrap_or_default()
}

fn config_values(option: &Value) -> Vec<SessionConfigValue> {
    let Some(options) = option.get("options").and_then(Value::as_array) else {
        return Vec::new();
    };
    let mut values = Vec::new();
    for item in options {
        if let Some(group_options) = item.get("options").and_then(Value::as_array) {
            values.extend(group_options.iter().filter_map(config_value));
        } else if let Some(value) = config_value(item) {
            values.push(value);
        }
    }
    values
}

fn config_value(value: &Value) -> Option<SessionConfigValue> {
    let id = value.get("value").and_then(Value::as_str)?;
    Some(SessionConfigValue {
        value: id.to_string(),
        name: value
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or(id)
            .to_string(),
        description: value
            .get("description")
            .and_then(Value::as_str)
            .map(str::to_string),
    })
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
