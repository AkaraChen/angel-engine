use super::super::*;

#[test]
fn thread_resume_hydrates_turn_items_into_history_replay() {
    let adapter = CodexAdapter::app_server();
    let mut engine = AngelEngine::with_available_runtime(
        angel_engine::ProtocolFlavor::CodexAppServer,
        angel_engine::RuntimeCapabilities::new("test"),
        adapter.capabilities(),
    );
    let request_id = engine
        .plan_command(angel_engine::EngineCommand::ResumeConversation {
            target: angel_engine::ResumeTarget::Remote {
                id: "thread_1".to_string(),
                hydrate: true,
                cwd: None,
            },
        })
        .expect("resume plan")
        .request_id
        .expect("request id");

    let output = adapter
        .decode_response(
            &engine,
            &request_id,
            &json!({
                "thread": {
                    "id": "thread_1",
                    "cwd": "/tmp/project",
                    "turns": [
                        {
                            "id": "turn_1",
                            "items": [
                                {
                                    "type": "userMessage",
                                    "content": [{ "type": "text", "text": "hello" }]
                                },
                                {
                                    "type": "reasoning",
                                    "summary": ["thinking"]
                                },
                                {
                                    "type": "response_item",
                                    "payload": {
                                        "type": "webSearch",
                                        "id": "search_1",
                                        "query": "keyboard lock"
                                    }
                                },
                                {
                                    "id": "exec-1",
                                    "type": "commandExecution",
                                    "status": "completed",
                                    "command": "cargo test"
                                },
                                {
                                    "type": "response_item",
                                    "payload": {
                                        "type": "function_call",
                                        "id": "fc_item_1",
                                        "call_id": "call_1",
                                        "name": "shell",
                                        "arguments": "{\"command\":[\"zsh\",\"-lc\",\"git status -sb\"]}"
                                    }
                                },
                                {
                                    "type": "response_item",
                                    "payload": {
                                        "type": "function_call_output",
                                        "id": "out_item_1",
                                        "call_id": "call_1",
                                        "output": "{\"output\":\"## main\\n\",\"metadata\":{\"exit_code\":0}}"
                                    }
                                },
                                {
                                    "type": "response_item",
                                    "payload": {
                                        "type": "webSearch",
                                        "query": "missing id should not hydrate"
                                    }
                                },
                                {
                                    "type": "agentMessage",
                                    "text": "hi"
                                }
                            ]
                        }
                    ]
                }
            }),
        )
        .expect("thread resume response");

    let replay = output
        .events
        .iter()
        .filter_map(|event| match event {
            EngineEvent::HistoryReplayChunk { entry, .. } => match &entry.content {
                ContentDelta::Text(text) => {
                    Some((entry.role.clone(), "text".to_string(), text.clone()))
                }
                ContentDelta::Structured(text) => {
                    Some((entry.role.clone(), "structured".to_string(), text.clone()))
                }
                ContentDelta::ResourceRef(text) => {
                    Some((entry.role.clone(), "resource".to_string(), text.clone()))
                }
                ContentDelta::Parts(parts) => Some((
                    entry.role.clone(),
                    "parts".to_string(),
                    parts
                        .iter()
                        .filter_map(|part| match part {
                            ContentPart::Text(text) => Some(text.as_str()),
                            ContentPart::Image { .. } | ContentPart::File { .. } => None,
                        })
                        .collect::<Vec<_>>()
                        .join(""),
                )),
            },
            _ => None,
        })
        .collect::<Vec<_>>();
    let replay_entries = output
        .events
        .iter()
        .filter_map(|event| match event {
            EngineEvent::HistoryReplayChunk { entry, .. } => Some(entry),
            _ => None,
        })
        .collect::<Vec<_>>();

    assert_eq!(replay.len(), 8);
    assert_eq!(
        replay[0],
        (HistoryRole::User, "text".to_string(), "hello".to_string())
    );
    assert_eq!(
        replay[1],
        (
            HistoryRole::Reasoning,
            "text".to_string(),
            "thinking".to_string()
        )
    );
    assert_eq!(replay[2].0, HistoryRole::Tool);
    assert_eq!(replay[2].1, "structured");
    let search_item: Value = serde_json::from_str(&replay[2].2).expect("search item");
    assert_eq!(
        search_item.get("type").and_then(Value::as_str),
        Some("webSearch")
    );
    assert_eq!(
        search_item.get("id").and_then(Value::as_str),
        Some("search_1")
    );
    assert_eq!(
        search_item.get("status").and_then(Value::as_str),
        Some("completed")
    );
    assert_eq!(
        replay_entries[2]
            .tool
            .as_ref()
            .and_then(|tool| tool.kind.as_ref()),
        Some(&ActionKind::WebSearch)
    );
    assert_eq!(
        replay_entries[2]
            .tool
            .as_ref()
            .and_then(|tool| tool.title.as_deref()),
        Some("keyboard lock")
    );
    assert_eq!(replay[3].0, HistoryRole::Tool);
    assert_eq!(replay[3].1, "structured");
    let tool_item: Value = serde_json::from_str(&replay[3].2).expect("tool item");
    assert_eq!(
        tool_item.get("type").and_then(Value::as_str),
        Some("commandExecution")
    );
    assert_eq!(tool_item.get("id").and_then(Value::as_str), Some("exec-1"));
    assert_eq!(
        replay_entries[3]
            .tool
            .as_ref()
            .and_then(|tool| tool.kind.as_ref()),
        Some(&ActionKind::Command)
    );
    assert_eq!(
        replay_entries[3]
            .tool
            .as_ref()
            .and_then(|tool| tool.title.as_deref()),
        Some("cargo test")
    );
    assert_eq!(replay[4].0, HistoryRole::Tool);
    assert_eq!(replay[4].1, "structured");
    let raw_call_item: Value = serde_json::from_str(&replay[4].2).expect("raw call item");
    assert_eq!(
        raw_call_item.get("type").and_then(Value::as_str),
        Some("function_call")
    );
    assert_eq!(
        raw_call_item.get("id").and_then(Value::as_str),
        Some("call_1")
    );
    assert_eq!(
        raw_call_item.get("itemId").and_then(Value::as_str),
        Some("fc_item_1")
    );
    assert_eq!(
        raw_call_item.get("call_id").and_then(Value::as_str),
        Some("call_1")
    );
    assert_eq!(
        raw_call_item.get("status").and_then(Value::as_str),
        Some("completed")
    );
    assert_eq!(
        replay_entries[4]
            .tool
            .as_ref()
            .and_then(|tool| tool.kind.as_ref()),
        Some(&ActionKind::Command)
    );
    assert_eq!(replay[5].0, HistoryRole::Tool);
    assert_eq!(replay[5].1, "structured");
    let raw_output_item: Value = serde_json::from_str(&replay[5].2).expect("raw output item");
    assert_eq!(
        raw_output_item.get("type").and_then(Value::as_str),
        Some("function_call_output")
    );
    assert_eq!(
        raw_output_item.get("id").and_then(Value::as_str),
        Some("call_1")
    );
    assert_eq!(
        raw_output_item.get("itemId").and_then(Value::as_str),
        Some("out_item_1")
    );
    assert_eq!(
        raw_output_item.get("call_id").and_then(Value::as_str),
        Some("call_1")
    );
    assert_eq!(
        raw_output_item.get("status").and_then(Value::as_str),
        Some("completed")
    );
    assert_eq!(
        replay_entries[5]
            .tool
            .as_ref()
            .map(|tool| tool.phase.clone()),
        Some(ActionPhase::Completed)
    );
    assert_eq!(replay[6].0, HistoryRole::Tool);
    assert_eq!(replay[6].1, "structured");
    assert!(
        replay_entries[6]
            .tool
            .as_ref()
            .and_then(|tool| tool.id.as_deref())
            .is_some_and(|id| id.starts_with("codex-history-webSearch-"))
    );
    assert_eq!(
        replay_entries[6]
            .tool
            .as_ref()
            .and_then(|tool| tool.kind.as_ref()),
        Some(&ActionKind::WebSearch)
    );
    assert_eq!(
        replay[7],
        (HistoryRole::Assistant, "text".to_string(), "hi".to_string())
    );
}

#[test]
fn thread_resume_drops_codex_internal_agents_instructions() {
    let adapter = CodexAdapter::app_server();
    let mut engine = AngelEngine::with_available_runtime(
        angel_engine::ProtocolFlavor::CodexAppServer,
        angel_engine::RuntimeCapabilities::new("test"),
        adapter.capabilities(),
    );
    let request_id = engine
        .plan_command(angel_engine::EngineCommand::ResumeConversation {
            target: angel_engine::ResumeTarget::Remote {
                id: "thread_1".to_string(),
                hydrate: true,
                cwd: None,
            },
        })
        .expect("resume plan")
        .request_id
        .expect("request id");

    let output = adapter
        .decode_response(
            &engine,
            &request_id,
            &json!({
                "thread": {
                    "id": "thread_1",
                    "turns": [
                        {
                            "items": [
                                {
                                    "type": "response_item",
                                    "payload": {
                                        "type": "message",
                                        "role": "user",
                                        "content": [
                                            {
                                                "type": "input_text",
                                                "text": "# AGENTS.md instructions for /tmp/project\n\n<INSTRUCTIONS>\nDo not display this.\n</INSTRUCTIONS>"
                                            },
                                            {
                                                "type": "input_text",
                                                "text": "<environment_context>\n  <cwd>/tmp/project</cwd>\n</environment_context>"
                                            }
                                        ]
                                    }
                                },
                                {
                                    "type": "userMessage",
                                    "content": [{ "type": "text", "text": "真实问题" }]
                                },
                                {
                                    "type": "userMessage",
                                    "content": [
                                        {
                                            "type": "text",
                                            "text": "<turn_aborted>\nThe user interrupted the previous turn on purpose. Any running unified exec processes may still be running in the background. If any tools/commands were aborted, they may have partially executed.\n</turn_aborted>"
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            }),
        )
        .expect("thread resume response");

    let replay = output
        .events
        .iter()
        .filter_map(|event| match event {
            EngineEvent::HistoryReplayChunk { entry, .. } => Some(entry),
            _ => None,
        })
        .collect::<Vec<_>>();

    assert_eq!(replay.len(), 1);
    assert_eq!(replay[0].role, HistoryRole::User);
    assert!(matches!(
        &replay[0].content,
        ContentDelta::Text(text) if text == "真实问题"
    ));
}
