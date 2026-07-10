use std::collections::HashSet;

use crate::error::{ClientError, ClientResult};
use crate::event::{ClientEvent, ClientStreamDelta, ClientUpdate};

use super::types::{TurnRunDeltaPart, TurnRunEvent};

pub(super) fn is_ordered_stream_event(event: &ClientEvent) -> bool {
    matches!(
        event,
        ClientEvent::ActionObserved { .. }
            | ClientEvent::ActionUpdated { .. }
            | ClientEvent::AssistantDelta { .. }
            | ClientEvent::PlanDelta { .. }
            | ClientEvent::PlanUpdated { .. }
            | ClientEvent::ReasoningDelta { .. }
    )
}

pub(super) fn action_output_delta_ids(deltas: &[ClientStreamDelta]) -> HashSet<String> {
    deltas
        .iter()
        .filter_map(|delta| match delta {
            ClientStreamDelta::ActionOutputDelta { action_id, .. } => Some(action_id.clone()),
            _ => None,
        })
        .collect()
}

pub(super) fn is_terminal_action_phase_label(phase: &str) -> bool {
    matches!(phase, "completed" | "failed" | "declined" | "cancelled")
}

pub(super) fn is_result_event(event: &TurnRunEvent) -> bool {
    matches!(event, TurnRunEvent::Result { .. })
}

pub(super) fn turn_run_delta_part(part: &str) -> TurnRunDeltaPart {
    match part {
        "reasoning" => TurnRunDeltaPart::Reasoning,
        _ => TurnRunDeltaPart::Text,
    }
}

pub(super) fn selected_config_value(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

pub(super) fn invalid_input(message: impl Into<String>) -> ClientError {
    ClientError::InvalidInput {
        message: message.into(),
    }
}

pub(super) fn check_update_fault(update: &ClientUpdate) -> ClientResult<()> {
    for event in &update.events {
        if let ClientEvent::RuntimeFaulted { code, message } = event {
            return Err(ClientError::RuntimeFaulted {
                code: code.clone(),
                message: message.clone(),
            });
        }
    }
    Ok(())
}

pub(super) fn request_completed(update: &ClientUpdate, request_id: &str) -> bool {
    update
        .completed_request_ids
        .iter()
        .any(|completed| completed == request_id)
}
