use super::super::*;
use serde_json::json;

fn assert_invalid_command_message(error: EngineError, field: &str) {
    assert!(matches!(
        error,
        EngineError::InvalidCommand { message } if message.contains(field)
    ));
}

#[test]
fn acp_permission_request_without_session_id_fails_fast() {
    let adapter = AcpAdapter::standard();
    let engine = acp_engine(&adapter);

    let missing = adapter
        .decode_message(
            &engine,
            &JsonRpcMessage::request(
                JsonRpcRequestId::new("perm"),
                "session/request_permission",
                json!({"toolCallId": "tool"}),
            ),
        )
        .expect_err("permission request without sessionId should fail");
    let malformed = adapter
        .decode_message(
            &engine,
            &JsonRpcMessage::request(
                JsonRpcRequestId::new("perm"),
                "session/request_permission",
                json!({"sessionId": 7, "toolCallId": "tool"}),
            ),
        )
        .expect_err("permission request with non-string sessionId should fail");

    assert_invalid_command_message(missing, "sessionId");
    assert_invalid_command_message(malformed, "sessionId");
}

#[test]
fn acp_session_update_without_session_id_fails_fast() {
    let adapter = AcpAdapter::standard();
    let engine = acp_engine(&adapter);

    let missing = adapter
        .decode_message(
            &engine,
            &JsonRpcMessage::notification(
                "session/update",
                json!({
                    "update": {
                        "sessionUpdate": "agent_message_chunk",
                        "content": {"type": "text", "text": "hello"}
                    }
                }),
            ),
        )
        .expect_err("session/update without sessionId should fail");
    let malformed = adapter
        .decode_message(
            &engine,
            &JsonRpcMessage::notification(
                "session/update",
                json!({
                    "sessionId": 7,
                    "update": {
                        "sessionUpdate": "agent_message_chunk",
                        "content": {"type": "text", "text": "hello"}
                    }
                }),
            ),
        )
        .expect_err("session/update with non-string sessionId should fail");

    assert_invalid_command_message(missing, "sessionId");
    assert_invalid_command_message(malformed, "sessionId");
}

#[test]
fn acp_session_update_without_update_fails_fast() {
    let adapter = AcpAdapter::standard();
    let mut engine = acp_engine(&adapter);
    insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        adapter.capabilities(),
    );

    let missing = adapter
        .decode_message(
            &engine,
            &JsonRpcMessage::notification("session/update", json!({"sessionId": "sess"})),
        )
        .expect_err("session/update without update should fail");
    let malformed = adapter
        .decode_message(
            &engine,
            &JsonRpcMessage::notification(
                "session/update",
                json!({"sessionId": "sess", "update": []}),
            ),
        )
        .expect_err("session/update with non-object update should fail");

    assert_invalid_command_message(missing, "update");
    assert_invalid_command_message(malformed, "update");
}

#[test]
fn acp_session_update_without_session_update_fails_fast() {
    let adapter = AcpAdapter::standard();
    let mut engine = acp_engine(&adapter);
    insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        adapter.capabilities(),
    );

    let missing = adapter
        .decode_message(
            &engine,
            &JsonRpcMessage::notification(
                "session/update",
                json!({
                    "sessionId": "sess",
                    "update": {"content": {"type": "text", "text": "hello"}}
                }),
            ),
        )
        .expect_err("session/update without sessionUpdate should fail");
    let malformed = adapter
        .decode_message(
            &engine,
            &JsonRpcMessage::notification(
                "session/update",
                json!({
                    "sessionId": "sess",
                    "update": {"sessionUpdate": 7}
                }),
            ),
        )
        .expect_err("session/update with non-string sessionUpdate should fail");

    assert_invalid_command_message(missing, "sessionUpdate");
    assert_invalid_command_message(malformed, "sessionUpdate");
}

#[test]
fn acp_well_formed_unknown_session_update_still_warns() {
    let adapter = AcpAdapter::standard();
    let engine = acp_engine(&adapter);

    let output = adapter
        .decode_message(
            &engine,
            &JsonRpcMessage::notification(
                "session/update",
                json!({
                    "sessionId": "missing-session",
                    "update": {
                        "sessionUpdate": "agent_message_chunk",
                        "content": {"type": "text", "text": "hello"}
                    }
                }),
            ),
        )
        .expect("well-formed unknown session should warn");

    assert!(output.events.is_empty());
    assert!(output.logs.iter().any(|log| {
        log.kind == TransportLogKind::Receive
            && log
                .message
                .contains("update for unknown session missing-session")
    }));
}
