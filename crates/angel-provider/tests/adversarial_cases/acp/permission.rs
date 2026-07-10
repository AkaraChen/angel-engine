use super::super::*;
use serde_json::json;

#[test]
fn acp_unknown_permission_request_returns_error_instead_of_hanging() {
    let adapter = AcpAdapter::standard();
    let mut engine = acp_engine(&adapter);

    let output = decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::request(
            JsonRpcRequestId::new("perm"),
            "session/request_permission",
            json!({
                "sessionId": "missing-session",
                "toolCallId": "tool"
            }),
        ),
    );

    assert_error_message(&output, "perm", -32602);
    assert!(output.events.is_empty());
}

#[test]
fn acp_permission_before_tool_call_creates_fallback_action_and_safe_choices() {
    let adapter = AcpAdapter::standard();
    let mut engine = acp_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        adapter.capabilities(),
    );
    let turn_id = start_turn(&mut engine, conversation_id.clone(), "active")
        .turn_id
        .unwrap();

    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::request(
            JsonRpcRequestId::new("perm"),
            "session/request_permission",
            json!({
                "sessionId": "sess",
                "toolCallId": "tool-1",
                "title": "Run tool",
                "options": [{"label": "missing optionId"}]
            }),
        ),
    );

    let action_id = ActionId::new("tool-1");
    let conversation = &engine.conversations[&conversation_id];
    assert!(matches!(
        conversation.actions[&action_id].phase,
        ActionPhase::AwaitingDecision { .. }
    ));
    assert!(matches!(
        conversation.turns[&turn_id].phase,
        TurnPhase::AwaitingUser { .. }
    ));
    let elicitation = conversation.elicitations.values().next().unwrap();
    assert_eq!(elicitation.options.choices, vec!["allow", "deny", "cancel"]);
}

#[test]
fn acp_duplicate_pending_permission_for_active_tool_is_cancelled() {
    let adapter = AcpAdapter::standard();
    let mut engine = acp_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        adapter.capabilities(),
    );
    let turn_id = start_turn(&mut engine, conversation_id.clone(), "active")
        .turn_id
        .unwrap();
    let raw_input = json!({"command": "python3 - <<'PY'\nprint('same command')\nPY"});

    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::notification(
            "session/update",
            json!({
                "sessionId": "sess",
                "update": {
                    "sessionUpdate": "tool_call",
                    "toolCallId": "tool-1",
                    "kind": "execute",
                    "status": "pending",
                    "title": "python3 - <<'PY'\nprint('same command')\nPY",
                    "rawInput": raw_input.clone()
                }
            }),
        ),
    );
    engine
        .apply_event(EngineEvent::ActionUpdated {
            conversation_id: conversation_id.clone(),
            action_id: ActionId::new("tool-1"),
            patch: ActionPatch::phase(ActionPhase::Completed),
        })
        .expect("mark tool completed");

    let duplicate_tool = decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::notification(
            "session/update",
            json!({
                "sessionId": "sess",
                "update": {
                    "sessionUpdate": "tool_call",
                    "toolCallId": "tool-2",
                    "kind": "execute",
                    "status": "pending",
                    "title": "python3 - <<'PY'\nprint('same command')\nPY",
                    "rawInput": raw_input.clone()
                }
            }),
        ),
    );
    assert!(duplicate_tool.events.is_empty());

    let duplicate_permission = decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::request(
            JsonRpcRequestId::new("perm-2"),
            "session/request_permission",
            json!({
                "sessionId": "sess",
                "toolCall": {
                    "sessionUpdate": "tool_call",
                    "toolCallId": "tool-2",
                    "kind": "execute",
                    "status": "pending",
                    "title": "python3 - <<'PY'\nprint('same command')\nPY",
                    "rawInput": raw_input.clone()
                }
            }),
        ),
    );

    assert!(matches!(
        duplicate_permission.messages.as_slice(),
        [JsonRpcMessage::Response { id, result }]
            if id == &JsonRpcRequestId::new("perm-2")
                && result["outcome"]["outcome"] == json!("cancelled")
    ));
    let failed_duplicate_update = decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::notification(
            "session/update",
            json!({
                "sessionId": "sess",
                "update": {
                    "sessionUpdate": "tool_call_update",
                    "toolCallId": "tool-2",
                    "status": "failed",
                    "content": "cancelled duplicate"
                }
            }),
        ),
    );
    assert!(failed_duplicate_update.events.is_empty());

    let conversation = &engine.conversations[&conversation_id];
    assert_eq!(conversation.actions.len(), 1);
    assert_eq!(
        conversation.actions[&ActionId::new("tool-1")].turn_id,
        turn_id
    );
    assert!(conversation.elicitations.is_empty());
}

#[test]
fn acp_duplicate_completed_tool_call_with_same_signature_is_ignored() {
    let adapter = AcpAdapter::standard();
    let mut engine = acp_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        adapter.capabilities(),
    );
    start_turn(&mut engine, conversation_id.clone(), "active");
    let raw_input = json!({"command": "printf 'same output' > src/same.txt"});
    let content = json!([{
        "type": "content",
        "content": {
            "type": "text",
            "text": "same output"
        }
    }]);

    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::notification(
            "session/update",
            json!({
                "sessionId": "sess",
                "update": {
                    "sessionUpdate": "tool_call",
                    "toolCallId": "tool-1",
                    "kind": "execute",
                    "status": "completed",
                    "title": "Execute: printf 'same output' > src/same.txt",
                    "rawInput": raw_input.clone(),
                    "content": content.clone()
                }
            }),
        ),
    );
    let duplicate = decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::notification(
            "session/update",
            json!({
                "sessionId": "sess",
                "update": {
                    "sessionUpdate": "tool_call",
                    "toolCallId": "tool-2",
                    "kind": "execute",
                    "status": "completed",
                    "title": "Execute: printf 'same output' > src/same.txt",
                    "rawInput": raw_input.clone(),
                    "content": content.clone()
                }
            }),
        ),
    );

    assert!(duplicate.events.is_empty());
    let conversation = &engine.conversations[&conversation_id];
    assert_eq!(conversation.actions.len(), 1);
    assert!(conversation.actions.contains_key(&ActionId::new("tool-1")));
}

#[test]
fn acp_permission_response_selects_option_by_protocol_kind() {
    let adapter = AcpAdapter::standard();
    let mut engine = acp_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        adapter.capabilities(),
    );

    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::request(
            JsonRpcRequestId::new("perm"),
            "session/request_permission",
            json!({
                "sessionId": "sess",
                "title": "Run tool",
                "options": [
                    {
                        "optionId": "cancel",
                        "name": "Looks like cancel",
                        "kind": "allow_once"
                    },
                    {
                        "optionId": "proceed_once",
                        "name": "Looks like proceed",
                        "kind": "reject_once"
                    },
                    {
                        "optionId": "forever",
                        "name": "Always",
                        "kind": "allow_always"
                    }
                ]
            }),
        ),
    );

    let elicitation = engine.conversations[&conversation_id]
        .elicitations
        .values()
        .next()
        .expect("elicitation")
        .clone();
    assert_eq!(
        elicitation.options.choices,
        vec!["Looks like cancel", "Looks like proceed", "Always"]
    );
    assert_eq!(
        elicitation.options.choice_details[0].kind,
        Some(ElicitationChoiceKind::AllowOnce)
    );
    assert_eq!(
        elicitation.options.choice_details[1].kind,
        Some(ElicitationChoiceKind::RejectOnce)
    );

    let plan = engine
        .plan_command(EngineCommand::ResolveElicitation {
            conversation_id,
            elicitation_id: elicitation.id,
            decision: ElicitationDecision::Allow,
        })
        .expect("resolve permission");
    let output = adapter
        .encode_effect(&engine, &plan.effects[0], &TransportOptions::default())
        .expect("encode response");

    assert!(matches!(
        output.messages.as_slice(),
        [JsonRpcMessage::Response { id, result }]
            if id == &JsonRpcRequestId::new("perm")
                && result["outcome"]["outcome"] == json!("selected")
                && result["outcome"]["optionId"] == json!("cancel")
    ));
}
