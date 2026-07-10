use super::super::*;
use super::engine_with_thread;
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
