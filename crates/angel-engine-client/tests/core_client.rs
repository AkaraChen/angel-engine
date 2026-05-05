use angel_engine_client::{
    Client, ClientBuilder, ClientEvent, ClientOptions, ClientStreamDelta,
    ResumeConversationRequest, RuntimeSnapshot, StartConversationRequest, ThreadEvent,
};
use serde_json::json;

#[test]
fn client_hides_engine_behind_thread_updates_and_snapshots() {
    let mut client = ClientOptions::builder()
        .acp("fake-agent")
        .arg("acp")
        .need_auth(false)
        .client_name("ide-test")
        .build_client();

    let initialize = client.initialize().expect("initialize command");
    assert_eq!(
        initialize.update.outgoing[0].value["method"],
        json!("initialize")
    );
    let initialize_id = initialize.request_id.expect("initialize request id");

    let update = client
        .receive_json_value(response(
            &initialize_id,
            json!({
                "protocolVersion": 1,
                "agentInfo": {
                    "name": "fake-agent",
                    "version": "1.2.3"
                },
                "agentCapabilities": {
                    "sessionCapabilities": {
                        "list": {},
                        "additionalDirectories": {}
                    }
                }
            }),
        ))
        .expect("initialize response");
    assert!(update.events.iter().any(|event| {
        matches!(
            event,
            ClientEvent::RuntimeReady { name, version }
                if name == "fake-agent" && version.as_deref() == Some("1.2.3")
        )
    }));
    assert!(matches!(
        client.snapshot().runtime,
        RuntimeSnapshot::Available { ref name, .. } if name == "fake-agent"
    ));

    let start = client
        .start_thread(
            StartConversationRequest::new()
                .cwd("/repo")
                .additional_directory("/repo/packages/ui"),
        )
        .expect("start conversation");
    assert_eq!(
        start.update.outgoing[0].value["method"],
        json!("session/new")
    );
    assert_eq!(
        start.update.outgoing[0].value["params"]["cwd"],
        json!("/repo")
    );
    assert_eq!(
        start.update.outgoing[0].value["params"]["additionalDirectories"],
        json!(["/repo/packages/ui"])
    );
    let conversation_id = start.conversation_id.expect("conversation id");
    let start_id = start.request_id.expect("start request id");

    let update = client
        .receive_json_value(response(
            &start_id,
            json!({
                "sessionId": "sess-1",
                "modes": {
                    "currentModeId": "default",
                    "availableModes": [
                        {"id": "default", "name": "Default"},
                        {"id": "plan", "name": "Plan"}
                    ]
                },
                "models": {
                    "currentModelId": "kimi-k2",
                    "availableModels": [
                        {"id": "kimi-k2", "name": "Kimi K2"}
                    ]
                },
                "configOptions": [
                    {
                        "id": "thought_level",
                        "name": "Reasoning",
                        "category": "thought_level",
                        "currentValue": "medium",
                        "options": [
                            {"value": "low", "name": "Low"},
                            {"value": "medium", "name": "Medium"},
                            {"value": "high", "name": "High"}
                        ]
                    }
                ]
            }),
        ))
        .expect("start response");
    assert!(update.events.iter().any(|event| {
        matches!(
            event,
            ClientEvent::ConversationReady { conversation }
                if conversation.id == conversation_id
                    && conversation.remote_id.as_deref() == Some("sess-1")
        )
    }));
    let snapshot = client.snapshot();
    let conversation = snapshot
        .conversations
        .iter()
        .find(|conversation| conversation.id == conversation_id)
        .expect("conversation snapshot");
    assert_eq!(conversation.lifecycle, "idle");
    assert_eq!(conversation.context.model.as_deref(), Some("kimi-k2"));
    assert_eq!(
        conversation
            .models
            .as_ref()
            .map(|models| models.current_model_id.as_str()),
        Some("kimi-k2")
    );
    assert_eq!(conversation.reasoning.source, "configOption");
    assert_eq!(
        conversation.reasoning.config_option_id.as_deref(),
        Some("thought_level")
    );
    assert_eq!(
        conversation.reasoning.current_effort.as_deref(),
        Some("medium")
    );
    assert_eq!(
        conversation.reasoning.available_efforts,
        vec!["low", "medium", "high"]
    );
    assert_eq!(
        conversation
            .settings
            .reasoning_level
            .current_level
            .as_deref(),
        Some("medium")
    );
    assert_eq!(
        conversation.settings.model_list.current_model_id.as_deref(),
        Some("kimi-k2")
    );
    assert_eq!(
        conversation.settings.model_list.available_models[0].id,
        "kimi-k2"
    );
    assert_eq!(
        conversation
            .settings
            .available_modes
            .current_mode_id
            .as_deref(),
        Some("default")
    );
    assert_eq!(
        client
            .thread_settings(&conversation_id)
            .expect("thread settings")
            .reasoning_level
            .available_levels,
        vec!["low", "medium", "high"]
    );
    let reasoning_options = client
        .thread_settings(&conversation_id)
        .expect("thread settings")
        .reasoning_level
        .available_options;
    assert_eq!(reasoning_options[1].label, "Medium");
    assert!(reasoning_options[1].selected);
    assert!(
        client
            .model_list(&conversation_id)
            .expect("model list")
            .available_models[0]
            .selected
    );
    assert_eq!(
        client
            .available_modes(&conversation_id)
            .expect("available modes")
            .available_modes
            .iter()
            .map(|mode| mode.id.as_str())
            .collect::<Vec<_>>(),
        vec!["default", "plan"]
    );
}

#[test]
fn thread_send_event_streams_turn_deltas_and_terminal_state() {
    let (mut client, conversation_id) = ready_client();

    let turn = client
        .thread(&conversation_id)
        .send_event(ThreadEvent::text("explain the current file"))
        .expect("send text");
    assert_eq!(
        turn.update.outgoing[0].value["method"],
        json!("session/prompt")
    );
    assert_eq!(
        turn.update.outgoing[0].value["params"]["prompt"][0]["text"],
        json!("explain the current file")
    );
    let turn_id = turn.turn_id.expect("turn id");
    let turn_request_id = turn.request_id.expect("turn request id");

    let delta = client
        .receive_json_value(json!({
            "jsonrpc": "2.0",
            "method": "session/update",
            "params": {
                "sessionId": "sess-1",
                "update": {
                    "sessionUpdate": "agent_message_chunk",
                    "content": {
                        "type": "text",
                        "text": "The file defines a client facade."
                    }
                }
            }
        }))
        .expect("assistant delta");
    assert!(delta.events.iter().any(|event| {
        matches!(
            event,
            ClientEvent::AssistantDelta { conversation_id: id, turn_id: tid, content }
                if id == &conversation_id
                    && tid == &turn_id
                    && content.text == "The file defines a client facade."
        )
    }));
    assert!(delta.stream_deltas.iter().any(|delta| {
        matches!(
            delta,
            ClientStreamDelta::AssistantDelta { conversation_id: id, turn_id: tid, content }
                if id == &conversation_id
                    && tid == &turn_id
                    && content.text == "The file defines a client facade."
        )
    }));
    let delta_value = serde_json::to_value(&delta).expect("serialize update");
    assert_eq!(
        delta_value["streamDeltas"][0]["type"],
        json!("assistantDelta")
    );
    assert_eq!(
        delta_value["streamDeltas"][0]["conversationId"],
        json!(&conversation_id)
    );
    assert!(delta_value["streamDeltas"][0]["conversation_id"].is_null());
    assert_eq!(delta_value["events"][1]["turnId"], json!(&turn_id));
    assert!(delta_value["events"][1]["turn_id"].is_null());

    let terminal = client
        .receive_json_value(response(
            &turn_request_id,
            json!({"stopReason": "end_turn"}),
        ))
        .expect("turn response");
    assert!(terminal.events.iter().any(|event| {
        matches!(
            event,
            ClientEvent::TurnTerminal { conversation_id: id, turn_id: tid, outcome }
                if id == &conversation_id && tid == &turn_id && outcome.contains("Succeeded")
        )
    }));

    let snapshot = client
        .thread(&conversation_id)
        .turn(&turn_id)
        .expect("turn snapshot");
    assert_eq!(snapshot.output_text, "The file defines a client facade.");
    assert!(snapshot.phase.contains("terminal"));
}

#[test]
fn codex_completed_reasoning_item_surfaces_reasoning_updates() {
    let (mut client, conversation_id) = ready_codex_client();

    let sent = client
        .thread(&conversation_id)
        .send_event(ThreadEvent::text("find the bug"))
        .expect("send codex text");
    assert_eq!(sent.update.outgoing[0].value["method"], json!("turn/start"));
    let turn_id = sent.turn_id.expect("turn id");
    client
        .receive_json_value(response(
            &sent.request_id.expect("turn request id"),
            json!({
                "turn": {
                    "id": "turn-1",
                    "status": "inProgress"
                }
            }),
        ))
        .expect("turn accepted");

    let update = client
        .receive_json_value(json!({
            "jsonrpc": "2.0",
            "method": "item/completed",
            "params": {
                "threadId": "thread-1",
                "turnId": "turn-1",
                "item": {
                    "id": "reasoning-1",
                    "type": "reasoning",
                    "summary": ["Checking adapter notifications."]
                }
            }
        }))
        .expect("reasoning item");

    assert!(update.logs.iter().any(|log| {
        log.kind == angel_engine_client::ClientLogKind::Output
            && log.message == "[reasoning] Checking adapter notifications."
    }));
    assert!(update.events.iter().any(|event| {
        matches!(
            event,
            ClientEvent::ReasoningDelta { conversation_id: id, turn_id: tid, content }
                if id == &conversation_id
                    && tid == &turn_id
                    && content.text == "Checking adapter notifications."
        )
    }));
    assert!(update.stream_deltas.iter().any(|delta| {
        matches!(
            delta,
            ClientStreamDelta::ReasoningDelta { conversation_id: id, turn_id: tid, content }
                if id == &conversation_id
                    && tid == &turn_id
                    && content.text == "Checking adapter notifications."
        )
    }));

    let snapshot = client
        .thread(&conversation_id)
        .turn(&turn_id)
        .expect("turn snapshot");
    assert_eq!(snapshot.reasoning_text, "Checking adapter notifications.");
}

#[test]
fn codex_resume_projects_raw_tool_history_into_display_messages() {
    let mut client = ClientOptions::builder()
        .codex_app_server("codex")
        .build_client();
    let initialize = client.initialize().expect("initialize");
    client
        .receive_json_value(response(
            &initialize.request_id.expect("initialize id"),
            json!({"userAgent": "codex-test"}),
        ))
        .expect("initialize response");

    let resume = client
        .resume_thread(ResumeConversationRequest {
            additional_directories: Vec::new(),
            hydrate: true,
            remote_id: "thread-1".to_string(),
        })
        .expect("resume thread");
    let conversation_id = resume.conversation_id.expect("conversation id");
    client
        .receive_json_value(response(
            &resume.request_id.expect("resume id"),
            json!({
                "thread": {
                    "id": "thread-1",
                    "turns": [
                        {
                            "id": "turn-1",
                            "items": [
                                {
                                    "type": "userMessage",
                                    "content": [{ "type": "text", "text": "status" }]
                                },
                                {
                                    "type": "response_item",
                                    "payload": {
                                        "type": "function_call",
                                        "call_id": "call_1",
                                        "name": "shell",
                                        "arguments": "{\"command\":[\"zsh\",\"-lc\",\"git status -sb\"]}"
                                    }
                                },
                                {
                                    "type": "response_item",
                                    "payload": {
                                        "type": "function_call_output",
                                        "call_id": "call_1",
                                        "output": "{\"output\":\"## main\\n\",\"metadata\":{\"exit_code\":0}}"
                                    }
                                },
                                {
                                    "type": "agentMessage",
                                    "text": "done"
                                }
                            ]
                        }
                    ]
                }
            }),
        ))
        .expect("resume response");

    let conversation = client
        .snapshot()
        .conversations
        .into_iter()
        .find(|conversation| conversation.id == conversation_id)
        .expect("conversation snapshot");
    assert_eq!(conversation.messages.len(), 2);
    assert_eq!(conversation.messages[0].role, "user");
    assert_eq!(
        conversation.messages[0].content[0].text.as_deref(),
        Some("status")
    );

    let assistant = &conversation.messages[1];
    let tool = assistant
        .content
        .iter()
        .find(|part| part.kind == "tool-call")
        .and_then(|part| part.action.as_ref())
        .expect("tool call part");
    assert_eq!(tool.id, "call_1");
    assert_eq!(tool.kind, "command");
    assert_eq!(tool.phase, "completed");
    assert_eq!(tool.output_text, "## main\n");
    assert_eq!(
        assistant
            .content
            .last()
            .and_then(|part| part.text.as_deref()),
        Some("done")
    );
}

#[test]
fn acp_resume_projects_tool_history_into_display_messages() {
    let mut client = ClientOptions::builder()
        .acp("fake-agent")
        .need_auth(false)
        .build_client();
    let initialize = client.initialize().expect("initialize");
    client
        .receive_json_value(response(
            &initialize.request_id.expect("initialize id"),
            json!({
                "protocolVersion": 1,
                "agentInfo": {"name": "fake-agent"},
                "agentCapabilities": {
                    "loadSession": true
                }
            }),
        ))
        .expect("initialize response");

    let resume = client
        .resume_thread(ResumeConversationRequest {
            additional_directories: Vec::new(),
            hydrate: true,
            remote_id: "sess-1".to_string(),
        })
        .expect("resume thread");
    assert_eq!(
        resume.update.outgoing[0].value["method"],
        json!("session/load")
    );
    let conversation_id = resume.conversation_id.expect("conversation id");

    client
        .receive_json_value(json!({
            "jsonrpc": "2.0",
            "method": "session/update",
            "params": {
                "sessionId": "sess-1",
                "update": {
                    "sessionUpdate": "user_message_chunk",
                    "content": {"type": "text", "text": "run tests"}
                }
            }
        }))
        .expect("user replay");
    client
        .receive_json_value(json!({
            "jsonrpc": "2.0",
            "method": "session/update",
            "params": {
                "sessionId": "sess-1",
                "update": {
                    "sessionUpdate": "tool_call",
                    "toolCallId": "tool-1",
                    "kind": "execute",
                    "title": "npm test",
                    "status": "in_progress",
                    "rawInput": {"command": "npm test"}
                }
            }
        }))
        .expect("tool replay");
    client
        .receive_json_value(json!({
            "jsonrpc": "2.0",
            "method": "session/update",
            "params": {
                "sessionId": "sess-1",
                "update": {
                    "sessionUpdate": "tool_call_update",
                    "toolCallId": "tool-1",
                    "kind": "execute",
                    "title": "npm test",
                    "status": "completed",
                    "content": [
                        {
                            "type": "content",
                            "content": {"type": "text", "text": "ok\n"}
                        }
                    ]
                }
            }
        }))
        .expect("tool output replay");
    client
        .receive_json_value(response(
            &resume.request_id.expect("resume id"),
            json!({"sessionId": "sess-1"}),
        ))
        .expect("resume response");

    let conversation = client
        .snapshot()
        .conversations
        .into_iter()
        .find(|conversation| conversation.id == conversation_id)
        .expect("conversation snapshot");
    assert_eq!(conversation.messages.len(), 2);
    assert_eq!(
        conversation.messages[0].content[0].text.as_deref(),
        Some("run tests")
    );
    let tool = conversation.messages[1].content[0]
        .action
        .as_ref()
        .expect("tool action");
    assert_eq!(tool.id, "tool-1");
    assert_eq!(tool.kind, "command");
    assert_eq!(tool.phase, "completed");
    assert_eq!(tool.title.as_deref(), Some("npm test"));
    assert_eq!(tool.output_text, "ok\n");
}

#[test]
fn codex_turn_start_defaults_to_auto_summary_without_effort() {
    let (mut client, conversation_id) = ready_codex_client();

    let conversation = client
        .snapshot()
        .conversations
        .into_iter()
        .find(|conversation| conversation.id == conversation_id)
        .expect("conversation snapshot");
    assert_eq!(conversation.reasoning.source, "codexDefaults");
    assert!(conversation.reasoning.can_set);
    assert_eq!(
        conversation.reasoning.available_efforts,
        vec!["none", "minimal", "low", "medium", "high", "xhigh"]
    );

    let sent = client
        .thread(&conversation_id)
        .send_event(ThreadEvent::text("show reasoning"))
        .expect("send codex text");

    assert_eq!(sent.update.outgoing[0].value["method"], json!("turn/start"));
    assert!(
        sent.update.outgoing[0].value["params"]
            .get("effort")
            .is_none()
    );
    assert_eq!(
        sent.update.outgoing[0].value["params"]["summary"],
        json!("auto")
    );
}

#[test]
fn acp_thinking_model_variant_surfaces_reasoning_options() {
    let mut client = ClientOptions::builder()
        .acp("fake-agent")
        .need_auth(false)
        .build_client();
    let initialize = client.initialize().expect("initialize");
    client
        .receive_json_value(response(
            &initialize.request_id.expect("initialize id"),
            json!({
                "protocolVersion": 1,
                "agentInfo": {"name": "fake-agent"}
            }),
        ))
        .expect("initialize response");

    let start = client
        .start_thread(StartConversationRequest::new().cwd("/repo"))
        .expect("start");
    let conversation_id = start.conversation_id.expect("conversation id");
    client
        .receive_json_value(response(
            &start.request_id.expect("start id"),
            json!({
                "sessionId": "sess-1",
                "models": {
                    "currentModelId": "kimi-k2",
                    "availableModels": [
                        {"id": "kimi-k2", "name": "Kimi K2"},
                        {"id": "kimi-k2,thinking", "name": "Kimi K2 Thinking"}
                    ]
                }
            }),
        ))
        .expect("start response");

    let conversation = client
        .snapshot()
        .conversations
        .into_iter()
        .find(|conversation| conversation.id == conversation_id)
        .expect("conversation snapshot");
    assert_eq!(conversation.reasoning.source, "modelVariant");
    assert_eq!(
        conversation.reasoning.current_effort.as_deref(),
        Some("none")
    );
    assert_eq!(
        conversation.reasoning.available_efforts,
        vec!["none", "thinking"]
    );
}

#[test]
fn codex_explicit_reasoning_effort_keeps_default_summary() {
    let (mut client, conversation_id) = ready_codex_client();

    client
        .thread(&conversation_id)
        .send_event(ThreadEvent::set_reasoning_effort("none"))
        .expect("set reasoning effort");

    let sent = client
        .thread(&conversation_id)
        .send_event(ThreadEvent::text("no reasoning"))
        .expect("send codex text");

    assert_eq!(
        sent.update.outgoing[0].value["params"]["effort"],
        json!("none")
    );
    assert_eq!(
        sent.update.outgoing[0].value["params"]["summary"],
        json!("auto")
    );
}

#[test]
fn codex_high_reasoning_effort_uses_visible_summary_profile() {
    let (mut client, conversation_id) = ready_codex_client();

    client
        .thread(&conversation_id)
        .send_event(ThreadEvent::set_reasoning_effort("high"))
        .expect("set reasoning effort");

    let sent = client
        .thread(&conversation_id)
        .send_event(ThreadEvent::text("show reasoning"))
        .expect("send codex text");

    assert_eq!(
        sent.update.outgoing[0].value["params"]["effort"],
        json!("xhigh")
    );
    assert_eq!(
        sent.update.outgoing[0].value["params"]["summary"],
        json!("auto")
    );
}

#[test]
fn thread_set_model_event_updates_snapshot_after_runtime_ack() {
    let (mut client, conversation_id) = ready_client();

    let update = client
        .thread(&conversation_id)
        .set_model("moonshot-v1-128k")
        .expect("set model");
    assert_eq!(
        update.update.outgoing[0].value["method"],
        json!("session/set_model")
    );
    assert_eq!(
        update.update.outgoing[0].value["params"]["modelId"],
        json!("moonshot-v1-128k")
    );

    let request_id = update.request_id.expect("set model request id");
    client
        .receive_json_value(response(&request_id, json!({})))
        .expect("set model response");

    let snapshot = client.snapshot();
    let conversation = snapshot
        .conversations
        .iter()
        .find(|conversation| conversation.id == conversation_id)
        .expect("conversation snapshot");
    assert_eq!(
        conversation.context.model.as_deref(),
        Some("moonshot-v1-128k")
    );
}

fn ready_client() -> (Client, String) {
    let mut client = ClientOptions::builder()
        .acp("fake-agent")
        .need_auth(false)
        .build_client();
    let initialize = client.initialize().expect("initialize");
    client
        .receive_json_value(response(
            &initialize.request_id.expect("initialize id"),
            json!({
                "protocolVersion": 1,
                "agentInfo": {"name": "fake-agent"},
                "agentCapabilities": {
                    "sessionCapabilities": {
                        "additionalDirectories": {}
                    }
                }
            }),
        ))
        .expect("initialize response");

    let start = client
        .start_thread(StartConversationRequest::new().cwd("/repo"))
        .expect("start");
    let conversation_id = start.conversation_id.expect("conversation id");
    client
        .receive_json_value(response(
            &start.request_id.expect("start id"),
            json!({"sessionId": "sess-1"}),
        ))
        .expect("start response");
    (client, conversation_id)
}

fn ready_codex_client() -> (Client, String) {
    let mut client = ClientOptions::builder()
        .codex_app_server("codex")
        .build_client();
    let initialize = client.initialize().expect("initialize");
    client
        .receive_json_value(response(
            &initialize.request_id.expect("initialize id"),
            json!({"userAgent": "codex-test"}),
        ))
        .expect("initialize response");

    let start = client
        .start_thread(StartConversationRequest::new().cwd("/repo"))
        .expect("start");
    let conversation_id = start.conversation_id.expect("conversation id");
    client
        .receive_json_value(response(
            &start.request_id.expect("start id"),
            json!({
                "thread": {
                    "id": "thread-1"
                },
                "cwd": "/repo"
            }),
        ))
        .expect("start response");
    (client, conversation_id)
}

#[test]
fn client_builder_and_thread_event_api_keep_ids_on_the_thread_handle() {
    let options = ClientOptions::builder()
        .acp("fake-agent")
        .need_auth(false)
        .client_name("ide-test")
        .build();
    let mut client = ClientBuilder::new(options).build();

    let initialize = client.initialize().expect("initialize");
    client
        .receive_json_value(response(
            &initialize.request_id.expect("initialize id"),
            json!({
                "protocolVersion": 1,
                "agentInfo": {"name": "fake-agent"}
            }),
        ))
        .expect("initialize response");

    let start = client
        .start_thread(StartConversationRequest::new().cwd("/repo"))
        .expect("start thread");
    let conversation_id = start.conversation_id.expect("conversation id");
    client
        .receive_json_value(response(
            &start.request_id.expect("start id"),
            json!({"sessionId": "sess-1"}),
        ))
        .expect("start response");

    let mut thread = client.get_thread(conversation_id.clone());
    assert_eq!(
        thread.require_state().expect("thread state").id,
        conversation_id
    );

    let sent = thread
        .send_event(ThreadEvent::text("summarize this repo"))
        .expect("thread send event");
    assert_eq!(
        sent.update.outgoing[0].value["method"],
        json!("session/prompt")
    );
    assert_eq!(
        sent.update.outgoing[0].value["params"]["sessionId"],
        json!("sess-1")
    );
    assert_eq!(
        sent.update.outgoing[0].value["params"]["prompt"][0]["text"],
        json!("summarize this repo")
    );

    let turn_id = sent.turn_id.expect("turn id");
    drop(thread);

    client
        .receive_json_value(response(
            &sent.request_id.expect("turn request id"),
            json!({"stopReason": "end_turn"}),
        ))
        .expect("turn terminal");

    let thread = client.thread(conversation_id);
    assert_eq!(thread.turn(&turn_id).expect("completed turn").id, turn_id);
}

fn response(id: &str, result: serde_json::Value) -> serde_json::Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": result
    })
}
