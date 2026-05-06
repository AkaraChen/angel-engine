use super::super::actions::turn_error;
use super::super::ids::*;
use super::super::*;

impl CodexAdapter {
    pub(super) fn decode_turn_started(
        &self,
        engine: &AngelEngine,
        params: &Value,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
        let Some((conversation_id, remote_turn_id)) = notification_turn(engine, params) else {
            return Ok(TransportOutput::default());
        };
        let (turn_id, event) = local_turn_started_event(engine, &conversation_id, remote_turn_id);
        let mut output = TransportOutput::default().event(event).log(
            TransportLogKind::State,
            format!("turn {remote_turn_id} started"),
        );
        if let Some(turn) = params.get("turn")
            && turn.get("status").and_then(Value::as_str) == Some("inProgress")
        {
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
        params: &Value,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
        let Some((conversation_id, remote_turn_id)) = notification_turn(engine, params) else {
            return Ok(TransportOutput::default());
        };
        let (turn_id, maybe_start) =
            ensure_local_turn_event(engine, &conversation_id, remote_turn_id);
        let status = params
            .get("turn")
            .and_then(|turn| turn.get("status"))
            .and_then(Value::as_str)
            .unwrap_or("completed");
        let outcome = CodexAdapter::turn_status_to_outcome(
            match status {
                "interrupted" => CodexTurnStatus::Interrupted,
                "failed" => CodexTurnStatus::Failed,
                "inProgress" => CodexTurnStatus::InProgress,
                _ => CodexTurnStatus::Completed,
            },
            turn_error(params.get("turn")),
        );
        let mut output = TransportOutput::default().log(
            TransportLogKind::State,
            format!("turn {remote_turn_id} {status}"),
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
