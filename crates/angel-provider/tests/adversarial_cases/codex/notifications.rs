use super::super::*;
use serde_json::json;

#[test]
fn codex_live_notifications_reject_missing_required_fields() {
    let cases = [
        (
            "thread/status/changed",
            json!({"threadId": "thread"}),
            "status",
        ),
        ("turn/started", json!({"threadId": "thread"}), "turn"),
        (
            "turn/completed",
            json!({"threadId": "thread", "turn": {"id": "turn", "items": []}}),
            "status",
        ),
        (
            "turn/completed",
            json!({"threadId": "thread", "turn": {"items": [], "status": "completed"}}),
            "id",
        ),
        (
            "item/agentMessage/delta",
            json!({"threadId": "thread", "turnId": "turn", "itemId": "msg"}),
            "delta",
        ),
        (
            "item/plan/delta",
            json!({"threadId": "thread", "turnId": "turn", "itemId": "plan"}),
            "delta",
        ),
        (
            "turn/plan/updated",
            json!({"threadId": "thread", "turnId": "turn"}),
            "plan",
        ),
        (
            "turn/plan/updated",
            json!({"threadId": "thread", "turnId": "turn", "plan": [{"status": "pending"}]}),
            "step",
        ),
        (
            "item/commandExecution/outputDelta",
            json!({"threadId": "thread", "turnId": "turn", "delta": "out"}),
            "itemId",
        ),
        (
            "item/commandExecution/outputDelta",
            json!({"threadId": "thread", "turnId": "turn", "itemId": "cmd"}),
            "delta",
        ),
        (
            "item/fileChange/patchUpdated",
            json!({"threadId": "thread", "turnId": "turn", "changes": []}),
            "itemId",
        ),
        (
            "item/fileChange/patchUpdated",
            json!({"threadId": "thread", "turnId": "turn", "itemId": "patch"}),
            "changes",
        ),
        (
            "error",
            json!({"threadId": "thread", "turnId": "turn", "willRetry": false}),
            "error",
        ),
        ("warning", json!({}), "message"),
        ("guardianWarning", json!({"message": "blocked"}), "threadId"),
        ("configWarning", json!({}), "summary"),
        ("remoteControl/status/changed", json!({}), "status"),
    ];

    for (method, params, field) in cases {
        assert_codex_invalid_notification(method, params, field);
    }
}

fn assert_codex_invalid_notification(method: &str, params: serde_json::Value, field: &str) {
    let adapter = CodexAdapter::app_server();
    let mut engine = codex_engine(&adapter);
    insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        adapter.capabilities(),
    );

    let err = adapter
        .decode_message(&engine, &JsonRpcMessage::notification(method, params))
        .expect_err("malformed notification should fail");

    assert!(matches!(
        err,
        EngineError::InvalidCommand { message }
            if message.contains(field)
    ));
}

#[test]
fn codex_unknown_thread_notifications_do_not_mutate_selected_conversation() {
    let adapter = CodexAdapter::app_server();
    let mut engine = codex_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread-a".to_string()),
        adapter.capabilities(),
    );

    let output = decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::notification(
            "thread/status/changed",
            json!({
                "threadId": "thread-b",
                "status": {
                    "type": "active",
                    "activeFlags": ["waitingOnApproval"]
                }
            }),
        ),
    );

    assert!(output.events.is_empty());
    assert!(
        output
            .logs
            .iter()
            .any(|log| log.message.contains("unknown thread thread-b"))
    );
    assert_eq!(
        engine.conversations[&conversation_id].lifecycle,
        ConversationLifecycle::Idle
    );
}
