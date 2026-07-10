use super::super::*;
use super::engine_with_thread;
use serde_json::json;

#[test]
fn codex_raw_web_search_action_has_projectable_title() {
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
                    "items": [],
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
                    "items": [],
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
