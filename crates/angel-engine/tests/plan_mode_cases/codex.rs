use super::helpers::*;
use super::*;

#[test]
fn codex_plan_mode_round_trip_handles_question_plan_path_and_exit() {
    let adapter = CodexAdapter::app_server();
    let mut engine = codex_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        adapter.capabilities(),
    );

    let enter_plan = engine
        .plan_command(EngineCommand::UpdateContext {
            conversation_id: conversation_id.clone(),
            patch: set_model_and_mode("gpt-5.5", "plan"),
        })
        .expect("enter plan mode");
    assert!(enter_plan.effects.is_empty());

    let start = engine
        .plan_command(EngineCommand::StartTurn {
            conversation_id: conversation_id.clone(),
            input: vec![UserInput::text("make a plan")],
            overrides: TurnOverrides::default(),
        })
        .expect("start plan turn");
    let turn_id = start.turn_id.clone().expect("turn id");
    let encoded_start = adapter
        .encode_effect(&engine, &start.effects[0], &TransportOptions::default())
        .expect("encode start");
    let JsonRpcMessage::Request { params, .. } = &encoded_start.messages[0] else {
        panic!("expected turn/start request");
    };
    assert_eq!(params["collaborationMode"]["mode"], json!("plan"));
    assert_eq!(
        params["collaborationMode"]["settings"]["model"],
        json!("gpt-5.5")
    );

    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::response(
            start.request_id.clone().expect("start request id"),
            json!({"turn": {"id": "turn-remote"}}),
        ),
    );

    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::request(
            JsonRpcRequestId::new("ask-path"),
            "item/tool/requestUserInput",
            json!({
                "threadId": "thread",
                "turnId": "turn-remote",
                "itemId": "ask-1",
                "questions": [
                    {
                        "id": "path",
                        "header": "Plan path",
                        "question": "Where should the plan be saved?",
                        "options": [
                            {"label": "plans/plan.md", "description": "Use the plans folder"},
                            {"label": "PLAN.md", "description": "Use the repository root"}
                        ]
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
    assert_eq!(elicitation.kind, ElicitationKind::UserInput);
    assert_eq!(elicitation.options.questions[0].id, "path");
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
                && result["answers"]["path"]["answers"] == json!(["plans/plan.md"])
    ));
    assert!(matches!(
        engine.conversations[&conversation_id].elicitations[&elicitation.id].phase,
        ElicitationPhase::Resolved { .. }
    ));

    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::notification(
            "turn/plan/updated",
            json!({
                "threadId": "thread",
                "turnId": "turn-remote",
                "plan": [
                    {"step": "Inspect the request", "status": "completed"},
                    {"step": "Write implementation tests", "status": "in_progress"}
                ]
            }),
        ),
    );
    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::notification(
            "item/completed",
            json!({
                "threadId": "thread",
                "turnId": "turn-remote",
                "item": {
                    "id": "plan",
                    "type": "plan",
                    "status": "completed",
                    "savedPath": "plans/plan.md",
                    "content": "# Plan\n- Write implementation tests\n"
                }
            }),
        ),
    );
    let turn = &engine.conversations[&conversation_id].turns[&turn_id];
    assert_eq!(
        turn.plan.as_ref().expect("structured plan").entries[1].content,
        "Write implementation tests"
    );
    assert_eq!(
        turn.plan_text.chunks,
        vec![ContentDelta::Text(
            "# Plan\n- Write implementation tests\n".to_string()
        )]
    );
    assert_eq!(turn.plan_path.as_deref(), Some("plans/plan.md"));

    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::notification(
            "turn/completed",
            json!({
                "threadId": "thread",
                "turnId": "turn-remote",
                "turn": {"status": "completed"}
            }),
        ),
    );
    assert!(engine.conversations[&conversation_id].turns[&turn_id].is_terminal());

    let exit_plan = engine
        .plan_command(EngineCommand::UpdateContext {
            conversation_id: conversation_id.clone(),
            patch: set_mode("default"),
        })
        .expect("exit plan mode");
    assert!(exit_plan.effects.is_empty());

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
        .expect("encode next");
    let JsonRpcMessage::Request { params, .. } = &encoded_next.messages[0] else {
        panic!("expected turn/start request");
    };
    assert_eq!(params["collaborationMode"]["mode"], json!("default"));
    let next_turn = &engine.conversations[&conversation_id].turns[&next_turn_id];
    assert!(next_turn.plan.is_none());
    assert!(next_turn.plan_text.chunks.is_empty());
    assert!(next_turn.plan_path.is_none());
}
