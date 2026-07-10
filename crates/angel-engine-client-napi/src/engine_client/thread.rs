use super::*;

impl AngelEngineClient {
    pub(super) fn with_thread(
        &mut self,
        operation: &'static str,
        conversation_id: String,
        event: EngineThreadEvent,
    ) -> Result<serde_json::Value> {
        trace_napi_sync_result(
            operation,
            format!(
                "conversation_id={} event_kind={}",
                conversation_id,
                thread_event_kind(&event)
            ),
            || self.with_thread_raw(conversation_id, event),
        )
    }

    pub(super) fn with_thread_raw(
        &mut self,
        conversation_id: String,
        event: EngineThreadEvent,
    ) -> Result<serde_json::Value> {
        let result: EngineClientCommandResult = {
            let mut thread = self.client.thread(conversation_id);
            client_result(thread.send_event(event))?
        };
        to_json(result)
    }
}
