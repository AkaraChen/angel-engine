use super::super::ids::*;
use super::super::wire::schema as codex_schema;
use super::super::*;

impl CodexAdapter {
    pub(super) fn decode_turn_started(
        &self,
        engine: &AngelEngine,
        notification: &codex_schema::TurnStartedNotification,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
        let Some(conversation_id) = find_codex_conversation(engine, &notification.thread_id) else {
            return Ok(TransportOutput::default());
        };
        let remote_turn_id = notification.turn.id.as_str();
        let (turn_id, event) = local_turn_started_event(engine, &conversation_id, remote_turn_id);
        let mut output = TransportOutput::default().event(event).log(
            TransportLogKind::State,
            format!("turn {remote_turn_id} started"),
        );
        if notification.turn.status == codex_schema::TurnStatus::InProgress {
            output.logs.push(angel_engine::TransportLog::new(
                TransportLogKind::State,
                format!("tracking local {turn_id}"),
            ));
        }
        Ok(output)
    }

    pub(super) fn decode_turn_completed(
        &self,
        engine: &AngelEngine,
        notification: &codex_schema::TurnCompletedNotification,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
        let Some(conversation_id) = find_codex_conversation(engine, &notification.thread_id) else {
            return Ok(TransportOutput::default());
        };
        let remote_turn_id = notification.turn.id.as_str();
        let (turn_id, maybe_start) =
            ensure_local_turn_event(engine, &conversation_id, remote_turn_id);
        let outcome = CodexAdapter::turn_status_to_outcome(
            codex_turn_status(notification.turn.status),
            codex_turn_error(notification.turn.error.as_ref()),
        );
        let mut output = TransportOutput::default().log(
            TransportLogKind::State,
            format!("turn {remote_turn_id} {}", notification.turn.status),
        );
        if let Some(event) = maybe_start {
            output.events.push(event);
        }
        output.events.push(EngineEvent::TurnTerminal {
            conversation_id,
            turn_id,
            outcome,
        });
        Ok(output)
    }
}

fn codex_turn_status(status: codex_schema::TurnStatus) -> CodexTurnStatus {
    match status {
        codex_schema::TurnStatus::Completed => CodexTurnStatus::Completed,
        codex_schema::TurnStatus::Interrupted => CodexTurnStatus::Interrupted,
        codex_schema::TurnStatus::Failed => CodexTurnStatus::Failed,
        codex_schema::TurnStatus::InProgress => CodexTurnStatus::InProgress,
    }
}

fn codex_turn_error(error: Option<&codex_schema::TurnError>) -> Option<ErrorInfo> {
    error.map(|error| ErrorInfo::new("codex.turn_failed", error.message.clone()))
}
