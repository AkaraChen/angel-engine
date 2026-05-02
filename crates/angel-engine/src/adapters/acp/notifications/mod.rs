use super::*;

mod elicitation;
mod session_update;

impl AcpAdapter {
    pub(super) fn decode_notification(
        &self,
        engine: &AngelEngine,
        method: &str,
        params: &Value,
    ) -> Result<TransportOutput, crate::EngineError> {
        match method {
            "session/update" => session_update::decode_acp_update(engine, params),
            "elicitation/complete" => elicitation::decode_elicitation_complete(engine, params),
            "$/cancel_request" => elicitation::decode_cancel_request(engine, params),
            _ => Ok(TransportOutput::default().log(
                TransportLogKind::Receive,
                format!("{method} (details hidden)"),
            )),
        }
    }
}
