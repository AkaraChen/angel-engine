use super::*;
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
fn acp_cancel_turn_responds_cancelled_to_pending_permission_request() {
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
                "title": "Run tool"
            }),
        ),
    );
    let elicitation_id = engine.conversations[&conversation_id]
        .elicitations
        .keys()
        .next()
        .cloned()
        .unwrap();

    let cancel = engine
        .plan_command(EngineCommand::CancelTurn {
            conversation_id: conversation_id.clone(),
            turn_id: Some(turn_id),
        })
        .expect("cancel turn");
    let output = adapter
        .encode_effect(&engine, &cancel.effects[0], &TransportOptions::default())
        .expect("encode cancel");

    assert!(matches!(
        output.messages.as_slice(),
        [
            JsonRpcMessage::Notification { method, .. },
            JsonRpcMessage::Response { id, result },
        ] if method == "session/cancel"
            && id == &JsonRpcRequestId::new("perm")
            && result["outcome"]["outcome"] == json!("cancelled")
    ));
    apply_transport_output(&mut engine, &output).expect("apply cancel output");
    assert!(matches!(
        engine.conversations[&conversation_id].elicitations[&elicitation_id].phase,
        ElicitationPhase::Cancelled
    ));
}

#[test]
fn acp_cancel_turn_responds_cancel_to_pending_form_elicitation() {
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
            JsonRpcRequestId::new("ask"),
            "elicitation/create",
            json!({
                "mode": "form",
                "sessionId": "sess",
                "message": "Need input",
                "requestedSchema": {
                    "type": "object",
                    "properties": {
                        "answer": {"type": "string", "title": "Answer"}
                    }
                }
            }),
        ),
    );

    let cancel = engine
        .plan_command(EngineCommand::CancelTurn {
            conversation_id,
            turn_id: Some(turn_id),
        })
        .expect("cancel turn");
    let output = adapter
        .encode_effect(&engine, &cancel.effects[0], &TransportOptions::default())
        .expect("encode cancel");

    assert!(matches!(
        output.messages.as_slice(),
        [
            JsonRpcMessage::Notification { method, .. },
            JsonRpcMessage::Response { id, result },
        ] if method == "session/cancel"
            && id == &JsonRpcRequestId::new("ask")
            && result["action"] == json!("cancel")
    ));
}

#[test]
fn acp_bad_model_and_effort_updates_are_server_validated_without_local_context_mutation() {
    let adapter = AcpAdapter::standard();
    let mut engine = acp_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        adapter.capabilities(),
    );
    {
        let conversation = engine.conversations.get_mut(&conversation_id).unwrap();
        conversation.config_options.push(SessionConfigOption {
            id: "model".to_string(),
            name: "Model".to_string(),
            description: None,
            category: Some("model".to_string()),
            current_value: "old-model".to_string(),
            values: Vec::new(),
        });
        conversation.config_options.push(SessionConfigOption {
            id: "thought_level".to_string(),
            name: "Thought level".to_string(),
            description: None,
            category: Some("thought_level".to_string()),
            current_value: "medium".to_string(),
            values: Vec::new(),
        });
    }

    let plan = engine
        .plan_command(EngineCommand::UpdateContext {
            conversation_id: conversation_id.clone(),
            patch: ContextPatch {
                updates: vec![
                    ContextUpdate::Model {
                        scope: ContextScope::TurnAndFuture,
                        model: Some("not-a-real-model".to_string()),
                    },
                    ContextUpdate::Reasoning {
                        scope: ContextScope::TurnAndFuture,
                        reasoning: Some(ReasoningProfile {
                            effort: Some("sideways".to_string()),
                            summary: None,
                        }),
                    },
                ],
            },
        })
        .expect("acp context update");

    assert_eq!(plan.effects.len(), 2);
    let encoded_effects = plan
        .effects
        .iter()
        .map(|effect| encode_request(&adapter, &engine, effect))
        .collect::<Vec<_>>();
    assert_eq!(encoded_effects[0].2["value"], json!("not-a-real-model"));
    assert_eq!(encoded_effects[1].2["value"], json!("sideways"));
    let conversation = &engine.conversations[&conversation_id];
    assert_eq!(conversation.context.model.effective(), None);
    assert_eq!(conversation.context.reasoning.effective(), None);

    for (request_id, _, _) in encoded_effects {
        decode_and_apply(
            &adapter,
            &mut engine,
            JsonRpcMessage::error(Some(request_id), -32602, "invalid config value", None),
        );
    }

    let next = start_turn(&mut engine, conversation_id, "recover");
    let (_, method, _) = encode_request(&adapter, &engine, &next.effects[0]);
    assert_eq!(method, "session/prompt");
}

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
fn acp_start_turn_rpc_error_terminalizes_and_allows_next_turn() {
    let adapter = AcpAdapter::standard();
    let mut engine = acp_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        adapter.capabilities(),
    );
    let plan = start_turn(&mut engine, conversation_id.clone(), "bad model");
    let request_id = plan.request_id.clone().unwrap();
    let turn_id = plan.turn_id.clone().unwrap();

    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::error(Some(request_id.clone()), -32602, "invalid model", None),
    );

    assert!(!engine.pending.requests.contains_key(&request_id));
    let conversation = &engine.conversations[&conversation_id];
    assert_eq!(conversation.lifecycle, ConversationLifecycle::Idle);
    assert!(matches!(
        conversation.turns[&turn_id].outcome,
        Some(TurnOutcome::Failed(_))
    ));

    let next = start_turn(&mut engine, conversation_id, "recover");
    let (_, method, _) = encode_request(&adapter, &engine, &next.effects[0]);
    assert_eq!(method, "session/prompt");
}
