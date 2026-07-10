use serde_json::json;

use super::*;

#[test]
fn tool_call_update_trims_cumulative_text_snapshots() {
    let adapter = AcpAdapter::standard();
    let mut engine = AngelEngine::new(angel_engine::ProtocolFlavor::Acp, adapter.capabilities());
    let conversation_id = ready_conversation(&adapter, &mut engine);
    start_ready_turn(&mut engine, &conversation_id);

    let output = adapter
        .decode_notification(
            &engine,
            "session/update",
            &json!({
                "sessionId": "sess",
                "update": {
                    "sessionUpdate": "tool_call",
                    "toolCallId": "call-1",
                    "kind": "execute",
                    "status": "in_progress",
                    "content": [
                        {
                            "type": "content",
                            "content": {
                                "type": "text",
                                "text": "x\n"
                            }
                        }
                    ]
                }
            }),
        )
        .expect("tool call");
    assert!(matches!(
        output.events.as_slice(),
        [EngineEvent::ActionObserved { action, .. }]
            if action.output.chunks == vec![ActionOutputDelta::Text("x\n".to_string())]
    ));
    apply_events(&mut engine, output.events);

    let output = adapter
        .decode_notification(
            &engine,
            "session/update",
            &json!({
                "sessionId": "sess",
                "update": {
                    "sessionUpdate": "tool_call_update",
                    "toolCallId": "call-1",
                    "status": "in_progress",
                    "content": [
                        {
                            "type": "content",
                            "content": {
                                "type": "text",
                                "text": "x\nxx\n"
                            }
                        }
                    ]
                }
            }),
        )
        .expect("tool update");
    assert!(matches!(
        output.events.as_slice(),
        [EngineEvent::ActionUpdated { patch, .. }]
            if patch.output_delta == Some(ActionOutputDelta::Text("xx\n".to_string()))
    ));
    apply_events(&mut engine, output.events);

    let output = adapter
        .decode_notification(
            &engine,
            "session/update",
            &json!({
                "sessionId": "sess",
                "update": {
                    "sessionUpdate": "tool_call_update",
                    "toolCallId": "call-1",
                    "status": "completed",
                    "content": [
                        {
                            "type": "content",
                            "content": {
                                "type": "text",
                                "text": "x\nxx\n"
                            }
                        }
                    ]
                }
            }),
        )
        .expect("tool completed");
    assert!(matches!(
        output.events.as_slice(),
        [EngineEvent::ActionUpdated { patch, .. }]
            if patch.phase == Some(ActionPhase::Completed)
                && patch.output_delta.is_none()
    ));
    apply_events(&mut engine, output.events);

    let action = engine
        .conversations
        .get(&conversation_id)
        .and_then(|conversation| conversation.actions.get(&ActionId::new("call-1")))
        .expect("action");
    assert_eq!(
        action.output.chunks,
        vec![
            ActionOutputDelta::Text("x\n".to_string()),
            ActionOutputDelta::Text("xx\n".to_string())
        ]
    );
}

#[test]
fn tool_call_update_preserves_non_cumulative_snapshots() {
    let adapter = AcpAdapter::standard();
    let mut engine = AngelEngine::new(angel_engine::ProtocolFlavor::Acp, adapter.capabilities());
    let conversation_id = ready_conversation(&adapter, &mut engine);
    let turn_id = start_ready_turn(&mut engine, &conversation_id);
    let mut action = ActionState::new(ActionId::new("call-1"), turn_id, ActionKind::Command);
    action.output.chunks = vec![ActionOutputDelta::Text("old".to_string())];
    engine
        .apply_event(EngineEvent::ActionObserved {
            conversation_id: conversation_id.clone(),
            action,
        })
        .expect("action observed");

    let output = adapter
        .decode_notification(
            &engine,
            "session/update",
            &json!({
                "sessionId": "sess",
                "update": {
                    "sessionUpdate": "tool_call_update",
                    "toolCallId": "call-1",
                    "status": "completed",
                    "content": [
                        {
                            "type": "content",
                            "content": {
                                "type": "text",
                                "text": "new"
                            }
                        }
                    ]
                }
            }),
        )
        .expect("tool update");

    assert!(matches!(
        output.events.as_slice(),
        [EngineEvent::ActionUpdated { patch, .. }]
            if patch.output_delta == Some(ActionOutputDelta::Text("new".to_string()))
    ));
}

#[test]
fn read_tool_update_prefers_output_path_for_display_title() {
    let adapter = AcpAdapter::standard();
    let mut engine = AngelEngine::new(angel_engine::ProtocolFlavor::Acp, adapter.capabilities());
    let conversation_id = ready_conversation(&adapter, &mut engine);
    start_ready_turn(&mut engine, &conversation_id);

    let output = adapter
        .decode_notification(
            &engine,
            "session/update",
            &json!({
                "sessionId": "sess",
                "update": {
                    "sessionUpdate": "tool_call",
                    "toolCallId": "read-1",
                    "title": "Read file: project-root",
                    "kind": "read",
                    "status": "in_progress"
                }
            }),
        )
        .expect("tool call");
    apply_events(&mut engine, output.events);

    let output = adapter
        .decode_notification(
            &engine,
            "session/update",
            &json!({
                "sessionId": "sess",
                "update": {
                    "sessionUpdate": "tool_call_update",
                    "toolCallId": "read-1",
                    "title": "Read file: project-root",
                    "kind": "read",
                    "status": "completed",
                    "content": [
                        {
                            "type": "content",
                            "content": {
                                "type": "text",
                                "text": "/tmp/project/src/edit-me.txt\n"
                            }
                        }
                    ]
                }
            }),
        )
        .expect("tool update");

    assert!(matches!(
        output.events.as_slice(),
        [EngineEvent::ActionUpdated { patch, .. }]
            if patch.title.as_deref() == Some("Read file: /tmp/project/src/edit-me.txt")
    ));
}
