use super::*;

pub(super) fn acp_session_id(
    engine: &AngelEngine,
    effect: &crate::angel_engine::ProtocolEffect,
) -> Result<String, crate::angel_engine::EngineError> {
    let conversation_id = effect.conversation_id.as_ref().ok_or_else(|| {
        crate::angel_engine::EngineError::InvalidCommand {
            message: "missing conversation id".to_string(),
        }
    })?;
    let conversation = engine.conversations.get(conversation_id).ok_or_else(|| {
        crate::angel_engine::EngineError::ConversationNotFound {
            conversation_id: conversation_id.to_string(),
        }
    })?;
    match &conversation.remote {
        RemoteConversationId::AcpSession(session_id) => Ok(session_id.clone()),
        other => Err(crate::angel_engine::EngineError::InvalidState {
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
            RemoteConversationId::AcpSession(remote) if remote == session_id => Some(id.clone()),
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

pub(super) fn update_text(update: &Value) -> String {
    update
        .get("content")
        .and_then(|content| {
            content
                .get("text")
                .and_then(Value::as_str)
                .or_else(|| content.as_str())
        })
        .or_else(|| update.get("text").and_then(Value::as_str))
        .unwrap_or_default()
        .to_string()
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
