use std::str::FromStr;

use angel_engine::*;
use serde::Deserialize;
use serde_json::Value;

use super::super::AcpAdapter;
use super::super::helpers::{active_turn_id, find_acp_conversation_or_pending_start};
use super::super::wire::AcpSessionUpdateKind;

mod content;
mod metadata;
mod plan_commands;
mod tool_calls;

#[cfg(test)]
mod tests;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AcpSessionUpdateParams {
    session_id: String,
    update: Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AcpSessionUpdateHead {
    session_update: String,
}

pub(super) fn decode_acp_update(
    adapter: &AcpAdapter,
    engine: &AngelEngine,
    params: &Value,
) -> Result<TransportOutput, angel_engine::EngineError> {
    let params =
        serde_json::from_value::<AcpSessionUpdateParams>(params.clone()).map_err(|error| {
            angel_engine::EngineError::InvalidCommand {
                message: format!("invalid ACP session/update params (sessionId, update): {error}"),
            }
        })?;
    let session_id = params.session_id.as_str();
    let Some(conversation_id) = find_acp_conversation_or_pending_start(engine, session_id) else {
        return Ok(TransportOutput::default().log(
            TransportLogKind::Receive,
            format!("update for unknown session {session_id}"),
        ));
    };
    let update = &params.update;
    let update_head =
        serde_json::from_value::<AcpSessionUpdateHead>(update.clone()).map_err(|error| {
            angel_engine::EngineError::InvalidCommand {
                message: format!("invalid ACP session/update payload (sessionUpdate): {error}"),
            }
        })?;
    let update_type = update_head.session_update.as_str();

    let update_kind = AcpSessionUpdateKind::from_str(update_type).ok();

    match update_kind {
        Some(AcpSessionUpdateKind::AvailableCommandsUpdate) => {
            return plan_commands::available_commands_update(conversation_id, update);
        }
        Some(AcpSessionUpdateKind::ConfigOptionUpdate) => {
            return metadata::config_option_update(conversation_id, update);
        }
        Some(AcpSessionUpdateKind::CurrentModeUpdate) => {
            return metadata::current_mode_update(conversation_id, update);
        }
        Some(AcpSessionUpdateKind::SessionInfoUpdate) => {
            return metadata::session_info_update(conversation_id, update);
        }
        Some(AcpSessionUpdateKind::UsageUpdate) => {
            return metadata::usage_update(conversation_id, update);
        }
        _ => {}
    }

    let Some(turn_id) = active_turn_id(engine, &conversation_id) else {
        if let Some(output) =
            content::hydration_update(engine, &conversation_id, update_kind, update)
        {
            return Ok(output);
        }
        return Ok(TransportOutput::default().log(
            TransportLogKind::Receive,
            "session update without active turn",
        ));
    };

    match update_kind {
        Some(AcpSessionUpdateKind::AgentMessageChunk) => {
            content::agent_message_chunk(conversation_id, turn_id, update)
        }
        Some(AcpSessionUpdateKind::AgentThoughtChunk) => {
            content::agent_thought_chunk(conversation_id, turn_id, update)
        }
        Some(AcpSessionUpdateKind::ToolCall) => {
            tool_calls::tool_call(adapter, engine, conversation_id, turn_id, update)
        }
        Some(AcpSessionUpdateKind::ToolCallUpdate) => {
            tool_calls::tool_call_update(adapter, engine, conversation_id, turn_id, update)
        }
        Some(AcpSessionUpdateKind::Plan) => {
            plan_commands::plan_update(conversation_id, turn_id, update)
        }
        _ => Ok(TransportOutput::default().log(
            TransportLogKind::Receive,
            format!("session/update {update_type}"),
        )),
    }
}
