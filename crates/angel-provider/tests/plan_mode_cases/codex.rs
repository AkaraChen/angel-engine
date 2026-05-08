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

#[test]
fn codex_plan_mode_host_capability_tool_call_prompts_for_answers() {
    let adapter = CodexAdapter::app_server();
    let mut engine = codex_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        adapter.capabilities(),
    );

    let start = engine
        .plan_command(EngineCommand::StartTurn {
            conversation_id: conversation_id.clone(),
            input: vec![UserInput::text("make a plan")],
            overrides: TurnOverrides::default(),
        })
        .expect("start plan turn");
    let turn_id = start.turn_id.clone().expect("turn id");
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
        JsonRpcMessage::notification(
            "item/started",
            json!({
                "threadId": "thread",
                "turnId": "turn-remote",
                "item": {
                    "id": "host-call",
                    "type": "dynamicToolCall",
                    "status": "inProgress",
                    "tool": "hostCapability",
                    "namespace": null,
                    "arguments": {"capability": "request_user_input"}
                }
            }),
        ),
    );
    assert_eq!(
        engine.conversations[&conversation_id].actions[&ActionId::new("host-call")].kind,
        ActionKind::HostCapability
    );

    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::request(
            JsonRpcRequestId::new("ask-host"),
            "item/tool/call",
            json!({
                "threadId": "thread",
                "turnId": "turn-remote",
                "callId": "host-call",
                "tool": "hostCapability",
                "namespace": null,
                "arguments": {
                    "title": "Plan mode",
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
    assert_eq!(elicitation.kind, ElicitationKind::DynamicToolCall);
    assert_eq!(
        elicitation.action_id.as_ref().map(ActionId::as_str),
        Some("host-call")
    );
    assert_eq!(elicitation.options.title.as_deref(), Some("Plan mode"));
    assert_eq!(elicitation.options.questions[0].id, "path");
    assert!(matches!(
        engine.conversations[&conversation_id].actions[&ActionId::new("host-call")].phase,
        ActionPhase::AwaitingDecision { .. }
    ));
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
            if id == &JsonRpcRequestId::new("ask-host")
                && result["success"] == json!(true)
                && result["contentItems"][0]["text"] == json!("plans/plan.md")
    ));
}

#[test]
fn codex_hydrate_restores_host_capability_question_and_answer() {
    let adapter = CodexAdapter::app_server();
    let mut engine = codex_engine(&adapter);

    let resume = engine
        .plan_command(EngineCommand::ResumeConversation {
            target: ResumeTarget::Remote {
                id: "thread".to_string(),
                hydrate: true,
            },
        })
        .expect("resume thread");
    let conversation_id = resume.conversation_id.clone().expect("conversation id");
    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::response(
            resume.request_id.clone().expect("resume request id"),
            json!({
                "thread": {
                    "id": "thread",
                    "turns": [
                        {
                            "items": [
                                {
                                    "id": "user-1",
                                    "type": "userMessage",
                                    "content": [
                                        {"type": "text", "text": "make a plan"}
                                    ]
                                },
                                {
                                    "id": "host-call",
                                    "callId": "host-call",
                                    "type": "dynamicToolCall",
                                    "status": "inProgress",
                                    "tool": "hostCapability",
                                    "namespace": null,
                                    "arguments": {
                                        "title": "Plan mode",
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
                                    }
                                },
                                {
                                    "id": "host-call-result",
                                    "callId": "host-call",
                                    "type": "dynamicToolCall",
                                    "status": "completed",
                                    "tool": "hostCapability",
                                    "namespace": null,
                                    "contentItems": [
                                        {"type": "inputText", "text": "plans/plan.md"}
                                    ]
                                },
                                {
                                    "id": "plan-item",
                                    "type": "plan",
                                    "status": "completed",
                                    "savedPath": "plans/plan.md",
                                    "entries": [
                                        {"content": "Inspect protocol", "status": "completed"},
                                        {"content": "Implement UI", "status": "in_progress"}
                                    ],
                                    "content": "# Plan\n- Inspect protocol\n- Implement UI\n"
                                }
                            ]
                        }
                    ]
                }
            }),
        ),
    );

    let conversation = &engine.conversations[&conversation_id];
    let messages = conversation_display_messages(ProtocolFlavor::CodexAppServer, conversation);
    let action = messages
        .iter()
        .flat_map(|message| message.content.iter())
        .find_map(|part| match part {
            DisplayMessagePart::ToolCall { action } if action.id == "host-call" => Some(action),
            _ => None,
        })
        .expect("restored host capability action");

    assert_eq!(action.kind, Some(ActionKind::HostCapability));
    assert_eq!(action.phase, ActionPhase::Completed);
    assert_eq!(action.title.as_deref(), Some("Plan mode"));
    assert_eq!(
        action.input_summary.as_deref(),
        Some("Where should the plan be saved?")
    );
    let raw_input: serde_json::Value = serde_json::from_str(
        action
            .raw_input
            .as_deref()
            .expect("restored elicitation input"),
    )
    .expect("elicitation raw input json");
    assert_eq!(raw_input["kind"], json!("userInput"));
    assert_eq!(raw_input["phase"], json!("open"));
    assert_eq!(
        raw_input["questions"][0]["question"],
        json!("Where should the plan be saved?")
    );
    assert_eq!(action.output_text, "plans/plan.md");

    let plan = messages
        .iter()
        .flat_map(|message| message.content.iter())
        .find_map(|part| match part {
            DisplayMessagePart::Plan {
                entries,
                text,
                path,
            } => Some((entries, text, path)),
            _ => None,
        })
        .expect("restored plan");

    assert_eq!(plan.0.len(), 2);
    assert_eq!(plan.0[0].content, "Inspect protocol");
    assert_eq!(plan.0[0].status, PlanEntryStatus::Completed);
    assert_eq!(plan.0[1].content, "Implement UI");
    assert_eq!(plan.0[1].status, PlanEntryStatus::InProgress);
    assert_eq!(plan.1, "# Plan\n- Inspect protocol\n- Implement UI\n");
    assert_eq!(plan.2.as_deref(), Some("plans/plan.md"));
}
