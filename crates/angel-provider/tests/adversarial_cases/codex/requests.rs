use super::super::*;
use serde_json::json;

#[test]
fn codex_bad_server_request_returns_json_rpc_error_and_followup_can_run() {
    let adapter = CodexAdapter::app_server();
    let mut engine = codex_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        adapter.capabilities(),
    );

    let missing_thread = decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::request(
            JsonRpcRequestId::new("bad-1"),
            "item/tool/requestUserInput",
            json!({
                "questions": [
                    {
                        "id": "mode",
                        "question": "Pick one",
                        "options": [{"label": "A"}]
                    }
                ]
            }),
        ),
    );
    assert_error_message(&missing_thread, "bad-1", -32602);

    let unknown_thread = decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::request(
            JsonRpcRequestId::new("bad-2"),
            "item/commandExecution/requestApproval",
            json!({
                "threadId": "missing-thread",
                "turnId": "turn",
                "itemId": "cmd",
                "command": "rm -rf /tmp/nope"
            }),
        ),
    );
    assert_error_message(&unknown_thread, "bad-2", -32602);

    let plan = start_turn(&mut engine, conversation_id, "still works");
    let (_, method, _) = encode_request(&adapter, &engine, &plan.effects[0]);
    assert_eq!(method, "turn/start");
}

#[test]
fn codex_unsupported_server_request_returns_method_not_found_without_mutating_state() {
    let adapter = CodexAdapter::app_server();
    let mut engine = codex_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        adapter.capabilities(),
    );

    let output = decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::request(
            JsonRpcRequestId::new("unsupported"),
            "item/unknown/requestApproval",
            json!({
                "threadId": "thread",
                "turnId": "turn",
                "itemId": "item"
            }),
        ),
    );

    assert_error_message(&output, "unsupported", -32601);
    let conversation = &engine.conversations[&conversation_id];
    assert!(conversation.turns.is_empty());
    assert!(conversation.actions.is_empty());
    assert!(conversation.elicitations.is_empty());
}

#[test]
fn codex_request_before_turn_started_creates_missing_turn_and_action() {
    let adapter = CodexAdapter::app_server();
    let mut engine = codex_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        adapter.capabilities(),
    );

    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::request(
            JsonRpcRequestId::new("approval"),
            "item/commandExecution/requestApproval",
            json!({
                "threadId": "thread",
                "turnId": "turn-remote",
                "itemId": "cmd-1",
                "command": "dangerous --flag"
            }),
        ),
    );

    let turn_id = TurnId::new("codex-turn-remote");
    let action_id = ActionId::new("cmd-1");
    let conversation = &engine.conversations[&conversation_id];
    assert!(conversation.turns.contains_key(&turn_id));
    assert!(matches!(
        conversation.actions[&action_id].phase,
        ActionPhase::AwaitingDecision { .. }
    ));
    assert_eq!(conversation.elicitations.len(), 1);
}

#[test]
fn codex_request_with_blank_item_id_does_not_create_empty_action() {
    let adapter = CodexAdapter::app_server();
    let mut engine = codex_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        adapter.capabilities(),
    );

    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::request(
            JsonRpcRequestId::new("blank-action"),
            "item/commandExecution/requestApproval",
            json!({
                "threadId": "thread",
                "turnId": "turn-remote",
                "itemId": "",
                "command": "dangerous --flag"
            }),
        ),
    );

    let conversation = &engine.conversations[&conversation_id];
    assert!(conversation.actions.is_empty());
    let elicitation = conversation.elicitations.values().next().unwrap();
    assert_eq!(elicitation.action_id, None);
    assert_eq!(
        elicitation.turn_id.as_ref(),
        Some(&TurnId::new("codex-turn-remote"))
    );
}

#[test]
fn codex_item_request_without_turn_id_opens_detached_elicitation() {
    let adapter = CodexAdapter::app_server();
    let mut engine = codex_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        adapter.capabilities(),
    );

    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::request(
            JsonRpcRequestId::new("detached"),
            "item/fileChange/requestApproval",
            json!({
                "threadId": "thread",
                "itemId": "patch-1",
                "reason": "missing turn id should not poison state"
            }),
        ),
    );

    let conversation = &engine.conversations[&conversation_id];
    let elicitation = conversation.elicitations.values().next().unwrap();
    assert_eq!(elicitation.turn_id, None);
    assert_eq!(elicitation.action_id, None);
    assert_eq!(conversation.lifecycle, ConversationLifecycle::Active);
}
