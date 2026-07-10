use angel_engine::*;
use serde_json::Value;

use super::super::super::helpers::{
    acp_session_info_context, session_config_options, session_usage_state,
};

pub(super) fn config_option_update(
    conversation_id: ConversationId,
    update: &Value,
) -> Result<TransportOutput, angel_engine::EngineError> {
    let options = session_config_options(update);
    return Ok(TransportOutput::default()
        .event(EngineEvent::SessionConfigOptionsUpdated {
            conversation_id,
            options: options.clone(),
        })
        .log(
            TransportLogKind::State,
            format!("config options updated: {}", options.len()),
        ));
}

pub(super) fn current_mode_update(
    conversation_id: ConversationId,
    update: &Value,
) -> Result<TransportOutput, angel_engine::EngineError> {
    let Some(mode_id) = update
        .get("modeId")
        .or_else(|| update.get("currentModeId"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|mode_id| !mode_id.is_empty())
        .map(str::to_string)
    else {
        return Err(angel_engine::EngineError::InvalidCommand {
            message: "ACP current mode update missing modeId/currentModeId".to_string(),
        });
    };
    return Ok(TransportOutput::default()
        .event(EngineEvent::SessionModeChanged {
            conversation_id,
            mode_id: mode_id.clone(),
        })
        .log(TransportLogKind::State, format!("mode changed: {mode_id}")));
}

pub(super) fn session_info_update(
    conversation_id: ConversationId,
    update: &Value,
) -> Result<TransportOutput, angel_engine::EngineError> {
    let patch = acp_session_info_context(update);
    return Ok(TransportOutput::default()
        .event(EngineEvent::ContextUpdated {
            conversation_id,
            patch,
        })
        .log(TransportLogKind::State, "session info updated"));
}

pub(super) fn usage_update(
    conversation_id: ConversationId,
    update: &Value,
) -> Result<TransportOutput, angel_engine::EngineError> {
    let Some(usage) = session_usage_state(update) else {
        return Ok(TransportOutput::default().log(
            TransportLogKind::Warning,
            "ignoring invalid ACP usage update",
        ));
    };
    return Ok(TransportOutput::default()
        .event(EngineEvent::SessionUsageUpdated {
            conversation_id,
            usage,
        })
        .log(TransportLogKind::State, "usage updated"));
}
