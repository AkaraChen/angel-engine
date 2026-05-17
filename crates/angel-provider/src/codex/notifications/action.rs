use super::super::actions::*;
use super::super::ids::*;
use super::super::*;

impl CodexAdapter {
    pub(super) fn decode_action_output(
        &self,
        engine: &AngelEngine,
        params: &Value,
        fallback_kind: ActionKind,
        terminal: bool,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
        let Some((conversation_id, remote_turn_id)) = notification_turn(engine, params) else {
            return Ok(TransportOutput::default());
        };
        let (turn_id, maybe_start) =
            ensure_local_turn_event(engine, &conversation_id, remote_turn_id);
        let item_id = params
            .get("itemId")
            .and_then(Value::as_str)
            .unwrap_or("unknown");
        let action_id = ActionId::new(item_id.to_string());
        let delta = params
            .get("delta")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let mut output = TransportOutput::default().log(TransportLogKind::Output, delta.clone());
        if let Some(event) = maybe_start {
            output.events.push(event);
        }
        if !action_exists(engine, &conversation_id, &action_id) {
            output.events.push(EngineEvent::ActionObserved {
                conversation_id: conversation_id.clone(),
                action: fallback_action(action_id.clone(), turn_id, fallback_kind),
            });
        }
        output.events.push(EngineEvent::ActionUpdated {
            conversation_id,
            action_id,
            patch: ActionPatch {
                phase: None,
                output_delta: Some(if terminal {
                    ActionOutputDelta::Terminal(delta)
                } else {
                    ActionOutputDelta::Text(delta)
                }),
                error: None,
                title: None,
            },
        });
        Ok(output)
    }

    pub(super) fn decode_file_patch(
        &self,
        engine: &AngelEngine,
        params: &Value,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
        let Some((conversation_id, remote_turn_id)) = notification_turn(engine, params) else {
            return Ok(TransportOutput::default());
        };
        let (turn_id, maybe_start) =
            ensure_local_turn_event(engine, &conversation_id, remote_turn_id);
        let item_id = params
            .get("itemId")
            .and_then(Value::as_str)
            .unwrap_or("unknown");
        let action_id = ActionId::new(item_id.to_string());
        let patch = params
            .get("changes")
            .map(Value::to_string)
            .unwrap_or_else(|| "[]".to_string());
        let mut output =
            TransportOutput::default().log(TransportLogKind::State, "file patch updated");
        if let Some(event) = maybe_start {
            output.events.push(event);
        }
        if !action_exists(engine, &conversation_id, &action_id) {
            output.events.push(EngineEvent::ActionObserved {
                conversation_id: conversation_id.clone(),
                action: fallback_action(action_id.clone(), turn_id, ActionKind::FileChange),
            });
        }
        output.events.push(EngineEvent::ActionUpdated {
            conversation_id,
            action_id,
            patch: ActionPatch {
                phase: None,
                output_delta: Some(ActionOutputDelta::Patch(patch)),
                error: None,
                title: None,
            },
        });
        Ok(output)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn output_delta_without_started_item_creates_titled_fallback_action() {
        let adapter = CodexAdapter::app_server();
        let engine = engine_with_thread(&adapter);

        let output = adapter
            .decode_notification(
                &engine,
                "item/commandExecution/outputDelta",
                &json!({
                    "threadId": "thread",
                    "turnId": "turn",
                    "itemId": "cmd_1",
                    "delta": "hello\n"
                }),
            )
            .expect("command output delta");

        assert!(output.events.iter().any(|event| matches!(
            event,
            EngineEvent::ActionObserved {
                action,
                ..
            } if action.id.as_str() == "cmd_1"
                && action.kind == ActionKind::Command
                && action.title.as_deref() == Some("Command")
                && action.input.summary.as_deref() == Some("Command")
                && action.input.raw.is_some()
        )));
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
