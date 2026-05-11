use super::summaries::*;
use super::wire::codex_client_request_method;
use super::*;

impl CodexAdapter {
    pub fn encode_effect(
        &self,
        engine: &AngelEngine,
        effect: &angel_engine::ProtocolEffect,
        options: &TransportOptions,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
        if matches!(effect.method, ProtocolMethod::UpdateContext) {
            let mut output =
                TransportOutput::default().log(TransportLogKind::State, "Codex context updated");
            if let Some(request_id) = &effect.request_id {
                output.completed_requests.push(request_id.clone());
            }
            return Ok(output);
        }
        if matches!(effect.method, ProtocolMethod::ResolveElicitation) {
            return self.encode_server_request_response(engine, effect);
        }

        let method = codex_wire_method(&effect.method);
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

    pub fn decode_message(
        &self,
        engine: &AngelEngine,
        message: &JsonRpcMessage,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
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

fn codex_wire_method(method: &ProtocolMethod) -> String {
    if let Some(method) = codex_client_request_method(method) {
        return method.as_str().to_string();
    }

    match method {
        ProtocolMethod::ResolveElicitation
        | ProtocolMethod::SetSessionModel
        | ProtocolMethod::SetSessionMode
        | ProtocolMethod::SetSessionConfigOption => method_name(method),
        ProtocolMethod::Extension(method) => method.clone(),
        _ => method_name(method),
    }
}
