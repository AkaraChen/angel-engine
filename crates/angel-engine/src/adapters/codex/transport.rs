use super::summaries::*;
use super::*;

impl ProtocolTransport for CodexAdapter {
    fn encode_effect(
        &self,
        engine: &AngelEngine,
        effect: &crate::ProtocolEffect,
        options: &TransportOptions,
    ) -> Result<TransportOutput, crate::EngineError> {
        if matches!(
            effect.method,
            ProtocolMethod::Codex(CodexMethod::ServerRequestResponse)
        ) {
            return self.encode_server_request_response(engine, effect);
        }

        let method = method_name(&effect.method);
        let params = self.encode_params(engine, effect, options)?;
        let mut output = TransportOutput::default().log(
            TransportLogKind::Send,
            format!("{} {}", method, summarize_outbound(&method, &params)),
        );
        let message = if let Some(request_id) = &effect.request_id {
            JsonRpcMessage::request(request_id.clone(), method, params)
        } else {
            JsonRpcMessage::notification(method, params)
        };
        output.messages.push(message);
        Ok(output)
    }

    fn decode_message(
        &self,
        engine: &AngelEngine,
        message: &JsonRpcMessage,
    ) -> Result<TransportOutput, crate::EngineError> {
        match message {
            JsonRpcMessage::Response { id, result } => self.decode_response(engine, id, result),
            JsonRpcMessage::Error {
                id, message, code, ..
            } => self.decode_error(engine, id.as_ref(), *code, message),
            JsonRpcMessage::Notification { method, params } => {
                self.decode_notification(engine, method, params)
            }
            JsonRpcMessage::Request { id, method, params } => {
                self.decode_server_request(engine, id, method, params)
            }
        }
    }
}
