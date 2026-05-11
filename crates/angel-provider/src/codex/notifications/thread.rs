use super::super::ids::*;
use super::super::wire::schema as codex_schema;
use super::super::*;

impl CodexAdapter {
    pub(super) fn decode_thread_status(
        &self,
        engine: &AngelEngine,
        notification: &codex_schema::ThreadStatusChangedNotification,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
        let Some(conversation_id) = find_codex_conversation(engine, &notification.thread_id) else {
            return Ok(TransportOutput::default().log(
                TransportLogKind::Receive,
                format!("status for unknown thread {}", notification.thread_id),
            ));
        };
        let status = &notification.status;
        let codex_status = match status {
            codex_schema::ThreadStatus::NotLoaded => CodexThreadStatus::NotLoaded,
            codex_schema::ThreadStatus::Active(flags) => CodexThreadStatus::Active {
                waiting_on_approval: flags
                    .iter()
                    .any(|flag| matches!(flag, codex_schema::ThreadActiveFlag::WaitingOnApproval)),
                waiting_on_user_input: flags
                    .iter()
                    .any(|flag| matches!(flag, codex_schema::ThreadActiveFlag::WaitingOnUserInput)),
            },
            codex_schema::ThreadStatus::SystemError => CodexThreadStatus::SystemError,
            codex_schema::ThreadStatus::Idle => CodexThreadStatus::Idle,
        };
        Ok(TransportOutput::default()
            .event(self.thread_status_event(conversation_id, codex_status))
            .log(
                TransportLogKind::State,
                format!(
                    "thread {} {}",
                    notification.thread_id,
                    codex_status_label(status)
                ),
            ))
    }
}

fn codex_status_label(status: &codex_schema::ThreadStatus) -> &'static str {
    match status {
        codex_schema::ThreadStatus::NotLoaded => "notLoaded",
        codex_schema::ThreadStatus::Idle => "idle",
        codex_schema::ThreadStatus::SystemError => "systemError",
        codex_schema::ThreadStatus::Active(_) => "active",
    }
}
