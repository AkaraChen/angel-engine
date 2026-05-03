use super::*;

pub(super) fn acp_session_id(
    engine: &AngelEngine,
    effect: &crate::ProtocolEffect,
) -> Result<String, crate::EngineError> {
    let conversation_id =
        effect
            .conversation_id
            .as_ref()
            .ok_or_else(|| crate::EngineError::InvalidCommand {
                message: "missing conversation id".to_string(),
            })?;
    let conversation = engine.conversations.get(conversation_id).ok_or_else(|| {
        crate::EngineError::ConversationNotFound {
            conversation_id: conversation_id.to_string(),
        }
    })?;
    match &conversation.remote {
        RemoteConversationId::Known(session_id) => Ok(session_id.clone()),
        other => Err(crate::EngineError::InvalidState {
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
    match value {
        "max_tokens" => AcpStopReason::MaxTokens,
        "max_turn_requests" => AcpStopReason::MaxTurnRequests,
        "refusal" => AcpStopReason::Refusal,
        "cancelled" => AcpStopReason::Cancelled,
        _ => AcpStopReason::EndTurn,
    }
}

pub(super) fn acp_tool_status(value: &str) -> AcpToolStatus {
    match value {
        "pending" => AcpToolStatus::Pending,
        "completed" => AcpToolStatus::Completed,
        "failed" => AcpToolStatus::Failed,
        _ => AcpToolStatus::InProgress,
    }
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

fn resource_uri(value: &Value) -> Option<String> {
    value.get("uri").and_then(Value::as_str).map(str::to_string)
}

pub(super) fn json_string(value: &Value) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| value.to_string())
}

pub(super) fn acp_session_info_context(value: &Value) -> ContextPatch {
    let mut updates = Vec::new();
    if let Some(cwd) = value.get("cwd").and_then(Value::as_str) {
        updates.push(crate::ContextUpdate::Cwd {
            scope: crate::ContextScope::Conversation,
            cwd: Some(cwd.to_string()),
        });
    }
    if let Some(directories) = value.get("additionalDirectories").and_then(Value::as_array) {
        updates.push(crate::ContextUpdate::AdditionalDirectories {
            scope: crate::ContextScope::Conversation,
            directories: directories
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect(),
        });
    }
    if let Some(title) = optional_string_field(value, "title") {
        updates.push(crate::ContextUpdate::Raw {
            scope: crate::ContextScope::Conversation,
            key: "conversation.title".to_string(),
            value: title,
        });
    }
    if let Some(updated_at) = optional_string_field(value, "updatedAt") {
        updates.push(crate::ContextUpdate::Raw {
            scope: crate::ContextScope::Conversation,
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
