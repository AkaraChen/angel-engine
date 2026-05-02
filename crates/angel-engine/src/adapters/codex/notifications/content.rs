use super::super::ids::*;
use super::super::protocol_helpers::*;
use super::super::*;

impl CodexAdapter {
    pub(super) fn decode_text_delta(
        &self,
        engine: &AngelEngine,
        params: &Value,
        kind: DeltaKind,
    ) -> Result<TransportOutput, crate::EngineError> {
        let Some((conversation_id, remote_turn_id)) = notification_turn(engine, params) else {
            return Ok(TransportOutput::default());
        };
        let delta = params
            .get("delta")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let (turn_id, maybe_start) =
            ensure_local_turn_event(engine, &conversation_id, remote_turn_id);
        let mut output = TransportOutput::default();
        if let Some(event) = maybe_start {
            output.events.push(event);
        }
        match kind {
            DeltaKind::Assistant => {
                output.events.push(EngineEvent::AssistantDelta {
                    conversation_id,
                    turn_id,
                    delta: ContentDelta::Text(delta.clone()),
                });
                output
                    .logs
                    .push(crate::TransportLog::new(TransportLogKind::Output, delta));
            }
            DeltaKind::Reasoning => {
                output.events.push(EngineEvent::ReasoningDelta {
                    conversation_id,
                    turn_id,
                    delta: ContentDelta::Text(delta.clone()),
                });
                output.logs.push(crate::TransportLog::new(
                    TransportLogKind::Output,
                    format!("[reasoning] {delta}"),
                ));
            }
        }
        Ok(output)
    }

    pub(super) fn decode_plan_delta(
        &self,
        engine: &AngelEngine,
        params: &Value,
    ) -> Result<TransportOutput, crate::EngineError> {
        let Some((conversation_id, remote_turn_id)) = notification_turn(engine, params) else {
            return Ok(TransportOutput::default());
        };
        let delta = params
            .get("delta")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let (turn_id, maybe_start) =
            ensure_local_turn_event(engine, &conversation_id, remote_turn_id);
        let mut output = TransportOutput::default();
        if let Some(event) = maybe_start {
            output.events.push(event);
        }
        output.events.push(EngineEvent::PlanDelta {
            conversation_id,
            turn_id,
            delta: ContentDelta::Text(delta),
        });
        Ok(output)
    }

    pub(super) fn decode_plan(
        &self,
        engine: &AngelEngine,
        params: &Value,
    ) -> Result<TransportOutput, crate::EngineError> {
        let Some((conversation_id, remote_turn_id)) = notification_turn(engine, params) else {
            return Ok(TransportOutput::default());
        };
        let (turn_id, maybe_start) =
            ensure_local_turn_event(engine, &conversation_id, remote_turn_id);
        let entries: Vec<PlanEntry> = params
            .get("plan")
            .and_then(Value::as_array)
            .map(|steps| {
                steps
                    .iter()
                    .map(|step| PlanEntry {
                        content: step
                            .get("step")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_string(),
                        status: match step
                            .get("status")
                            .and_then(Value::as_str)
                            .unwrap_or("pending")
                        {
                            "in_progress" | "inProgress" => PlanEntryStatus::InProgress,
                            "completed" => PlanEntryStatus::Completed,
                            _ => PlanEntryStatus::Pending,
                        },
                    })
                    .collect()
            })
            .unwrap_or_default();
        let mut output = TransportOutput::default().log(
            TransportLogKind::State,
            format!("plan updated ({} steps)", entries.len()),
        );
        if let Some(event) = maybe_start {
            output.events.push(event);
        }
        output.events.push(EngineEvent::PlanUpdated {
            conversation_id,
            turn_id,
            plan: PlanState { entries },
        });
        Ok(output)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn plan_delta_emits_state_event_without_terminal_log() {
        let adapter = CodexAdapter::app_server();
        let engine = engine_with_thread(&adapter);

        let output = adapter
            .decode_notification(
                &engine,
                "item/plan/delta",
                &json!({
                    "threadId": "thread",
                    "turnId": "turn",
                    "itemId": "plan",
                    "delta": "# Plan\n",
                }),
            )
            .expect("plan delta");

        assert!(output.logs.is_empty());
        assert!(output.events.iter().any(|event| matches!(
            event,
            EngineEvent::PlanDelta {
                delta: ContentDelta::Text(text),
                ..
            } if text == "# Plan\n"
        )));
    }

    fn engine_with_thread(adapter: &CodexAdapter) -> AngelEngine {
        let mut engine = AngelEngine::with_available_runtime(
            crate::ProtocolFlavor::CodexAppServer,
            crate::RuntimeCapabilities::new("test"),
            adapter.capabilities(),
        );
        let conversation_id = ConversationId::new("conv");
        engine.conversations.insert(
            conversation_id.clone(),
            crate::ConversationState::new(
                conversation_id.clone(),
                RemoteConversationId::CodexThread("thread".to_string()),
                ConversationLifecycle::Idle,
                adapter.capabilities(),
            ),
        );
        engine.selected = Some(conversation_id);
        engine
    }
}
