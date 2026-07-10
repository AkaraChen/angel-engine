use super::*;

impl AcpAdapter {
    pub(super) fn decode_update_context_response(
        &self,
        mut output: TransportOutput,
        id: &JsonRpcRequestId,
        conversation_id: &ConversationId,
        patch: &ContextPatch,
        result: &Value,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
        let config_options = session_config_options(result);
        if !config_options.is_empty() {
            output = output.event(EngineEvent::SessionConfigOptionsUpdated {
                conversation_id: conversation_id.clone(),
                options: config_options,
            });
        } else {
            output = output.event(EngineEvent::ContextUpdated {
                conversation_id: conversation_id.clone(),
                patch: patch.clone(),
            });
        }
        output = output.log(TransportLogKind::Receive, format!("response {id}"));
        Ok(output)
    }
}

pub(super) fn append_session_settings_events(
    output: &mut TransportOutput,
    conversation_id: &ConversationId,
    result: &Value,
) {
    let config_options = session_config_options(result);
    if !config_options.is_empty() {
        output
            .events
            .push(EngineEvent::SessionConfigOptionsUpdated {
                conversation_id: conversation_id.clone(),
                options: config_options,
            });
    }
    if let Some(modes) = session_mode_state(result) {
        output.events.push(EngineEvent::SessionModesUpdated {
            conversation_id: conversation_id.clone(),
            modes,
        });
    }
    if let Some(models) = session_model_state(result) {
        output.events.push(EngineEvent::SessionModelsUpdated {
            conversation_id: conversation_id.clone(),
            models,
        });
    }
}
