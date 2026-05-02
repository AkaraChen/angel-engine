use crate::*;
use serde_json::Value;

pub(super) fn decode_elicitation_complete(
    engine: &AngelEngine,
    params: &Value,
) -> Result<TransportOutput, crate::EngineError> {
    let Some(remote_id) = params.get("elicitationId").and_then(Value::as_str) else {
        return Ok(TransportOutput::default().log(
            TransportLogKind::Warning,
            "elicitation/complete missing elicitationId",
        ));
    };
    let local_id = ElicitationId::new(format!("acp-elicitation-{remote_id}"));
    let Some(conversation_id) = find_conversation_with_elicitation(engine, &local_id) else {
        return Ok(TransportOutput::default().log(
            TransportLogKind::Receive,
            format!("elicitation/complete for unknown elicitation {remote_id}"),
        ));
    };
    Ok(TransportOutput::default()
        .event(EngineEvent::ElicitationResolved {
            conversation_id,
            elicitation_id: local_id,
            decision: ElicitationDecision::ExternalComplete,
        })
        .log(
            TransportLogKind::State,
            format!("elicitation {remote_id} completed"),
        ))
}

pub(super) fn decode_cancel_request(
    engine: &AngelEngine,
    params: &Value,
) -> Result<TransportOutput, crate::EngineError> {
    let Some(request_id_value) = params.get("requestId") else {
        return Ok(TransportOutput::default().log(
            TransportLogKind::Warning,
            "$/cancel_request missing requestId",
        ));
    };
    let request_id = JsonRpcRequestId::from_json_value(request_id_value);
    let mut output = TransportOutput::default().log(
        TransportLogKind::State,
        format!("ACP cancel request {request_id}"),
    );
    if let Some((conversation_id, elicitation_id)) =
        find_acp_elicitation_by_request(engine, &request_id)
    {
        output.events.push(EngineEvent::ElicitationCancelled {
            conversation_id,
            elicitation_id,
        });
        output.messages.push(JsonRpcMessage::error(
            Some(request_id),
            -32800,
            "Request cancelled",
            None,
        ));
    }
    Ok(output)
}

fn find_conversation_with_elicitation(
    engine: &AngelEngine,
    elicitation_id: &ElicitationId,
) -> Option<ConversationId> {
    engine
        .conversations
        .iter()
        .find_map(|(conversation_id, conversation)| {
            conversation
                .elicitations
                .contains_key(elicitation_id)
                .then(|| conversation_id.clone())
        })
}

fn find_acp_elicitation_by_request(
    engine: &AngelEngine,
    request_id: &JsonRpcRequestId,
) -> Option<(ConversationId, ElicitationId)> {
    engine
        .conversations
        .iter()
        .find_map(|(conversation_id, conversation)| {
            conversation
                .elicitations
                .iter()
                .find_map(|(elicitation_id, elicitation)| {
                    matches!(&elicitation.remote_request_id, RemoteRequestId::JsonRpc(id) if id == request_id)
                        .then(|| (conversation_id.clone(), elicitation_id.clone()))
                })
        })
}

#[cfg(test)]
mod tests {
    use super::super::super::AcpAdapter;
    use super::*;
    use serde_json::json;

    #[test]
    fn elicitation_complete_resolves_existing_external_flow() {
        let adapter = AcpAdapter::standard();
        let mut engine = AngelEngine::new(crate::ProtocolFlavor::Acp, adapter.capabilities());
        let conversation_id = ready_conversation(&adapter, &mut engine);
        engine
            .apply_event(EngineEvent::ElicitationOpened {
                conversation_id: conversation_id.clone(),
                elicitation: ElicitationState::new(
                    ElicitationId::new("acp-elicitation-url-1"),
                    RemoteRequestId::JsonRpc(JsonRpcRequestId::new("request-1")),
                    ElicitationKind::ExternalFlow,
                ),
            })
            .expect("open elicitation");

        let output = adapter
            .decode_notification(
                &engine,
                "elicitation/complete",
                &json!({ "elicitationId": "url-1" }),
            )
            .expect("elicitation complete");

        assert!(matches!(
            output.events.as_slice(),
            [EngineEvent::ElicitationResolved {
                conversation_id: id,
                elicitation_id,
                decision: ElicitationDecision::ExternalComplete,
            }] if id == &conversation_id && elicitation_id.as_str() == "acp-elicitation-url-1"
        ));
    }

    #[test]
    fn cancel_request_cancels_matching_acp_elicitation_without_new_public_command() {
        let adapter = AcpAdapter::standard();
        let mut engine = AngelEngine::new(crate::ProtocolFlavor::Acp, adapter.capabilities());
        let conversation_id = ready_conversation(&adapter, &mut engine);
        engine
            .apply_event(EngineEvent::ElicitationOpened {
                conversation_id: conversation_id.clone(),
                elicitation: ElicitationState::new(
                    ElicitationId::new("permission"),
                    RemoteRequestId::JsonRpc(JsonRpcRequestId::number("9")),
                    ElicitationKind::Approval,
                ),
            })
            .expect("open elicitation");

        let output = adapter
            .decode_notification(&engine, "$/cancel_request", &json!({ "requestId": 9 }))
            .expect("cancel request");

        assert!(matches!(
            output.events.as_slice(),
            [EngineEvent::ElicitationCancelled {
                conversation_id: id,
                elicitation_id,
            }] if id == &conversation_id && elicitation_id.as_str() == "permission"
        ));
        assert!(matches!(
            output.messages.as_slice(),
            [JsonRpcMessage::Error { id: Some(id), code: -32800, .. }] if id.to_json_value() == json!(9)
        ));
    }

    fn ready_conversation(adapter: &AcpAdapter, engine: &mut AngelEngine) -> ConversationId {
        let conversation_id = ConversationId::new("conv");
        engine
            .apply_event(EngineEvent::ConversationProvisionStarted {
                id: conversation_id.clone(),
                remote: RemoteConversationId::Pending("conv".to_string()),
                op: crate::ProvisionOp::New,
                capabilities: adapter.capabilities(),
            })
            .expect("conversation provision");
        engine
            .apply_event(EngineEvent::ConversationReady {
                id: conversation_id.clone(),
                remote: Some(RemoteConversationId::Known("sess".to_string())),
                context: ContextPatch::empty(),
                capabilities: None,
            })
            .expect("conversation ready");
        conversation_id
    }
}
