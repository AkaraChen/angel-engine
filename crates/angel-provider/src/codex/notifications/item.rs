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
            vec![angel_engine::TransportLog::new(
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

    #[test]
    fn completed_reasoning_item_emits_reasoning_content() {
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
                        "id": "reasoning",
                        "type": "reasoning",
                        "content": ["Checked the repository layout. "],
                        "summary": ["Found the missing adapter mapping."]
                    }
                }),
            )
            .expect("reasoning item");

        assert!(output.logs.iter().any(|log| {
            log.kind == TransportLogKind::Output
                && log.message
                    == "[reasoning] Checked the repository layout. \nFound the missing adapter mapping."
        }));
        assert!(output.events.iter().any(|event| matches!(
            event,
            EngineEvent::ReasoningDelta {
                delta: ContentDelta::Text(text),
                ..
            } if text == "Checked the repository layout. \nFound the missing adapter mapping."
        )));
    }

    #[test]
    fn completed_reasoning_item_does_not_duplicate_streamed_reasoning() {
        let adapter = CodexAdapter::app_server();
        let mut engine = engine_with_thread(&adapter);
        let conversation_id = ConversationId::new("conv");
        let turn_id = TurnId::new("local-turn");
        engine
            .apply_event(EngineEvent::TurnStarted {
                conversation_id: conversation_id.clone(),
                turn_id: turn_id.clone(),
                remote: RemoteTurnId::Known("turn".to_string()),
                input: Vec::new(),
            })
            .expect("turn started");
        engine
            .apply_event(EngineEvent::ReasoningDelta {
                conversation_id,
                turn_id,
                delta: ContentDelta::Text("streamed reasoning".to_string()),
            })
            .expect("reasoning delta");

        let output = adapter
            .decode_notification(
                &engine,
                "item/completed",
                &json!({
                    "threadId": "thread",
                    "turnId": "turn",
                    "item": {
                        "id": "reasoning",
                        "type": "reasoning",
                        "summary": ["streamed reasoning"]
                    }
                }),
            )
            .expect("reasoning item");

        assert!(
            !output
                .events
                .iter()
                .any(|event| matches!(event, EngineEvent::ReasoningDelta { .. }))
        );
        assert!(
            !output
                .logs
                .iter()
                .any(|log| log.kind == TransportLogKind::Output)
        );
    }

    #[test]
    fn raw_response_reasoning_item_emits_summary_content() {
        let adapter = CodexAdapter::app_server();
        let engine = engine_with_thread(&adapter);

        let output = adapter
            .decode_notification(
                &engine,
                "rawResponseItem/completed",
                &json!({
                    "threadId": "thread",
                    "turnId": "turn",
                    "item": {
                        "type": "reasoning",
                        "summary": [
                            {
                                "type": "summary_text",
                                "text": "Mapped raw response reasoning."
                            }
                        ]
                    }
                }),
            )
            .expect("raw response reasoning item");

        assert!(output.logs.iter().any(|log| {
            log.kind == TransportLogKind::Output
                && log.message == "[reasoning] Mapped raw response reasoning."
        }));
        assert!(output.events.iter().any(|event| matches!(
            event,
            EngineEvent::ReasoningDelta {
                delta: ContentDelta::Text(text),
                ..
            } if text == "Mapped raw response reasoning."
        )));
    }

    #[test]
    fn raw_response_web_search_without_title_uses_provider_fallback() {
        let adapter = CodexAdapter::app_server();
        let engine = engine_with_thread(&adapter);

        let output = adapter
            .decode_notification(
                &engine,
                "rawResponseItem/completed",
                &json!({
                    "threadId": "thread",
                    "turnId": "turn",
                    "item": {
                        "id": "search_1",
                        "type": "web_search_call",
                        "status": "completed",
                        "action": { "type": "other" }
                    }
                }),
            )
            .expect("raw web search item");

        assert!(output.events.iter().any(|event| matches!(
            event,
            EngineEvent::ActionObserved {
                action,
                ..
            } if action.id.as_str() == "search_1"
                && action.kind == ActionKind::WebSearch
                && action.title.as_deref() == Some("Web search")
                && action.input.summary.as_deref() == Some("Web search")
                && action.input.raw.is_some()
        )));
        assert!(output.events.iter().any(|event| matches!(
            event,
            EngineEvent::ActionUpdated {
                action_id,
                patch:
                    ActionPatch {
                        phase: Some(ActionPhase::Completed),
                        ..
                    },
                ..
            } if action_id.as_str() == "search_1"
        )));
    }

    #[test]
    fn output_only_dynamic_tool_without_title_uses_tool_name() {
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
                        "id": "tool_1",
                        "type": "dynamicToolCall",
                        "status": "completed",
                        "namespace": "web",
                        "tool": "search",
                        "contentItems": [
                            { "type": "input_text", "text": "done" }
                        ]
                    }
                }),
            )
            .expect("dynamic tool item");

        assert!(output.events.iter().any(|event| matches!(
            event,
            EngineEvent::ActionObserved {
                action,
                ..
            } if action.id.as_str() == "tool_1"
                && action.kind == ActionKind::DynamicTool
                && action.title.as_deref() == Some("web.search")
                && action.input.summary.as_deref() == Some("web.search")
                && action.input.raw.is_some()
        )));
    }

    #[test]
    fn next_stream_item_completes_open_web_search() {
        let adapter = CodexAdapter::app_server();
        let mut engine = engine_with_thread(&adapter);

        let search = adapter
            .decode_notification(
                &engine,
                "item/started",
                &json!({
                    "threadId": "thread",
                    "turnId": "turn",
                    "item": {
                        "id": "search_1",
                        "type": "webSearch",
                        "status": "inProgress",
                        "query": "adapter lifecycle"
                    }
                }),
            )
            .expect("web search started");
        angel_engine::apply_transport_output(&mut engine, &search).expect("apply search");

        let output = adapter
            .decode_notification(
                &engine,
                "item/started",
                &json!({
                    "threadId": "thread",
                    "turnId": "turn",
                    "item": {
                        "id": "cmd_1",
                        "type": "commandExecution",
                        "status": "inProgress",
                        "command": "git status"
                    }
                }),
            )
            .expect("next item");

        assert!(output.events.iter().any(|event| matches!(
            event,
            EngineEvent::ActionUpdated {
                action_id,
                patch:
                    ActionPatch {
                        phase: Some(ActionPhase::Completed),
                        ..
                    },
                ..
            } if action_id.as_str() == "search_1"
        )));
        assert!(output.events.iter().any(|event| matches!(
            event,
            EngineEvent::ActionObserved {
                action,
                ..
            } if action.id.as_str() == "cmd_1"
        )));
    }

    #[test]
    fn next_stream_item_completes_open_image_generation() {
        let adapter = CodexAdapter::app_server();
        let mut engine = engine_with_thread(&adapter);

        let image = adapter
            .decode_notification(
                &engine,
                "item/started",
                &json!({
                    "threadId": "thread",
                    "turnId": "turn",
                    "item": {
                        "id": "image_1",
                        "type": "imageGeneration",
                        "status": "",
                        "revisedPrompt": null,
                        "result": "",
                        "savedPath": null
                    }
                }),
            )
            .expect("image generation started");
        angel_engine::apply_transport_output(&mut engine, &image).expect("apply image generation");

        let output = adapter
            .decode_notification(
                &engine,
                "item/started",
                &json!({
                    "threadId": "thread",
                    "turnId": "turn",
                    "item": {
                        "id": "cmd_1",
                        "type": "commandExecution",
                        "status": "inProgress",
                        "command": "git status"
                    }
                }),
            )
            .expect("next item");

        assert!(output.events.iter().any(|event| matches!(
            event,
            EngineEvent::ActionUpdated {
                action_id,
                patch:
                    ActionPatch {
                        phase: Some(ActionPhase::Completed),
                        ..
                    },
                ..
            } if action_id.as_str() == "image_1"
        )));
        assert!(output.events.iter().any(|event| matches!(
            event,
            EngineEvent::ActionObserved {
                action,
                ..
            } if action.id.as_str() == "cmd_1"
        )));
    }

    #[test]
    fn turn_completed_completes_open_web_search() {
        let adapter = CodexAdapter::app_server();
        let mut engine = engine_with_thread(&adapter);

        let search = adapter
            .decode_notification(
                &engine,
                "item/started",
                &json!({
                    "threadId": "thread",
                    "turnId": "turn",
                    "item": {
                        "id": "search_1",
                        "type": "webSearch",
                        "status": "inProgress",
                        "query": "adapter lifecycle"
                    }
                }),
            )
            .expect("web search started");
        angel_engine::apply_transport_output(&mut engine, &search).expect("apply search");

        let output = adapter
            .decode_notification(
                &engine,
                "turn/completed",
                &json!({
                    "threadId": "thread",
                    "turn": {
                        "id": "turn",
                        "status": "completed"
                    }
                }),
            )
            .expect("turn completed");

        assert!(output.events.iter().any(|event| matches!(
            event,
            EngineEvent::ActionUpdated {
                action_id,
                patch:
                    ActionPatch {
                        phase: Some(ActionPhase::Completed),
                        ..
                    },
                ..
            } if action_id.as_str() == "search_1"
        )));
        assert!(
            output
                .events
                .iter()
                .any(|event| matches!(event, EngineEvent::TurnTerminal { .. }))
        );
    }

    #[test]
    fn turn_completed_completes_open_image_generation() {
        let adapter = CodexAdapter::app_server();
        let mut engine = engine_with_thread(&adapter);

        let image = adapter
            .decode_notification(
                &engine,
                "item/started",
                &json!({
                    "threadId": "thread",
                    "turnId": "turn",
                    "item": {
                        "id": "image_1",
                        "type": "imageGeneration",
                        "status": "",
                        "revisedPrompt": null,
                        "result": "",
                        "savedPath": null
                    }
                }),
            )
            .expect("image generation started");
        angel_engine::apply_transport_output(&mut engine, &image).expect("apply image generation");

        let output = adapter
            .decode_notification(
                &engine,
                "turn/completed",
                &json!({
                    "threadId": "thread",
                    "turn": {
                        "id": "turn",
                        "status": "completed"
                    }
                }),
            )
            .expect("turn completed");

        assert!(output.events.iter().any(|event| matches!(
            event,
            EngineEvent::ActionUpdated {
                action_id,
                patch:
                    ActionPatch {
                        phase: Some(ActionPhase::Completed),
                        ..
                    },
                ..
            } if action_id.as_str() == "image_1"
        )));
        assert!(
            output
                .events
                .iter()
                .any(|event| matches!(event, EngineEvent::TurnTerminal { .. }))
        );
    }

    #[test]
    fn completed_web_search_item_without_status_is_completed() {
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
                        "id": "search_1",
                        "type": "webSearch",
                        "query": "adapter lifecycle"
                    }
                }),
            )
            .expect("web search completed");

        assert!(output.events.iter().any(|event| matches!(
            event,
            EngineEvent::ActionUpdated {
                action_id,
                patch:
                    ActionPatch {
                        phase: Some(ActionPhase::Completed),
                        ..
                    },
                ..
            } if action_id.as_str() == "search_1"
        )));
    }

    #[test]
    fn completed_image_generation_item_without_status_is_completed() {
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
                        "id": "image_1",
                        "type": "imageGeneration",
                        "revisedPrompt": "Draw a diagram",
                        "result": "image/png;base64,abc",
                        "savedPath": "/tmp/image.png"
                    }
                }),
            )
            .expect("image generation completed");

        assert!(output.events.iter().any(|event| matches!(
            event,
            EngineEvent::ActionUpdated {
                action_id,
                patch:
                    ActionPatch {
                        phase: Some(ActionPhase::Completed),
                        ..
                    },
                ..
            } if action_id.as_str() == "image_1"
        )));
    }

    #[test]
    fn completed_image_view_item_without_status_is_completed() {
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
                        "id": "image_view_1",
                        "type": "imageView",
                        "path": "/tmp/image.png"
                    }
                }),
            )
            .expect("image view completed");

        assert!(output.events.iter().any(|event| matches!(
            event,
            EngineEvent::ActionUpdated {
                action_id,
                patch:
                    ActionPatch {
                        phase: Some(ActionPhase::Completed),
                        ..
                    },
                ..
            } if action_id.as_str() == "image_view_1"
        )));
    }

    #[test]
    fn completed_context_compaction_item_without_status_is_completed() {
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
                        "id": "compact_1",
                        "type": "contextCompaction"
                    }
                }),
            )
            .expect("context compaction completed");

        assert!(output.events.iter().any(|event| matches!(
            event,
            EngineEvent::ActionUpdated {
                action_id,
                patch:
                    ActionPatch {
                        phase: Some(ActionPhase::Completed),
                        ..
                    },
                ..
            } if action_id.as_str() == "compact_1"
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
