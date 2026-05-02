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
        RemoteConversationId::AcpSession("sess".to_string()),
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
fn acp_bad_model_and_effort_updates_are_server_validated_without_local_context_mutation() {
    let adapter = AcpAdapter::standard();
    let mut engine = acp_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::AcpSession("sess".to_string()),
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
    assert_eq!(
        plan.effects[0].payload.fields.get("value"),
        Some(&"not-a-real-model".to_string())
    );
    assert_eq!(
        plan.effects[1].payload.fields.get("value"),
        Some(&"sideways".to_string())
    );
    let conversation = &engine.conversations[&conversation_id];
    assert_eq!(conversation.context.model.effective(), None);
    assert_eq!(conversation.context.reasoning.effective(), None);

    for effect in &plan.effects {
        decode_and_apply(
            &adapter,
            &mut engine,
            JsonRpcMessage::error(
                effect.request_id.clone(),
                -32602,
                "invalid config value",
                None,
            ),
        );
    }

    let next = start_turn(&mut engine, conversation_id, "recover");
    assert!(matches!(
        next.effects[0].method,
        ProtocolMethod::Acp(AcpMethod::SessionPrompt)
    ));
}

#[test]
fn acp_tool_update_before_tool_call_creates_fallback_action() {
    let adapter = AcpAdapter::standard();
    let mut engine = acp_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::AcpSession("sess".to_string()),
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
fn acp_start_turn_rpc_error_terminalizes_and_allows_next_turn() {
    let adapter = AcpAdapter::standard();
    let mut engine = acp_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::AcpSession("sess".to_string()),
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
    assert!(matches!(
        next.effects[0].method,
        ProtocolMethod::Acp(AcpMethod::SessionPrompt)
    ));
}
