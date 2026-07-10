use super::*;

pub(super) fn codex_rpc_error_event(
    pending: &PendingRequest,
    code: i64,
    message: &str,
) -> Option<EngineEvent> {
    match pending {
        PendingRequest::StartTurn {
            conversation_id,
            turn_id,
        } => Some(EngineEvent::TurnTerminal {
            conversation_id: conversation_id.clone(),
            turn_id: turn_id.clone(),
            outcome: TurnOutcome::Failed(ErrorInfo::new(
                format!("codex.rpc.{code}"),
                message.to_string(),
            )),
        }),
        PendingRequest::StartConversation { conversation_id }
        | PendingRequest::ForkConversation { conversation_id }
        | PendingRequest::ResumeConversation {
            conversation_id, ..
        } => Some(EngineEvent::ConversationStatusChanged {
            id: conversation_id.clone(),
            lifecycle: angel_engine::ConversationLifecycle::Faulted(ErrorInfo::new(
                format!("codex.rpc.{code}"),
                message.to_string(),
            )),
        }),
        PendingRequest::HistoryMutation { conversation_id } => {
            Some(history_mutation_failed_event(conversation_id, message))
        }
        _ => None,
    }
}

fn history_mutation_failed_event(conversation_id: &ConversationId, message: &str) -> EngineEvent {
    EngineEvent::HistoryMutationFinished {
        conversation_id: conversation_id.clone(),
        result: angel_engine::HistoryMutationResult {
            success: false,
            workspace_reverted: false,
            message: Some(message.to_string()),
        },
    }
}
