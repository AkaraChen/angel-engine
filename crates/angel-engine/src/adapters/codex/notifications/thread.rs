use super::super::ids::*;
use super::super::*;

impl CodexAdapter {
    pub(super) fn decode_thread_status(
        &self,
        engine: &AngelEngine,
        params: &Value,
    ) -> Result<TransportOutput, crate::EngineError> {
        let Some(thread_id) = params.get("threadId").and_then(Value::as_str) else {
            return Ok(TransportOutput::default());
        };
        let Some(conversation_id) = find_codex_conversation(engine, thread_id) else {
            return Ok(TransportOutput::default().log(
                TransportLogKind::Receive,
                format!("status for unknown thread {thread_id}"),
            ));
        };
        let status = params
            .get("status")
            .and_then(|status| status.get("type"))
            .and_then(Value::as_str)
            .unwrap_or("idle");
        let codex_status = match status {
            "notLoaded" => CodexThreadStatus::NotLoaded,
            "active" => {
                let flags = params
                    .get("status")
                    .and_then(|status| status.get("activeFlags"))
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                CodexThreadStatus::Active {
                    waiting_on_approval: flags
                        .iter()
                        .any(|flag| flag.as_str() == Some("waitingOnApproval")),
                    waiting_on_user_input: flags
                        .iter()
                        .any(|flag| flag.as_str() == Some("waitingOnUserInput")),
                }
            }
            "systemError" => CodexThreadStatus::SystemError,
            _ => CodexThreadStatus::Idle,
        };
        Ok(TransportOutput::default()
            .event(self.thread_status_event(conversation_id, codex_status))
            .log(
                TransportLogKind::State,
                format!("thread {thread_id} {status}"),
            ))
    }
}
