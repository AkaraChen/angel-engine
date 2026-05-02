use super::actions::*;
use super::ids::*;
use super::*;

impl CodexAdapter {
    pub(super) fn decode_server_request(
        &self,
        engine: &AngelEngine,
        id: &JsonRpcRequestId,
        method: &str,
        params: &Value,
    ) -> Result<TransportOutput, crate::EngineError> {
        let Some(thread_id) = params.get("threadId").and_then(Value::as_str) else {
            return Ok(TransportOutput::default().log(
                TransportLogKind::Warning,
                format!("{method} request without thread id"),
            ));
        };
        let Some(conversation_id) = find_codex_conversation(engine, thread_id) else {
            return Ok(TransportOutput::default().log(
                TransportLogKind::Warning,
                format!("{method} request for unknown thread {thread_id}"),
            ));
        };
        let kind = match method {
            "item/commandExecution/requestApproval" => ElicitationKind::Approval,
            "item/fileChange/requestApproval" => ElicitationKind::Approval,
            "item/permissions/requestApproval" => ElicitationKind::PermissionProfile,
            "item/tool/requestUserInput" => ElicitationKind::UserInput,
            "mcpServer/elicitation/request" => {
                if params.get("mode").and_then(Value::as_str) == Some("url") {
                    ElicitationKind::ExternalFlow
                } else {
                    ElicitationKind::UserInput
                }
            }
            "item/tool/call" => ElicitationKind::DynamicToolCall,
            _ => {
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
        };
        let mut elicitation = ElicitationState::new(
            ElicitationId::new(format!("codex-request-{id}")),
            RemoteRequestId::Codex(id.clone()),
            kind,
        );
        if let Some(turn_id) = params.get("turnId").and_then(Value::as_str) {
            let (local_turn_id, _) = ensure_local_turn_event(engine, &conversation_id, turn_id);
            elicitation.turn_id = Some(local_turn_id);
        }
        if let Some(item_id) = params.get("itemId").and_then(Value::as_str) {
            elicitation.action_id = Some(ActionId::new(item_id.to_string()));
        }
        elicitation.options = ElicitationOptions {
            title: Some(method.to_string()),
            body: approval_body(method, params),
            choices: vec![
                "allow".to_string(),
                "deny".to_string(),
                "cancel".to_string(),
            ],
        };

        let mut output = TransportOutput::default().log(
            TransportLogKind::Warning,
            format!(
                "{} requested: {}",
                method,
                elicitation.options.body.clone().unwrap_or_default()
            ),
        );
        if let Some(action_id) = elicitation.action_id.clone()
            && let Some(turn_id) = elicitation.turn_id.clone()
            && !action_exists(engine, &conversation_id, &action_id)
        {
            output.events.push(EngineEvent::ActionObserved {
                conversation_id: conversation_id.clone(),
                action: fallback_action(action_id, turn_id, action_kind_for_request(method)),
            });
        }
        output.events.push(EngineEvent::ElicitationOpened {
            conversation_id,
            elicitation,
        });
        Ok(output)
    }
}
