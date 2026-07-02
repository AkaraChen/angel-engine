use super::super::actions::*;
use super::super::ids::*;
use super::super::wire::schema as codex_schema;
use super::super::*;

impl CodexAdapter {
    pub(super) fn decode_action_output(
        &self,
        engine: &AngelEngine,
        params: &Value,
        fallback_kind: ActionKind,
        terminal: bool,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
        let (thread_id, remote_turn_id, item_id, delta) = match fallback_kind {
            ActionKind::Command => {
                let notification: codex_schema::CommandExecutionOutputDeltaNotification =
                    serde_json::from_value(params.clone()).map_err(|error| {
                        angel_engine::EngineError::InvalidCommand {
                            message: error.to_string(),
                        }
                    })?;
                (
                    notification.thread_id,
                    notification.turn_id,
                    notification.item_id,
                    notification.delta,
                )
            }
            ActionKind::FileChange => {
                let notification: codex_schema::FileChangeOutputDeltaNotification =
                    serde_json::from_value(params.clone()).map_err(|error| {
                        angel_engine::EngineError::InvalidCommand {
                            message: error.to_string(),
                        }
                    })?;
                (
                    notification.thread_id,
                    notification.turn_id,
                    notification.item_id,
                    notification.delta,
                )
            }
            _ => unreachable!("Codex output delta only supports command and file change actions"),
        };
        let Some(conversation_id) = find_codex_conversation(engine, &thread_id) else {
            return Ok(TransportOutput::default());
        };
        let (turn_id, maybe_start) =
            ensure_local_turn_event(engine, &conversation_id, &remote_turn_id);
        let action_id = ActionId::new(item_id);
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
        let notification: codex_schema::FileChangePatchUpdatedNotification =
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
        let action_id = ActionId::new(notification.item_id);
        let patch = serde_json::to_string(&notification.changes).map_err(|error| {
            angel_engine::EngineError::InvalidCommand {
                message: error.to_string(),
            }
        })?;
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
