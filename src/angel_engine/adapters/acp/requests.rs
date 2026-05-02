use super::helpers::*;
use super::*;

impl AcpAdapter {
    pub(super) fn decode_request(
        &self,
        engine: &AngelEngine,
        id: &JsonRpcRequestId,
        method: &str,
        params: &Value,
    ) -> Result<TransportOutput, crate::angel_engine::EngineError> {
        if method != "session/request_permission" {
            return Ok(TransportOutput::default()
                .message(JsonRpcMessage::error(
                    Some(id.clone()),
                    -32601,
                    format!("unsupported client request: {method}"),
                    None,
                ))
                .log(
                    TransportLogKind::Warning,
                    format!("unsupported request {method}"),
                ));
        }
        let session_id = params
            .get("sessionId")
            .and_then(Value::as_str)
            .unwrap_or("");
        let Some(conversation_id) = find_acp_conversation(engine, session_id) else {
            return Ok(TransportOutput::default().log(
                TransportLogKind::Warning,
                format!("permission request for unknown session {session_id}"),
            ));
        };
        let mut elicitation = ElicitationState::new(
            ElicitationId::new(format!("acp-request-{id}")),
            RemoteRequestId::Acp(id.clone()),
            ElicitationKind::Approval,
        );
        if let Some(turn_id) = active_turn_id(engine, &conversation_id) {
            elicitation.turn_id = Some(turn_id);
        }
        if let Some(tool_call_id) = params.get("toolCallId").and_then(Value::as_str) {
            elicitation.action_id = Some(ActionId::new(tool_call_id.to_string()));
        }
        elicitation.options = ElicitationOptions {
            title: Some("permission requested".to_string()),
            body: params
                .get("title")
                .or_else(|| params.get("description"))
                .and_then(Value::as_str)
                .map(str::to_string),
            choices: vec![
                "allow".to_string(),
                "deny".to_string(),
                "cancel".to_string(),
            ],
        };
        Ok(TransportOutput::default()
            .event(EngineEvent::ElicitationOpened {
                conversation_id,
                elicitation,
            })
            .log(TransportLogKind::Warning, "ACP permission requested"))
    }
}
