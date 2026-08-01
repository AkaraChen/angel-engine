use super::super::*;
use serde_json::json;

#[test]
fn acp_tool_update_before_tool_call_creates_fallback_action() {
    let adapter = AcpAdapter::standard();
    let mut engine = acp_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        adapter.capabilities(),
    );
    start_turn(&mut engine, conversation_id.clone(), "active");

    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::notification(
            "session/update",
            json!({
                "sessionId": "sess",
                "update": {
                    "sessionUpdate": "tool_call_update",
                    "toolCallId": "late-tool",
                    "status": "completed",
                    "content": {"text": "done"}
                }
            }),
        ),
    );

    let action = &engine.conversations[&conversation_id].actions[&ActionId::new("late-tool")];
    assert_eq!(action.phase, ActionPhase::Completed);
    assert_eq!(
        action.output.chunks,
        vec![ActionOutputDelta::Text("done".to_string())]
    );
}

#[test]
fn acp_tool_updates_without_ids_reject_without_synthetic_tool_collision() {
    let adapter = AcpAdapter::standard();
    let mut engine = acp_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        adapter.capabilities(),
    );
    start_turn(&mut engine, conversation_id.clone(), "active");

    let missing_start = adapter
        .decode_message(
            &engine,
            &JsonRpcMessage::notification(
                "session/update",
                json!({
                    "sessionId": "sess",
                    "update": {
                        "sessionUpdate": "tool_call",
                        "kind": "execute",
                        "title": "Missing id"
                    }
                }),
            ),
        )
        .expect_err("ACP tool call without id should fail");
    assert!(matches!(
        missing_start,
        EngineError::InvalidCommand { message }
            if message.contains("tool call missing toolCallId/id")
    ));

    let missing_update = adapter
        .decode_message(
            &engine,
            &JsonRpcMessage::notification(
                "session/update",
                json!({
                    "sessionId": "sess",
                    "update": {
                        "sessionUpdate": "tool_call_update",
                        "status": "completed",
                        "content": [
                            {
                                "type": "content",
                                "content": {"type": "text", "text": "ok"}
                            }
                        ]
                    }
                }),
            ),
        )
        .expect_err("ACP tool call update without id should fail");
    assert!(matches!(
        missing_update,
        EngineError::InvalidCommand { message }
            if message.contains("tool call update missing toolCallId/id")
    ));
    assert!(engine.conversations[&conversation_id].actions.is_empty());
}

#[test]
fn acp_tool_call_preserves_kind_diff_terminal_locations_and_raw_payload() {
    let adapter = AcpAdapter::standard();
    let mut engine = acp_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        adapter.capabilities(),
    );
    start_turn(&mut engine, conversation_id.clone(), "active");

    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::notification(
            "session/update",
            json!({
                "sessionId": "sess",
                "update": {
                    "sessionUpdate": "tool_call",
                    "toolCallId": "edit-1",
                    "title": "Patch file",
                    "kind": "edit",
                    "status": "in_progress",
                    "locations": [{"path": "/repo/src/lib.rs", "line": 7}],
                    "rawInput": {"path": "/repo/src/lib.rs"},
                    "content": [
                        {
                            "type": "diff",
                            "path": "/repo/src/lib.rs",
                            "oldText": "old",
                            "newText": "new"
                        },
                        {
                            "type": "terminal",
                            "terminalId": "term-1"
                        },
                        {
                            "type": "content",
                            "content": {"type": "text", "text": "patched"}
                        }
                    ]
                }
            }),
        ),
    );

    let action = &engine.conversations[&conversation_id].actions[&ActionId::new("edit-1")];
    assert_eq!(action.kind, ActionKind::FileChange);
    assert_eq!(action.phase, ActionPhase::Running);
    assert_eq!(action.title.as_deref(), Some("Patch file"));
    assert!(action.input.raw.as_ref().is_some_and(|raw| {
        raw.contains("\"locations\"")
            && raw.contains("\"rawInput\"")
            && raw.contains("/repo/src/lib.rs")
    }));
    assert!(matches!(
        action.output.chunks.as_slice(),
        [
            ActionOutputDelta::Patch(patch),
            ActionOutputDelta::Terminal(terminal_id),
            ActionOutputDelta::Text(text),
        ] if patch.contains("diff -- /repo/src/lib.rs")
            && patch.contains("+++ new")
            && terminal_id == "term-1"
            && text == "patched"
    ));
}

#[test]
fn acp_failed_tool_update_sets_error_and_preserves_raw_output() {
    let adapter = AcpAdapter::standard();
    let mut engine = acp_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        adapter.capabilities(),
    );
    start_turn(&mut engine, conversation_id.clone(), "active");

    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::notification(
            "session/update",
            json!({
                "sessionId": "sess",
                "update": {
                    "sessionUpdate": "tool_call_update",
                    "toolCallId": "exec-1",
                    "title": "Run tests",
                    "kind": "execute",
                    "status": "failed",
                    "rawOutput": {"stderr": "boom"},
                    "content": [{"type": "content", "content": {"type": "text", "text": "failed"}}]
                }
            }),
        ),
    );

    let action = &engine.conversations[&conversation_id].actions[&ActionId::new("exec-1")];
    assert_eq!(action.kind, ActionKind::Command);
    assert_eq!(action.phase, ActionPhase::Failed);
    assert_eq!(action.title.as_deref(), Some("Run tests"));
    assert_eq!(
        action.output.chunks,
        vec![ActionOutputDelta::Text("failed".to_string())]
    );
    assert!(action.error.as_ref().is_some_and(|error| {
        error.code == "acp.tool_call_failed" && error.message.contains("boom")
    }));
}

#[test]
fn acp_tool_call_display_input_isolates_raw_input_field() {
    let adapter = AcpAdapter::standard();
    let mut engine = acp_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        adapter.capabilities(),
    );
    start_turn(&mut engine, conversation_id.clone(), "active");

    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::notification(
            "session/update",
            json!({
                "sessionId": "sess",
                "update": {
                    "sessionUpdate": "tool_call",
                    "toolCallId": "bash-1",
                    "title": "Bash",
                    "kind": "execute",
                    "status": "pending",
                    "rawInput": {"command": "ls -la"}
                }
            }),
        ),
    );

    let action = &engine.conversations[&conversation_id].actions[&ActionId::new("bash-1")];
    // The full update stays in `raw` for signature matching…
    assert!(
        action
            .input
            .raw
            .as_ref()
            .is_some_and(|raw| raw.contains("\"sessionUpdate\""))
    );
    // …but only the ACP rawInput field is rendered as the tool input.
    assert_eq!(
        action.input.display.as_deref(),
        Some("{\"command\":\"ls -la\"}")
    );
    let display = DisplayToolAction::from_action(action);
    assert_eq!(
        display.raw_input.as_deref(),
        Some("{\"command\":\"ls -la\"}")
    );
}

#[test]
fn acp_tool_call_without_raw_input_has_empty_display_input() {
    let adapter = AcpAdapter::standard();
    let mut engine = acp_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        adapter.capabilities(),
    );
    start_turn(&mut engine, conversation_id.clone(), "active");

    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::notification(
            "session/update",
            json!({
                "sessionId": "sess",
                "update": {
                    "sessionUpdate": "tool_call",
                    "toolCallId": "bash-2",
                    "title": "Bash",
                    "kind": "execute",
                    "status": "pending",
                    "content": [{"type": "content", "content": {"type": "text", "text": ""}}]
                }
            }),
        ),
    );

    let action = &engine.conversations[&conversation_id].actions[&ActionId::new("bash-2")];
    assert_eq!(action.input.display.as_deref(), Some(""));
    let display = DisplayToolAction::from_action(action);
    assert_eq!(display.raw_input.as_deref(), Some(""));
}
