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
        let tool_call = params.get("toolCall");
        if let Some(tool_call_id) = params
            .get("toolCallId")
            .or_else(|| tool_call.and_then(|tool_call| tool_call.get("toolCallId")))
            .and_then(Value::as_str)
        {
            elicitation.action_id = Some(ActionId::new(tool_call_id.to_string()));
        }
        elicitation.options = ElicitationOptions {
            title: params
                .get("title")
                .or_else(|| tool_call.and_then(|tool_call| tool_call.get("title")))
                .and_then(Value::as_str)
                .map(str::to_string)
                .or_else(|| Some("permission requested".to_string())),
            body: params
                .get("description")
                .and_then(Value::as_str)
                .map(str::to_string)
                .or_else(|| tool_call.and_then(tool_call_summary)),
            choices: permission_option_ids(params),
        };
        Ok(TransportOutput::default()
            .event(EngineEvent::ElicitationOpened {
                conversation_id,
                elicitation,
            })
            .log(TransportLogKind::Warning, "ACP permission requested"))
    }
}

fn permission_option_ids(params: &Value) -> Vec<String> {
    let choices = params
        .get("options")
        .and_then(Value::as_array)
        .map(|options| {
            options
                .iter()
                .filter_map(|option| option.get("optionId").and_then(Value::as_str))
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if choices.is_empty() {
        vec![
            "allow".to_string(),
            "deny".to_string(),
            "cancel".to_string(),
        ]
    } else {
        choices
    }
}

fn tool_call_summary(tool_call: &Value) -> Option<String> {
    tool_call.get("content").and_then(content_text).or_else(|| {
        tool_call
            .get("title")
            .and_then(Value::as_str)
            .map(str::to_string)
    })
}

fn content_text(value: &Value) -> Option<String> {
    if let Some(text) = value.get("text").and_then(Value::as_str) {
        return Some(text.to_string());
    }
    if let Some(array) = value.as_array() {
        let parts = array
            .iter()
            .filter_map(|item| {
                item.get("content")
                    .and_then(content_text)
                    .or_else(|| item.get("text").and_then(Value::as_str).map(str::to_string))
            })
            .collect::<Vec<_>>();
        if !parts.is_empty() {
            return Some(parts.join(""));
        }
    }
    None
}
