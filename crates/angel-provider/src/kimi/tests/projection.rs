use std::fs;

use serde_json::json;

use super::*;

#[test]
fn empty_successful_prompt_is_normalized_to_a_failed_turn() {
    let adapter = KimiAdapter::standard();
    let (mut engine, conversation_id) = ready_engine(&adapter);
    let plan = engine
        .plan_command(EngineCommand::StartTurn {
            conversation_id: conversation_id.clone(),
            input: vec![UserInput::text("hello")],
            overrides: TurnOverrides::default(),
        })
        .expect("plan turn");
    let request_id = plan.request_id.expect("request id");

    let output = adapter
        .decode_message(
            &engine,
            &JsonRpcMessage::response(request_id, json!({"stopReason": "end_turn"})),
        )
        .expect("decode prompt response");

    assert!(output.events.iter().any(|event| {
        matches!(
            event,
            EngineEvent::TurnTerminal {
                conversation_id: id,
                outcome: TurnOutcome::Failed(error),
                ..
            } if id == &conversation_id
                && error.code == "kimi.empty_response"
                && error.message == "Kimi ended the turn without producing a response."
        )
    }));
}

#[test]
fn successful_prompt_with_output_remains_successful() {
    let adapter = KimiAdapter::standard();
    let (mut engine, conversation_id) = ready_engine(&adapter);
    let plan = engine
        .plan_command(EngineCommand::StartTurn {
            conversation_id: conversation_id.clone(),
            input: vec![UserInput::text("hello")],
            overrides: TurnOverrides::default(),
        })
        .expect("plan turn");
    let turn_id = plan.turn_id.expect("turn id");
    let request_id = plan.request_id.expect("request id");
    engine
        .apply_event(EngineEvent::AssistantDelta {
            conversation_id: conversation_id.clone(),
            turn_id,
            delta: ContentDelta::Text("hello".to_string()),
        })
        .expect("assistant delta");

    let output = adapter
        .decode_message(
            &engine,
            &JsonRpcMessage::response(request_id, json!({"stopReason": "end_turn"})),
        )
        .expect("decode prompt response");

    assert!(output.events.iter().any(|event| {
        matches!(
            event,
            EngineEvent::TurnTerminal {
                conversation_id: id,
                outcome: TurnOutcome::Succeeded,
                ..
            } if id == &conversation_id
        )
    }));
}

#[test]
fn write_plan_file_tool_call_projects_kimi_plan_update() {
    let adapter = KimiAdapter::standard();
    let (mut engine, conversation_id) = ready_engine(&adapter);
    let turn_id = start_turn(&mut engine, &conversation_id);
    let path = "~/.kimi/plans/fixture-plan.md";
    let content = "# Plan\n\n1. Read code\n2. Write patch\n";
    let args = serde_json::to_string(&json!({
        "path": path,
        "content": content
    }))
    .expect("args");

    let output = adapter
        .decode_message(
            &engine,
            &JsonRpcMessage::notification(
                "session/update",
                json!({
                    "sessionId": "sess",
                    "update": {
                        "sessionUpdate": "tool_call",
                        "toolCallId": "turn/tool-write-plan",
                        "title": format!("WriteFile: {path}"),
                        "status": "in_progress",
                        "content": [
                            {
                                "type": "content",
                                "content": {
                                    "type": "text",
                                    "text": args
                                }
                            }
                        ]
                    }
                }),
            ),
        )
        .expect("decode plan write");

    assert!(output.events.iter().any(|event| {
        matches!(
            event,
            EngineEvent::PlanPathUpdated { turn_id: id, path: stored_path, .. }
                if id == &turn_id && stored_path == path
        )
    }));
    assert!(output.events.iter().any(|event| {
        matches!(
            event,
            EngineEvent::PlanDelta { turn_id: id, delta: ContentDelta::Text(text), .. }
                if id == &turn_id && text == content
        )
    }));

    apply(&mut engine, &output);
    let turn = engine
        .conversations
        .get(&conversation_id)
        .and_then(|conversation| conversation.turns.get(&turn_id))
        .expect("turn");
    assert_eq!(turn.plan_path.as_deref(), Some(path));
    assert_eq!(
        turn.plan_text.chunks,
        vec![ContentDelta::Text(content.to_string())]
    );
}

#[test]
fn non_plan_write_file_is_not_projected_as_kimi_plan() {
    let adapter = KimiAdapter::standard();
    let (mut engine, conversation_id) = ready_engine(&adapter);
    start_turn(&mut engine, &conversation_id);
    let path = "/workspace/luna/README.md";
    let args = serde_json::to_string(&json!({
        "path": path,
        "content": "# Not a Kimi plan\n"
    }))
    .expect("args");

    let output = adapter
        .decode_message(
            &engine,
            &JsonRpcMessage::notification(
                "session/update",
                json!({
                    "sessionId": "sess",
                    "update": {
                        "sessionUpdate": "tool_call",
                        "toolCallId": "turn/tool-write-readme",
                        "title": format!("WriteFile: {path}"),
                        "status": "in_progress",
                        "content": [
                            {
                                "type": "content",
                                "content": {
                                    "type": "text",
                                    "text": args
                                }
                            }
                        ]
                    }
                }),
            ),
        )
        .expect("decode write");

    assert!(!output.events.iter().any(|event| {
        matches!(
            event,
            EngineEvent::PlanDelta { .. } | EngineEvent::PlanPathUpdated { .. }
        )
    }));
}

#[test]
fn kimi_context_history_replays_user_text_tools_and_filters_internal_reminders() {
    let context = fs::read_to_string(fixture_context_path()).expect("fixture context");

    let entries = kimi_context_history_entries(&context);

    assert_eq!(entries.len(), 4);
    assert_eq!(
        entries[0],
        HistoryReplayEntry {
            role: HistoryRole::User,
            content: ContentDelta::Text("hello".to_string()),
            tool: None,
        }
    );
    assert_eq!(
        entries[1],
        HistoryReplayEntry {
            role: HistoryRole::Assistant,
            content: ContentDelta::Text("thinking\n".to_string()),
            tool: None,
        }
    );

    let ContentDelta::Structured(tool_call) = &entries[2].content else {
        panic!("expected tool call");
    };
    let tool_call = serde_json::from_str::<Value>(tool_call).expect("tool call json");
    assert_eq!(tool_call["sessionUpdate"], json!("tool_call"));
    assert_eq!(tool_call["toolCallId"], json!("tool_1"));
    assert_eq!(tool_call["kind"], json!("execute"));
    assert_eq!(tool_call["title"], json!("Shell: ls"));
    assert_eq!(tool_call["rawInput"]["command"], json!("ls"));

    let ContentDelta::Structured(tool_update) = &entries[3].content else {
        panic!("expected tool update");
    };
    let tool_update = serde_json::from_str::<Value>(tool_update).expect("tool update json");
    assert_eq!(tool_update["sessionUpdate"], json!("tool_call_update"));
    assert_eq!(tool_update["toolCallId"], json!("tool_1"));
    assert_eq!(tool_update["status"], json!("completed"));
    assert_eq!(tool_update["content"][0]["content"]["text"], json!("ok\n"));
}

#[test]
fn kimi_local_state_projects_plan_mode_and_plan_card() {
    let context_path = fixture_context_path();
    let plan_path = fixture_path("share/plans/fixture-plan.md");

    let state = kimi_session_state(&context_path)
        .expect("read state")
        .expect("state");
    let event = kimi_local_mode_event(&ConversationId::new("conv"), &state).expect("mode");
    assert!(matches!(
        event,
        EngineEvent::SessionModesUpdated { modes, .. }
            if modes.current_mode_id == "plan"
                && modes.available_modes.iter().any(|mode| mode.id == "plan")
    ));

    let plan_entry = kimi_local_plan_entry(&context_path, &state).expect("plan entry");
    assert_eq!(plan_entry.role, HistoryRole::Assistant);
    let ContentDelta::Structured(plan) = plan_entry.content else {
        panic!("expected structured plan");
    };
    let plan = serde_json::from_str::<Value>(&plan).expect("plan json");
    assert_eq!(plan["type"], json!("plan"));
    assert_eq!(plan["markdown"], json!("# Plan\n\nDo it.\n"));
    assert_eq!(plan["path"], json!(plan_path.to_string_lossy()));
}

#[test]
fn kimi_local_state_projects_yolo_permission_mode() {
    let state = json!({
        "approval": {
            "yolo": true
        }
    });

    let event = kimi_local_permission_mode_event(&ConversationId::new("conv"), &state)
        .expect("permission state")
        .expect("permission mode");

    assert!(matches!(
        event,
        EngineEvent::SessionPermissionModesUpdated { modes, .. }
            if modes.current_mode_id == "yolo"
                && modes.available_modes.iter().any(|mode| mode.id == "default")
                && modes.available_modes.iter().any(|mode| mode.id == "yolo")
    ));
}
