use super::super::actions::*;
use super::super::ids::*;
use super::super::summaries::*;
use super::super::*;

impl CodexAdapter {
    pub(super) fn decode_item(
        &self,
        engine: &AngelEngine,
        params: &Value,
        completed: bool,
    ) -> Result<TransportOutput, crate::EngineError> {
        let Some((conversation_id, remote_turn_id)) = notification_turn(engine, params) else {
            return Ok(TransportOutput::default());
        };
        let (turn_id, maybe_start) =
            ensure_local_turn_event(engine, &conversation_id, remote_turn_id);
        let Some(item) = params.get("item") else {
            return Ok(TransportOutput::default());
        };
        if item.get("type").and_then(Value::as_str) == Some("plan") {
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
                output.logs.push(crate::TransportLog::new(
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
        if completed && let Some(phase) = phase_from_item(item) {
            output.events.push(EngineEvent::ActionUpdated {
                conversation_id,
                action_id,
                patch: ActionPatch::phase(phase),
            });
        }
        Ok(output)
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn completed_plan_item_logs_saved_path_and_emits_content() {
        let adapter = CodexAdapter::app_server();
        let engine = engine_with_thread(&adapter);

        let output = adapter
            .decode_notification(
                &engine,
                "item/completed",
                &json!({
                    "threadId": "thread",
                    "turnId": "turn",
                    "item": {
                        "id": "plan",
                        "type": "plan",
                        "status": "completed",
                        "savedPath": "/tmp/plan.md",
                        "content": "# Plan\n"
                    }
                }),
            )
            .expect("plan item");

        assert_eq!(
            output.logs,
            vec![crate::TransportLog::new(
                TransportLogKind::State,
                "plan path: /tmp/plan.md"
            )]
        );
        assert!(output.events.iter().any(|event| matches!(
            event,
            EngineEvent::PlanDelta {
                delta: ContentDelta::Text(text),
                ..
            } if text == "# Plan\n"
        )));
        assert!(output.events.iter().any(|event| matches!(
            event,
            EngineEvent::PlanPathUpdated { path, .. } if path == "/tmp/plan.md"
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
