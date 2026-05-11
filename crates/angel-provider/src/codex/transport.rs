use super::summaries::*;
use super::*;

impl CodexAdapter {
    pub fn encode_effect(
        &self,
        engine: &AngelEngine,
        effect: &angel_engine::ProtocolEffect,
        options: &TransportOptions,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
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
    match method {
        ProtocolMethod::Authenticate => "account/login/start".to_string(),
        ProtocolMethod::Initialize => "initialize".to_string(),
        ProtocolMethod::ListConversations => "thread/list".to_string(),
        ProtocolMethod::StartConversation => "thread/start".to_string(),
        ProtocolMethod::ResumeConversation => "thread/resume".to_string(),
        ProtocolMethod::ForkConversation => "thread/fork".to_string(),
        ProtocolMethod::StartTurn => "turn/start".to_string(),
        ProtocolMethod::SteerTurn => "turn/steer".to_string(),
        ProtocolMethod::CancelTurn => "turn/interrupt".to_string(),
        ProtocolMethod::ArchiveConversation => "thread/archive".to_string(),
        ProtocolMethod::UnarchiveConversation => "thread/unarchive".to_string(),
        ProtocolMethod::CompactHistory => "thread/compact/start".to_string(),
        ProtocolMethod::RollbackHistory => "thread/rollback".to_string(),
        ProtocolMethod::InjectHistoryItems => "thread/injectItems".to_string(),
        ProtocolMethod::CloseConversation => "thread/close".to_string(),
        ProtocolMethod::Unsubscribe => "thread/unsubscribe".to_string(),
        ProtocolMethod::RunShellCommand => "thread/shellCommand".to_string(),
        ProtocolMethod::ResolveElicitation
        | ProtocolMethod::SetSessionModel
        | ProtocolMethod::SetSessionMode
        | ProtocolMethod::SetSessionConfigOption => method_name(method),
        ProtocolMethod::Extension(method) => method.clone(),
        _ => method_name(method),
    }
}
