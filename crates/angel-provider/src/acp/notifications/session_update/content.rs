use angel_engine::*;
use serde_json::Value;

use super::super::super::helpers::{
    acp_tool_history_entry, content_delta_from_update, content_delta_log_text,
};
use super::super::super::wire::AcpSessionUpdateKind;

pub(super) fn agent_message_chunk(
    conversation_id: ConversationId,
    turn_id: TurnId,
    update: &Value,
) -> Result<TransportOutput, angel_engine::EngineError> {
    let delta = content_delta_from_update(update);
    let log_text = content_delta_log_text(&delta);
    Ok(TransportOutput::default()
        .event(EngineEvent::AssistantDelta {
            conversation_id,
            turn_id,
            delta,
        })
        .log(TransportLogKind::Output, log_text))
}

pub(super) fn agent_thought_chunk(
    conversation_id: ConversationId,
    turn_id: TurnId,
    update: &Value,
) -> Result<TransportOutput, angel_engine::EngineError> {
    let delta = content_delta_from_update(update);
    let log_text = content_delta_log_text(&delta);
    Ok(TransportOutput::default()
        .event(EngineEvent::ReasoningDelta {
            conversation_id,
            turn_id,
            delta,
        })
        .log(TransportLogKind::Output, format!("[reasoning] {log_text}")))
}

pub(super) fn hydration_update(
    engine: &AngelEngine,
    conversation_id: &ConversationId,
    update_kind: Option<AcpSessionUpdateKind>,
    update: &Value,
) -> Option<TransportOutput> {
    let conversation = engine.conversations.get(conversation_id)?;
    if !matches!(
        conversation.lifecycle,
        ConversationLifecycle::Hydrating { .. }
    ) {
        return None;
    }
    let entry = match update_kind? {
        AcpSessionUpdateKind::UserMessageChunk => HistoryReplayEntry {
            role: HistoryRole::User,
            content: content_delta_from_update(update),
            tool: None,
        },
        AcpSessionUpdateKind::AgentMessageChunk => HistoryReplayEntry {
            role: HistoryRole::Assistant,
            content: content_delta_from_update(update),
            tool: None,
        },
        AcpSessionUpdateKind::AgentThoughtChunk => HistoryReplayEntry {
            role: HistoryRole::Reasoning,
            content: content_delta_from_update(update),
            tool: None,
        },
        AcpSessionUpdateKind::ToolCall | AcpSessionUpdateKind::ToolCallUpdate => {
            acp_tool_history_entry(update)?
        }
        _ => return None,
    };
    Some(
        TransportOutput::default()
            .event(EngineEvent::HistoryReplayChunk {
                conversation_id: conversation_id.clone(),
                entry,
            })
            .log(
                TransportLogKind::State,
                format!("hydrated {}", update_kind?.wire_string()),
            ),
    )
}
