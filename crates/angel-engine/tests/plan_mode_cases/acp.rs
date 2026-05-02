use super::helpers::*;
use super::*;

#[test]
fn acp_plan_mode_round_trip_handles_question_plan_path_and_exit() {
    let adapter = AcpAdapter::without_authentication();
    let mut engine = acp_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::AcpSession("sess".to_string()),
        adapter.capabilities(),
    );

    let enter_plan = engine
        .plan_command(EngineCommand::UpdateContext {
            conversation_id: conversation_id.clone(),
            patch: set_mode("plan"),
        })
        .expect("enter plan mode");
    assert!(matches!(
        enter_plan.effects[0].method,
        ProtocolMethod::Acp(AcpMethod::SetSessionMode)
    ));
    let encoded_enter = adapter
        .encode_effect(
            &engine,
            &enter_plan.effects[0],
            &TransportOptions::default(),
        )
        .expect("encode enter plan");
    let JsonRpcMessage::Request { params, .. } = &encoded_enter.messages[0] else {
        panic!("expected session/set_mode request");
    };
    assert_eq!(params["sessionId"], json!("sess"));
    assert_eq!(params["modeId"], json!("plan"));
    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::response(enter_plan.request_id.expect("enter request id"), json!({})),
    );
    assert_eq!(
        engine.conversations[&conversation_id]
            .context
            .mode
            .effective()
            .and_then(|mode| mode.as_ref())
            .map(|mode| mode.id.as_str()),
        Some("plan")
    );

    let start = engine
        .plan_command(EngineCommand::StartTurn {
            conversation_id: conversation_id.clone(),
            input: vec![UserInput::text("make a plan")],
            overrides: TurnOverrides::default(),
        })
        .expect("start plan turn");
    let turn_id = start.turn_id.clone().expect("turn id");
    let prompt_request_id = start.request_id.clone().expect("prompt request id");
    let encoded_prompt = adapter
        .encode_effect(&engine, &start.effects[0], &TransportOptions::default())
        .expect("encode prompt");
    let JsonRpcMessage::Request { params, .. } = &encoded_prompt.messages[0] else {
        panic!("expected session/prompt request");
    };
    assert_eq!(params["sessionId"], json!("sess"));

    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::request(
            JsonRpcRequestId::new("ask-path"),
            "elicitation/create",
            json!({
                "mode": "form",
                "sessionId": "sess",
                "message": "Choose the plan path",
                "requestedSchema": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "title": "Plan path",
                            "description": "Where should the plan be saved?",
                            "enum": ["plans/plan.md", "PLAN.md"]
                        }
                    },
                    "required": ["path"]
                }
            }),
        ),
    );
    let elicitation = engine.conversations[&conversation_id]
        .elicitations
        .values()
        .next()
        .expect("elicitation")
        .clone();
    assert_eq!(elicitation.kind, ElicitationKind::UserInput);
    assert_eq!(elicitation.options.questions[0].id, "path");
    assert_eq!(
        elicitation.options.choices,
        vec!["plans/plan.md", "PLAN.md"]
    );
    assert!(matches!(
        engine.conversations[&conversation_id].turns[&turn_id].phase,
        TurnPhase::AwaitingUser { .. }
    ));

    let answer = engine
        .plan_command(EngineCommand::ResolveElicitation {
            conversation_id: conversation_id.clone(),
            elicitation_id: elicitation.id.clone(),
            decision: ElicitationDecision::Answers(vec![UserAnswer {
                id: "path".to_string(),
                value: "plans/plan.md".to_string(),
            }]),
        })
        .expect("answer question");
    let answer_output = encode_and_apply(&adapter, &mut engine, &answer.effects[0]);
    assert!(matches!(
        &answer_output.messages[0],
        JsonRpcMessage::Response { id, result }
            if id == &JsonRpcRequestId::new("ask-path")
                && result["action"] == json!("accept")
                && result["content"]["path"] == json!("plans/plan.md")
    ));
    assert!(matches!(
        engine.conversations[&conversation_id].elicitations[&elicitation.id].phase,
        ElicitationPhase::Resolved { .. }
    ));

    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::notification(
            "session/update",
            json!({
                "sessionId": "sess",
                "update": {
                    "sessionUpdate": "plan",
                    "path": "plans/plan.md",
                    "entries": [
                        {"content": "Inspect the request", "status": "completed"},
                        {"content": "Write implementation tests", "status": "in_progress"}
                    ]
                }
            }),
        ),
    );
    let turn = &engine.conversations[&conversation_id].turns[&turn_id];
    assert_eq!(
        turn.plan.as_ref().expect("structured plan").entries[1].content,
        "Write implementation tests"
    );
    assert_eq!(turn.plan_path.as_deref(), Some("plans/plan.md"));

    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::response(prompt_request_id, json!({"stopReason": "end_turn"})),
    );
    assert!(engine.conversations[&conversation_id].turns[&turn_id].is_terminal());

    let exit_plan = engine
        .plan_command(EngineCommand::UpdateContext {
            conversation_id: conversation_id.clone(),
            patch: set_mode("default"),
        })
        .expect("exit plan mode");
    assert!(matches!(
        exit_plan.effects[0].method,
        ProtocolMethod::Acp(AcpMethod::SetSessionMode)
    ));
    let encoded_exit = adapter
        .encode_effect(&engine, &exit_plan.effects[0], &TransportOptions::default())
        .expect("encode exit plan");
    let JsonRpcMessage::Request { params, .. } = &encoded_exit.messages[0] else {
        panic!("expected session/set_mode request");
    };
    assert_eq!(params["modeId"], json!("default"));
    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::response(exit_plan.request_id.expect("exit request id"), json!({})),
    );
    assert_eq!(
        engine.conversations[&conversation_id]
            .context
            .mode
            .effective()
            .and_then(|mode| mode.as_ref())
            .map(|mode| mode.id.as_str()),
        Some("default")
    );

    let next = engine
        .plan_command(EngineCommand::StartTurn {
            conversation_id: conversation_id.clone(),
            input: vec![UserInput::text("continue after planning")],
            overrides: TurnOverrides::default(),
        })
        .expect("start default turn");
    let next_turn_id = next.turn_id.clone().expect("next turn id");
    let encoded_next = adapter
        .encode_effect(&engine, &next.effects[0], &TransportOptions::default())
        .expect("encode next prompt");
    let JsonRpcMessage::Request { params, .. } = &encoded_next.messages[0] else {
        panic!("expected session/prompt request");
    };
    assert_eq!(params["sessionId"], json!("sess"));
    let next_turn = &engine.conversations[&conversation_id].turns[&next_turn_id];
    assert!(next_turn.plan.is_none());
    assert!(next_turn.plan_text.chunks.is_empty());
    assert!(next_turn.plan_path.is_none());
}
