use super::super::actions::*;
use super::super::ids::*;
use super::super::summaries::*;
use super::super::wire::CodexThreadItemKind;
use super::super::*;

impl CodexAdapter {
    pub(super) fn decode_item(
        &self,
        engine: &AngelEngine,
        params: &Value,
        completed: bool,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
        let Some((conversation_id, remote_turn_id)) = notification_turn(engine, params) else {
            return Ok(TransportOutput::default());
        };
        let (turn_id, maybe_start) =
            ensure_local_turn_event(engine, &conversation_id, remote_turn_id);
        let Some(item) = params.get("item") else {
            return Ok(TransportOutput::default());
        };
        if item.get("type").and_then(Value::as_str) == Some(CodexThreadItemKind::Plan.as_str()) {
            let mut output = TransportOutput::default();
            if let Some(event) = maybe_start {
                output.events.push(event);
            }
            if completed
                && !turn_has_plan_text(engine, &conversation_id, &turn_id)
                && let Some(content) = plan_item_content(item)
            {
                output.events.push(EngineEvent::PlanDelta {
                    conversation_id: conversation_id.clone(),
                    turn_id: turn_id.clone(),
                    delta: ContentDelta::Text(content),
                });
            }
            if let Some(path) = plan_item_saved_path(item) {
                output.events.push(EngineEvent::PlanPathUpdated {
                    conversation_id: conversation_id.clone(),
                    turn_id: turn_id.clone(),
                    path,
                });
                output.logs.push(angel_engine::TransportLog::new(
                    TransportLogKind::State,
                    summarize_item(item, completed),
                ));
            }
            return Ok(output);
        }
        if item.get("type").and_then(Value::as_str) == Some(CodexThreadItemKind::Reasoning.as_str())
        {
            let mut output = TransportOutput::default();
            if let Some(event) = maybe_start {
                output.events.push(event);
            }
            let mut emitted_reasoning = false;
            if completed
                && !turn_has_reasoning_text(engine, &conversation_id, &turn_id)
                && let Some(content) = reasoning_item_content(item)
            {
                output.events.push(EngineEvent::ReasoningDelta {
                    conversation_id: conversation_id.clone(),
                    turn_id: turn_id.clone(),
                    delta: ContentDelta::Text(content.clone()),
                });
                output.logs.push(angel_engine::TransportLog::new(
                    TransportLogKind::Output,
                    format!("[reasoning] {content}"),
                ));
                emitted_reasoning = true;
            }
            if !emitted_reasoning {
                output.logs.push(angel_engine::TransportLog::new(
                    TransportLogKind::State,
                    summarize_item(item, completed),
                ));
            }
            return Ok(output);
        }
        let Some(action) = action_from_item(item, &turn_id) else {
            let mut output = TransportOutput::default()
                .log(TransportLogKind::State, summarize_item(item, completed));
            if let Some(event) = maybe_start {
                output.events.push(event);
            }
            return Ok(output);
        };
        let action_id = action.id.clone();
        let action_kind = action.kind.clone();
        let mut output = TransportOutput::default()
            .log(TransportLogKind::State, summarize_item(item, completed));
        if let Some(event) = maybe_start {
            output.events.push(event);
        }
        if !engine
            .conversations
            .get(&conversation_id)
            .map(|conversation| conversation.actions.contains_key(&action_id))
            .unwrap_or(false)
        {
            output.events.push(EngineEvent::ActionObserved {
                conversation_id: conversation_id.clone(),
                action,
            });
        }
        let completed_phase = completed_phase_from_item(item, &action_kind);
        if completed && let Some(phase) = completed_phase {
            output.events.push(EngineEvent::ActionUpdated {
                conversation_id,
                action_id,
                patch: ActionPatch::phase(phase),
            });
        }
        Ok(output)
    }
}

fn turn_has_reasoning_text(
    engine: &AngelEngine,
    conversation_id: &ConversationId,
    turn_id: &TurnId,
) -> bool {
    engine
        .conversations
        .get(conversation_id)
        .and_then(|conversation| conversation.turns.get(turn_id))
        .map(|turn| !turn.reasoning.chunks.is_empty())
        .unwrap_or(false)
}

fn turn_has_plan_text(
    engine: &AngelEngine,
    conversation_id: &ConversationId,
    turn_id: &TurnId,
) -> bool {
    engine
        .conversations
        .get(conversation_id)
        .and_then(|conversation| conversation.turns.get(turn_id))
        .map(|turn| !turn.plan_text.chunks.is_empty())
        .unwrap_or(false)
}

fn reasoning_item_content(item: &Value) -> Option<String> {
    let parts = ["content", "summary"]
        .iter()
        .filter_map(|key| item.get(*key))
        .filter_map(reasoning_text_from_value)
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>();
    (!parts.is_empty()).then(|| parts.join("\n"))
}

fn reasoning_text_from_value(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Array(items) => {
            let text = items
                .iter()
                .filter_map(reasoning_text_from_value)
                .collect::<String>();
            (!text.is_empty()).then_some(text)
        }
        Value::Object(object) => ["text", "content", "summary", "delta"]
            .iter()
            .find_map(|key| object.get(*key).and_then(reasoning_text_from_value)),
        _ => None,
    }
}

#[cfg(test)]
mod tests;
