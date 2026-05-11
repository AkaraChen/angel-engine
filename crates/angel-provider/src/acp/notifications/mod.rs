use super::*;
use std::str::FromStr;

mod elicitation;
mod session_update;

impl AcpAdapter {
    pub(super) fn decode_notification(
        &self,
        engine: &AngelEngine,
        method: &str,
        params: &Value,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
        match super::wire::AcpNotificationMethod::from_str(method) {
            Ok(super::wire::AcpNotificationMethod::SessionUpdate) => {
                session_update::decode_acp_update(engine, params)
            }
            Ok(super::wire::AcpNotificationMethod::ElicitationComplete) => {
                elicitation::decode_elicitation_complete(engine, params)
            }
            Ok(super::wire::AcpNotificationMethod::CancelRequest) => {
                elicitation::decode_cancel_request(engine, params)
            }
            Err(()) => Ok(TransportOutput::default().log(
                TransportLogKind::Receive,
                format!("{method} (details hidden)"),
            )),
        }
    }
}
