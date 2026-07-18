use super::super::ids::*;
use super::super::protocol_helpers::*;
use super::super::wire::schema as codex_schema;
use super::super::*;

impl CodexAdapter {
    pub(super) fn decode_text_delta(
        &self,
        engine: &AngelEngine,
        thread_id: &str,
        remote_turn_id: &str,
        delta: String,
        kind: DeltaKind,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
        let Some(conversation_id) = find_codex_conversation(engine, thread_id) else {
            return Ok(TransportOutput::default());
        };
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
                output.logs.push(angel_engine::TransportLog::new(
                    TransportLogKind::Output,
                    delta,
                ));
            }
            DeltaKind::Reasoning => {
                output.events.push(EngineEvent::ReasoningDelta {
                    conversation_id,
                    turn_id,
                    delta: ContentDelta::Text(delta.clone()),
                });
                output.logs.push(angel_engine::TransportLog::new(
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
    ) -> Result<TransportOutput, angel_engine::EngineError> {
        let notification: codex_schema::PlanDeltaNotification =
            serde_json::from_value(params.clone()).map_err(|error| {
                angel_engine::EngineError::InvalidCommand {
                    message: error.to_string(),
                }
            })?;
        let Some(conversation_id) = find_codex_conversation(engine, &notification.thread_id) else {
            return Ok(TransportOutput::default());
        };
        let (turn_id, maybe_start) =
            ensure_local_turn_event(engine, &conversation_id, &notification.turn_id);
        let mut output = TransportOutput::default();
        if let Some(event) = maybe_start {
            output.events.push(event);
        }
        output.events.push(EngineEvent::PlanDelta {
            conversation_id,
            turn_id,
            delta: ContentDelta::Text(notification.delta),
        });
        Ok(output)
    }

    pub(super) fn decode_todo(
        &self,
        engine: &AngelEngine,
        params: &Value,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
        let notification: codex_schema::TurnPlanUpdatedNotification =
            serde_json::from_value(params.clone()).map_err(|error| {
                angel_engine::EngineError::InvalidCommand {
                    message: error.to_string(),
                }
            })?;
        let Some(conversation_id) = find_codex_conversation(engine, &notification.thread_id) else {
            return Ok(TransportOutput::default());
        };
        let (turn_id, maybe_start) =
            ensure_local_turn_event(engine, &conversation_id, &notification.turn_id);
        let entries: Vec<PlanEntry> = notification
            .plan
            .into_iter()
            .map(|step| PlanEntry {
                content: step.step,
                status: match step.status {
                    codex_schema::TurnPlanStepStatus::Pending => PlanEntryStatus::Pending,
                    codex_schema::TurnPlanStepStatus::InProgress => PlanEntryStatus::InProgress,
                    codex_schema::TurnPlanStepStatus::Completed => PlanEntryStatus::Completed,
                },
            })
            .collect();
        let mut output = TransportOutput::default().log(
            TransportLogKind::State,
            format!("todo updated ({} steps)", entries.len()),
        );
        if let Some(event) = maybe_start {
            output.events.push(event);
        }
        output.events.push(EngineEvent::TodoUpdated {
            conversation_id,
            turn_id,
            todo: PlanState { entries },
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

    #[test]
    fn turn_plan_update_emits_todo_event() {
        let adapter = CodexAdapter::app_server();
        let engine = engine_with_thread(&adapter);

        let output = adapter
            .decode_notification(
                &engine,
                "turn/plan/updated",
                &json!({
                    "threadId": "thread",
                    "turnId": "turn",
                    "plan": [
                        {"step": "Inspect the request", "status": "inProgress"},
                        {"step": "Apply the change", "status": "pending"}
                    ],
                }),
            )
            .expect("todo update");

        assert!(output.events.iter().any(|event| matches!(
            event,
            EngineEvent::TodoUpdated { todo, .. }
                if todo.entries[0].content == "Inspect the request"
                    && todo.entries[0].status == PlanEntryStatus::InProgress
                    && todo.entries[1].status == PlanEntryStatus::Pending
        )));
        assert!(
            !output
                .events
                .iter()
                .any(|event| matches!(event, EngineEvent::PlanUpdated { .. }))
        );
    }

    #[test]
    fn reasoning_summary_part_added_is_quiet() {
        let adapter = CodexAdapter::app_server();
        let engine = engine_with_thread(&adapter);

        let output = adapter
            .decode_notification(
                &engine,
                "item/reasoning/summaryPartAdded",
                &json!({
                    "threadId": "thread",
                    "turnId": "turn",
                    "itemId": "reasoning",
                    "summaryIndex": 0,
                }),
            )
            .expect("reasoning summary part");

        assert!(output.logs.is_empty());
        assert!(output.events.is_empty());
    }

    fn engine_with_thread(adapter: &CodexAdapter) -> AngelEngine {
        let mut engine = AngelEngine::with_available_runtime(
            angel_engine::ProtocolFlavor::CodexAppServer,
            angel_engine::RuntimeCapabilities::new("test"),
            adapter.capabilities(),
        );
        let conversation_id = ConversationId::new("conv");
        engine.conversations.insert(
            conversation_id.clone(),
            angel_engine::ConversationState::new(
                conversation_id.clone(),
                RemoteConversationId::Known("thread".to_string()),
                ConversationLifecycle::Idle,
                adapter.capabilities(),
            ),
        );
        engine.selected = Some(conversation_id);
        engine
    }
}
