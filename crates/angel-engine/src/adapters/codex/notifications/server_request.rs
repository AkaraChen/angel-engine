use super::super::*;

impl CodexAdapter {
    pub(super) fn decode_server_request_resolved(
        &self,
        engine: &AngelEngine,
        params: &Value,
    ) -> Result<TransportOutput, crate::EngineError> {
        let request_id = params
            .get("requestId")
            .or_else(|| params.get("id"))
            .map(JsonRpcRequestId::from_json_value);
        let Some(request_id) = request_id else {
            return Ok(TransportOutput::default());
        };
        for (conversation_id, conversation) in &engine.conversations {
            for (elicitation_id, elicitation) in &conversation.elicitations {
                if elicitation.remote_request_id == RemoteRequestId::JsonRpc(request_id.clone()) {
                    return Ok(TransportOutput::default()
                        .event(EngineEvent::ElicitationResolved {
                            conversation_id: conversation_id.clone(),
                            elicitation_id: elicitation_id.clone(),
                            decision: crate::ElicitationDecision::Raw("resolved".to_string()),
                        })
                        .log(TransportLogKind::State, "server request resolved"));
                }
            }
        }
        Ok(TransportOutput::default())
    }
}
