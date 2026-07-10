use super::super::*;

pub(in crate::acp) fn acp_session_id(
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

pub(in crate::acp) fn find_acp_conversation(
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

pub(in crate::acp) fn find_acp_conversation_or_pending_start(
    engine: &AngelEngine,
    session_id: &str,
) -> Option<ConversationId> {
    find_acp_conversation(engine, session_id).or_else(|| {
        let mut pending = engine
            .pending
            .requests
            .values()
            .filter_map(|request| match request {
                PendingRequest::StartConversation { conversation_id }
                | PendingRequest::ForkConversation { conversation_id }
                | PendingRequest::ResumeConversation {
                    conversation_id, ..
                } => Some(conversation_id.clone()),
                _ => None,
            });
        let candidate = pending.next()?;
        pending.next().is_none().then_some(candidate)
    })
}

pub(in crate::acp) fn active_turn_id(
    engine: &AngelEngine,
    conversation_id: &ConversationId,
) -> Option<TurnId> {
    engine
        .conversations
        .get(conversation_id)
        .and_then(|conversation| conversation.primary_active_turn().cloned())
}

pub(in crate::acp) fn acp_action_exists(
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

pub(in crate::acp) fn acp_session_info_context(value: &Value) -> ContextPatch {
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

pub(in crate::acp) fn session_mode_state(value: &Value) -> Option<SessionModeState> {
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

pub(in crate::acp) fn session_model_state(value: &Value) -> Option<SessionModelState> {
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

pub(in crate::acp) fn session_usage_state(value: &Value) -> Option<SessionUsageState> {
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
