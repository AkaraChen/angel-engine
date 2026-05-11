use super::helpers::*;
use super::*;

impl AcpAdapter {
    pub fn encode_effect(
        &self,
        engine: &AngelEngine,
        effect: &angel_engine::ProtocolEffect,
        options: &TransportOptions,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
        if matches!(effect.method, ProtocolMethod::ResolveElicitation) {
            return self.encode_permission_response(engine, effect);
        }

        let method = acp_wire_method(&effect.method);
        let params = self.encode_params(engine, effect, options)?;
        let mut output = TransportOutput::default().log(
            TransportLogKind::Send,
            format!("{} {}", method, acp_outbound_summary(&method, &params)),
        );
        let message = if let Some(request_id) = &effect.request_id {
            JsonRpcMessage::request(request_id.clone(), method, params)
        } else {
            JsonRpcMessage::notification(method, params)
        };
        output.messages.push(message);
        if matches!(effect.method, ProtocolMethod::CancelTurn) {
            append_cancelled_elicitation_responses(engine, effect, &mut output);
        }
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
                id, code, message, ..
            } => self.decode_error(engine, id.as_ref(), *code, message),
            JsonRpcMessage::Notification { method, params } => {
                self.decode_notification(engine, method, params)
            }
            JsonRpcMessage::Request { id, method, params } => {
                self.decode_request(engine, id, method, params)
            }
        }
    }
}

fn acp_wire_method(method: &ProtocolMethod) -> String {
    match method {
        ProtocolMethod::Initialize => "initialize".to_string(),
        ProtocolMethod::Authenticate => "authenticate".to_string(),
        ProtocolMethod::ListConversations => "session/list".to_string(),
        ProtocolMethod::StartConversation => "session/new".to_string(),
        ProtocolMethod::ResumeConversation => "session/load".to_string(),
        ProtocolMethod::ForkConversation => "session/fork".to_string(),
        ProtocolMethod::StartTurn => "session/prompt".to_string(),
        ProtocolMethod::CancelTurn => "session/cancel".to_string(),
        ProtocolMethod::ResolveElicitation => "session/request_permission".to_string(),
        ProtocolMethod::ArchiveConversation => "conversation/archive".to_string(),
        ProtocolMethod::UnarchiveConversation => "conversation/unarchive".to_string(),
        ProtocolMethod::CloseConversation => "session/close".to_string(),
        ProtocolMethod::Unsubscribe => "session/unsubscribe".to_string(),
        ProtocolMethod::SetSessionModel => "session/set_model".to_string(),
        ProtocolMethod::SetSessionMode => "session/set_mode".to_string(),
        ProtocolMethod::SetSessionConfigOption => "session/set_session_config_option".to_string(),
        ProtocolMethod::Extension(method) => method.clone(),
        _ => method_name(method),
    }
}

fn append_cancelled_elicitation_responses(
    engine: &AngelEngine,
    effect: &angel_engine::ProtocolEffect,
    output: &mut TransportOutput,
) {
    let Some(conversation_id) = effect.conversation_id.as_ref() else {
        return;
    };
    let Some(conversation) = engine.conversations.get(conversation_id) else {
        return;
    };
    for (elicitation_id, elicitation) in &conversation.elicitations {
        if effect
            .turn_id
            .as_ref()
            .is_some_and(|turn_id| elicitation.turn_id.as_ref() != Some(turn_id))
        {
            continue;
        }
        if !matches!(
            elicitation.phase,
            ElicitationPhase::Open | ElicitationPhase::Resolving
        ) {
            continue;
        }
        let RemoteRequestId::JsonRpc(request_id) = &elicitation.remote_request_id else {
            continue;
        };
        output.messages.push(JsonRpcMessage::response(
            request_id.clone(),
            cancelled_elicitation_result(elicitation),
        ));
        output.events.push(EngineEvent::ElicitationCancelled {
            conversation_id: conversation_id.clone(),
            elicitation_id: elicitation_id.clone(),
        });
        output.logs.push(angel_engine::TransportLog {
            kind: TransportLogKind::State,
            message: "cancelled pending ACP elicitation".to_string(),
        });
    }
}

fn cancelled_elicitation_result(elicitation: &ElicitationState) -> Value {
    match elicitation.kind {
        ElicitationKind::UserInput | ElicitationKind::ExternalFlow => json!({"action": "cancel"}),
        _ => json!({"outcome": {"outcome": "cancelled"}}),
    }
}
