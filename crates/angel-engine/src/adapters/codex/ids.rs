use super::*;

pub(crate) fn codex_thread_id(
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
    conversation
        .remote
        .as_protocol_id()
        .map(str::to_string)
        .ok_or_else(|| crate::EngineError::InvalidState {
            expected: "Codex thread id".to_string(),
            actual: format!("{:?}", conversation.remote),
        })
}

pub(crate) fn codex_turn_id(
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
    let turn_id = effect
        .turn_id
        .as_ref()
        .ok_or_else(|| crate::EngineError::InvalidCommand {
            message: "missing turn id".to_string(),
        })?;
    let conversation = engine.conversations.get(conversation_id).ok_or_else(|| {
        crate::EngineError::ConversationNotFound {
            conversation_id: conversation_id.to_string(),
        }
    })?;
    let turn = conversation
        .turns
        .get(turn_id)
        .ok_or_else(|| crate::EngineError::TurnNotFound {
            turn_id: turn_id.to_string(),
        })?;
    match &turn.remote {
        RemoteTurnId::Known(id) => Ok(id.clone()),
        other => Err(crate::EngineError::InvalidState {
            expected: "Codex turn id".to_string(),
            actual: format!("{other:?}"),
        }),
    }
}

pub(crate) fn find_codex_conversation(
    engine: &AngelEngine,
    thread_id: &str,
) -> Option<ConversationId> {
    engine
        .conversations
        .iter()
        .find_map(|(id, conversation)| match &conversation.remote {
            RemoteConversationId::Known(remote) if remote == thread_id => Some(id.clone()),
            _ => None,
        })
        .or_else(|| {
            let selected_id = engine.selected.as_ref()?;
            let selected = engine.conversations.get(selected_id)?;
            matches!(selected.remote, RemoteConversationId::Pending(_)).then(|| selected_id.clone())
        })
}

pub(crate) fn notification_turn<'a>(
    engine: &AngelEngine,
    params: &'a Value,
) -> Option<(ConversationId, &'a str)> {
    let thread_id = params.get("threadId").and_then(Value::as_str)?;
    let remote_turn_id = params.get("turnId").and_then(Value::as_str).or_else(|| {
        params
            .get("turn")
            .and_then(|turn| turn.get("id"))
            .and_then(Value::as_str)
    })?;
    let conversation_id = find_codex_conversation(engine, thread_id)?;
    Some((conversation_id, remote_turn_id))
}

pub(crate) fn local_turn_started_event(
    engine: &AngelEngine,
    conversation_id: &ConversationId,
    remote_turn_id: &str,
) -> (TurnId, EngineEvent) {
    let turn_id = local_turn_id(engine, conversation_id, remote_turn_id)
        .unwrap_or_else(|| TurnId::new(format!("codex-{remote_turn_id}")));
    (
        turn_id.clone(),
        EngineEvent::TurnStarted {
            conversation_id: conversation_id.clone(),
            turn_id,
            remote: RemoteTurnId::Known(remote_turn_id.to_string()),
            input: Vec::new(),
        },
    )
}

pub(crate) fn ensure_local_turn_event(
    engine: &AngelEngine,
    conversation_id: &ConversationId,
    remote_turn_id: &str,
) -> (TurnId, Option<EngineEvent>) {
    if let Some(turn_id) = engine
        .conversations
        .get(conversation_id)
        .and_then(|conversation| {
            conversation.turns.iter().find_map(|(turn_id, turn)| {
                matches!(&turn.remote, RemoteTurnId::Known(id) if id == remote_turn_id)
                    .then(|| turn_id.clone())
            })
        })
    {
        return (turn_id, None);
    }
    let (turn_id, event) = local_turn_started_event(engine, conversation_id, remote_turn_id);
    (turn_id, Some(event))
}

pub(crate) fn local_turn_id(
    engine: &AngelEngine,
    conversation_id: &ConversationId,
    remote_turn_id: &str,
) -> Option<TurnId> {
    let conversation = engine.conversations.get(conversation_id)?;
    conversation
        .turns
        .iter()
        .find_map(|(turn_id, turn)| {
            matches!(&turn.remote, RemoteTurnId::Known(id) if id == remote_turn_id)
                .then(|| turn_id.clone())
        })
        .or_else(|| {
            conversation.focused_turn.as_ref().and_then(|turn_id| {
                conversation.turns.get(turn_id).and_then(|turn| {
                    matches!(turn.remote, RemoteTurnId::Pending { .. }).then(|| turn_id.clone())
                })
            })
        })
}
