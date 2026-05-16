use angel_engine_client::{
    Client, ClientBuilder, ClientError, ClientEvent, ClientInput, ClientOptions, ClientStreamDelta,
    ElicitationResponse, ResumeConversationRequest, RuntimeSnapshot, StartConversationRequest,
    ThreadEvent,
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
        conversation.settings.model_list.current_model_id.as_deref(),
        Some("kimi-k2")
    );
    assert_eq!(conversation.settings.reasoning_level.source, "configOption");
    assert_eq!(
        conversation
            .settings
            .reasoning_level
            .config_option_id
            .as_deref(),
        Some("thought_level")
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
        conversation.settings.reasoning_level.available_levels,
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
        conversation.agent_state.current_mode.as_deref(),
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
    assert!(snapshot.is_terminal);
}

#[test]
fn acp_plan_update_surfaces_independent_plan_message_part() {
    let (mut client, conversation_id) = ready_client();

    let turn = client
        .thread(&conversation_id)
        .send_event(ThreadEvent::text("make a plan"))
        .expect("send text");
    let turn_id = turn.turn_id.expect("turn id");

    let update = client
        .receive_json_value(json!({
            "jsonrpc": "2.0",
            "method": "session/update",
            "params": {
                "sessionId": "sess-1",
                "update": {
                    "sessionUpdate": "plan",
                    "entries": [
                        {
                            "content": "Inspect ACP mode state",
                            "priority": "high",
                            "status": "completed"
                        },
                        {
                            "content": "Render plan separately",
                            "priority": "medium",
                            "status": "in_progress"
                        }
                    ]
                }
            }
        }))
        .expect("plan update");

    assert!(update.events.iter().any(|event| {
        matches!(
            event,
            ClientEvent::PlanUpdated { conversation_id: id, turn_id: tid, plan }
                if id == &conversation_id
                    && tid == &turn_id
                    && plan.entries.len() == 2
                    && plan.entries[0].content == "Inspect ACP mode state"
                    && plan.entries[0].status == "completed"
                    && plan.entries[1].status == "in_progress"
        )
    }));

    let snapshot = client.snapshot();
    let conversation = snapshot
        .conversations
        .iter()
        .find(|conversation| conversation.id == conversation_id)
        .expect("conversation snapshot");
    let assistant = conversation
        .messages
        .iter()
        .find(|message| message.id == format!("{turn_id}:assistant"))
        .expect("assistant message");

    assert_eq!(assistant.content.len(), 1);
    let plan_part = &assistant.content[0];
    assert_eq!(plan_part.kind, "plan");
    assert!(plan_part.text.is_none());
    assert_eq!(
        plan_part.plan.as_ref().expect("plan snapshot").entries[1].content,
        "Render plan separately"
    );
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
fn codex_slash_fast_is_interpreted_without_starting_turn() {
    let (mut client, conversation_id) = ready_codex_client();

    let sent = client
        .thread(&conversation_id)
        .send_event(ThreadEvent::text("/fast"))
        .expect("send slash");

    assert!(sent.turn_id.is_none());
    assert!(sent.request_id.is_none());
    assert!(sent.update.outgoing.is_empty());
    assert_eq!(sent.message.as_deref(), Some("Fast mode is on."));

    let next = client
        .thread(&conversation_id)
        .send_event(ThreadEvent::text("hello"))
        .expect("send text");
    assert_eq!(next.update.outgoing[0].value["method"], json!("turn/start"));
    assert_eq!(
        next.update.outgoing[0].value["params"]["serviceTier"],
        json!("priority")
    );
}

#[test]
fn codex_slash_compact_is_request_backed_without_starting_turn() {
    let (mut client, conversation_id) = ready_codex_client();

    let sent = client
        .thread(&conversation_id)
        .send_event(ThreadEvent::text("/compact"))
        .expect("send compact slash");

    assert!(sent.turn_id.is_none());
    let request_id = sent.request_id.expect("compact request id");
    assert_eq!(
        sent.update.outgoing[0].value["method"],
        json!("thread/compact/start")
    );
    assert_eq!(
        client
            .thread(&conversation_id)
            .require_state()
            .expect("conversation")
            .lifecycle,
        "mutatingHistory"
    );

    let update = client
        .receive_json_value(response(&request_id, json!({})))
        .expect("compact response");
    assert!(update.completed_request_ids.contains(&request_id));
    assert!(update.events.iter().any(|event| {
        matches!(
            event,
            ClientEvent::HistoryUpdated {
                conversation_id: id
            } if id == &conversation_id
        )
    }));
    assert_eq!(
        client
            .thread(&conversation_id)
            .require_state()
            .expect("conversation")
            .lifecycle,
        "idle"
    );
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
            cwd: None,
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
                                        "type": "webSearch",
                                        "id": "search_1",
                                        "query": "keyboard lock"
                                    }
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
    assert_eq!(
        assistant
            .content
            .iter()
            .filter(|part| part.kind == "tool-call")
            .count(),
        2
    );
    let search = assistant
        .content
        .iter()
        .find(|part| {
            part.action
                .as_ref()
                .is_some_and(|action| action.id == "search_1")
        })
        .and_then(|part| part.action.as_ref())
        .expect("search tool call");
    assert_eq!(search.kind.as_deref(), Some("webSearch"));
    assert_eq!(search.phase, "completed");
    assert_eq!(search.output_text, "");
    let tool = assistant
        .content
        .iter()
        .find(|part| {
            part.action
                .as_ref()
                .is_some_and(|action| action.id == "call_1")
        })
        .and_then(|part| part.action.as_ref())
        .expect("tool call part");
    assert_eq!(tool.id, "call_1");
    assert_eq!(tool.kind.as_deref(), Some("command"));
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
            cwd: None,
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
    assert_eq!(tool.kind.as_deref(), Some("command"));
    assert_eq!(tool.phase, "completed");
    assert_eq!(tool.title.as_deref(), Some("npm test"));
    assert_eq!(tool.output_text, "ok\n");
}

#[test]
fn codex_turn_start_uses_provider_reasoning_config_default() {
    let (mut client, conversation_id) = ready_codex_client();

    let conversation = client
        .snapshot()
        .conversations
        .into_iter()
        .find(|conversation| conversation.id == conversation_id)
        .expect("conversation snapshot");
    assert_eq!(conversation.settings.reasoning_level.source, "configOption");
    assert_eq!(
        conversation
            .settings
            .reasoning_level
            .config_option_id
            .as_deref(),
        Some("reasoning")
    );
    assert!(conversation.settings.reasoning_level.can_set);
    assert_eq!(
        conversation.settings.reasoning_level.available_levels,
        vec!["none", "minimal", "low", "medium", "high", "xhigh"]
    );

    let sent = client
        .thread(&conversation_id)
        .send_event(ThreadEvent::text("show reasoning"))
        .expect("send codex text");

    assert_eq!(sent.update.outgoing[0].value["method"], json!("turn/start"));
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
fn acp_model_variants_do_not_infer_reasoning_options() {
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
    assert_eq!(conversation.settings.reasoning_level.source, "unsupported");
    assert_eq!(
        conversation
            .settings
            .reasoning_level
            .current_level
            .as_deref(),
        None
    );
    assert!(
        conversation
            .settings
            .reasoning_level
            .available_levels
            .is_empty()
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

#[test]
fn thread_set_mode_event_updates_snapshot_after_runtime_ack() {
    let (mut client, conversation_id) = ready_client();

    let update = client
        .thread(&conversation_id)
        .set_mode("plan")
        .expect("set mode");
    assert_eq!(
        update.update.outgoing[0].value["method"],
        json!("session/set_mode")
    );
    assert_eq!(
        update.update.outgoing[0].value["params"]["modeId"],
        json!("plan")
    );

    let request_id = update.request_id.expect("set mode request id");
    client
        .receive_json_value(response(&request_id, json!({})))
        .expect("set mode response");

    let snapshot = client.snapshot();
    let conversation = snapshot
        .conversations
        .iter()
        .find(|conversation| conversation.id == conversation_id)
        .expect("conversation snapshot");
    assert_eq!(conversation.context.mode.as_deref(), Some("plan"));
    assert_eq!(
        conversation.agent_state.current_mode.as_deref(),
        Some("plan")
    );
}

#[test]
fn thread_set_mode_event_resolves_available_mode_name_or_uri_fragment() {
    let (mut client, conversation_id) = ready_uri_mode_client();

    let update = client
        .thread(&conversation_id)
        .set_mode("plan")
        .expect("set mode alias");
    assert_eq!(
        update.update.outgoing[0].value["method"],
        json!("session/set_mode")
    );
    assert_eq!(
        update.update.outgoing[0].value["params"]["modeId"],
        json!("https://agentclientprotocol.com/protocol/session-modes#plan")
    );
}

#[test]
fn inputs_event_encodes_every_supported_user_input_shape_for_acp() {
    let (mut client, conversation_id) = ready_client();

    let sent = client
        .thread(&conversation_id)
        .send_event(ThreadEvent::input(vec![
            ClientInput::text("inspect these inputs"),
            ClientInput::ResourceLink {
                name: "docs".to_string(),
                uri: "file:///repo/docs/readme.md".to_string(),
                mime_type: Some("text/markdown".to_string()),
                title: Some("Readme".to_string()),
                description: Some("Project docs".to_string()),
            },
            ClientInput::file_mention(
                "lib.rs",
                "/repo/src/lib.rs",
                Some("text/x-rust".to_string()),
            ),
            ClientInput::EmbeddedTextResource {
                uri: "memory://note".to_string(),
                text: "inline note".to_string(),
                mime_type: Some("text/plain".to_string()),
            },
            ClientInput::embedded_blob_resource(
                "file:///repo/archive.bin",
                "AAEC",
                Some("application/zip".to_string()),
                Some("archive.bin".to_string()),
            ),
            ClientInput::image(
                "iVBORw0KGgo=",
                "image/png",
                Some("screenshot.png".to_string()),
            ),
            ClientInput::raw_content_block(json!({
                "type": "text",
                "text": "raw block"
            })),
        ]))
        .expect("send inputs");

    assert_eq!(
        sent.update.outgoing[0].value["method"],
        json!("session/prompt")
    );
    let prompt = &sent.update.outgoing[0].value["params"]["prompt"];
    assert_eq!(prompt.as_array().expect("prompt blocks").len(), 7);
    assert_eq!(prompt[0]["type"], json!("text"));
    assert_eq!(prompt[0]["text"], json!("inspect these inputs"));
    assert_eq!(prompt[1]["type"], json!("resource_link"));
    assert_eq!(prompt[1]["name"], json!("docs"));
    assert_eq!(prompt[1]["mimeType"], json!("text/markdown"));
    assert_eq!(prompt[1]["title"], json!("Readme"));
    assert_eq!(prompt[2]["type"], json!("resource_link"));
    assert_eq!(prompt[2]["name"], json!("lib.rs"));
    assert_eq!(prompt[2]["uri"], json!("file:///repo/src/lib.rs"));
    assert_eq!(prompt[3]["type"], json!("resource"));
    assert_eq!(prompt[3]["resource"]["text"], json!("inline note"));
    assert_eq!(prompt[4]["type"], json!("resource"));
    assert_eq!(prompt[4]["resource"]["blob"], json!("AAEC"));
    assert_eq!(prompt[5]["type"], json!("image"));
    assert_eq!(prompt[5]["data"], json!("iVBORw0KGgo="));
    assert_eq!(prompt[5]["mimeType"], json!("image/png"));
    assert_eq!(prompt[6]["type"], json!("text"));
    assert_eq!(prompt[6]["text"], json!("raw block"));

    let turn = client
        .thread(&conversation_id)
        .turn(&sent.turn_id.expect("turn id"))
        .expect("turn snapshot");
    assert!(turn.input_text.contains("inspect these inputs"));
    assert!(turn.input_text.contains("/repo/src/lib.rs"));
}

#[test]
fn user_operation_errors_do_not_create_phantom_thread_state() {
    let (mut client, conversation_id) = ready_client();

    let missing = client
        .thread("missing")
        .send_event(ThreadEvent::text("hello"))
        .expect_err("missing conversation should reject send");
    assert!(matches!(
        missing,
        ClientError::Engine(angel_engine::EngineError::ConversationNotFound {
            conversation_id
        }) if conversation_id == "missing"
    ));

    let idle_cancel = client
        .thread(&conversation_id)
        .send_event(ThreadEvent::cancel())
        .expect_err("idle conversation should reject cancel");
    assert!(matches!(
        idle_cancel,
        ClientError::Engine(angel_engine::EngineError::MissingActiveTurn { conversation_id: id })
            if id == conversation_id
    ));

    let no_elicitation = client
        .thread(&conversation_id)
        .send_event(ThreadEvent::resolve_first(ElicitationResponse::Allow))
        .expect_err("no open elicitation should reject resolve_first");
    assert!(matches!(
        no_elicitation,
        ClientError::InvalidInput { message } if message.contains("has no open elicitation")
    ));

    let snapshot = client.snapshot();
    assert!(
        snapshot
            .conversations
            .iter()
            .any(|conversation| conversation.id == conversation_id
                && conversation.lifecycle == "idle")
    );
    assert!(
        !snapshot
            .conversations
            .iter()
            .any(|conversation| conversation.id == "missing")
    );
}

#[test]
fn resolve_first_elicitation_event_answers_runtime_permission_request() {
    let (mut client, conversation_id) = ready_client();
    client
        .thread(&conversation_id)
        .send_event(ThreadEvent::text("run a command"))
        .expect("start turn");

    let update = client
        .receive_json_value(json!({
            "jsonrpc": "2.0",
            "id": "perm-1",
            "method": "session/request_permission",
            "params": {
                "sessionId": "sess-1",
                "toolCallId": "tool-1",
                "title": "Run command",
                "options": [
                    {"optionId": "allow", "name": "Allow", "kind": "allow_once"},
                    {"optionId": "deny", "name": "Deny", "kind": "reject_once"}
                ]
            }
        }))
        .expect("permission request");
    assert!(update.events.iter().any(|event| {
        matches!(
            event,
            ClientEvent::ElicitationOpened {
                conversation_id: id,
                ..
            } if id == &conversation_id
        )
    }));
    let open = client.thread(&conversation_id).open_elicitations();
    assert_eq!(open.len(), 1);

    let resolved = client
        .thread(&conversation_id)
        .send_event(ThreadEvent::approve_first())
        .expect("approve permission");
    assert_eq!(resolved.update.outgoing[0].value["id"], json!("perm-1"));
    assert!(resolved.update.outgoing[0].value["result"].is_object());
    assert!(resolved.update.events.iter().any(|event| {
        matches!(
            event,
            ClientEvent::ElicitationUpdated {
                conversation_id: id,
                elicitation
            } if id == &conversation_id && elicitation.phase.starts_with("resolved:")
        )
    }));
    assert!(
        client
            .thread(&conversation_id)
            .open_elicitations()
            .is_empty()
    );
}

#[test]
fn setting_thread_events_route_to_runtime_setting_commands() {
    let (mut client, conversation_id) = ready_client();

    let model = client
        .thread(&conversation_id)
        .send_event(ThreadEvent::set_model("moonshot-v1-128k"))
        .expect("set model event");
    assert_eq!(
        model.update.outgoing[0].value["method"],
        json!("session/set_model")
    );
    assert_eq!(
        model.update.outgoing[0].value["params"]["modelId"],
        json!("moonshot-v1-128k")
    );

    let mode = client
        .thread(&conversation_id)
        .send_event(ThreadEvent::set_mode("plan"))
        .expect("set mode event");
    assert_eq!(
        mode.update.outgoing[0].value["method"],
        json!("session/set_mode")
    );
    assert_eq!(
        mode.update.outgoing[0].value["params"]["modeId"],
        json!("plan")
    );
}

#[test]
fn focused_thread_events_target_the_active_turn() {
    let (mut client, conversation_id) = ready_codex_client();

    let sent = client
        .thread(&conversation_id)
        .send_event(ThreadEvent::text("start a long task"))
        .expect("send codex text");
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

    let steered = client
        .thread(&conversation_id)
        .send_event(ThreadEvent::steer("add this constraint"))
        .expect("steer focused turn");
    assert_eq!(
        steered.update.outgoing[0].value["method"],
        json!("turn/steer")
    );
    assert_eq!(
        steered.update.outgoing[0].value["params"]["expectedTurnId"],
        json!("turn-1")
    );
    assert_eq!(steered.turn_id.as_deref(), Some(turn_id.as_str()));

    let cancelled = client
        .thread(&conversation_id)
        .send_event(ThreadEvent::cancel())
        .expect("cancel focused turn");
    assert_eq!(
        cancelled.update.outgoing[0].value["method"],
        json!("turn/interrupt")
    );
    assert_eq!(
        cancelled.update.outgoing[0].value["params"]["turnId"],
        json!("turn-1")
    );
    assert_eq!(cancelled.turn_id.as_deref(), Some(turn_id.as_str()));
}

#[test]
fn codex_thread_events_cover_lifecycle_history_and_shell_operations() {
    let (mut client, conversation_id) = ready_codex_client();

    let archive = client
        .thread(&conversation_id)
        .send_event(ThreadEvent::Archive)
        .expect("archive thread");
    assert_eq!(
        archive.update.outgoing[0].value["method"],
        json!("thread/archive")
    );
    assert_eq!(
        archive.update.outgoing[0].value["params"]["threadId"],
        json!("thread-1")
    );

    let unarchive = client
        .thread(&conversation_id)
        .send_event(ThreadEvent::Unarchive)
        .expect("unarchive thread");
    assert_eq!(
        unarchive.update.outgoing[0].value["method"],
        json!("thread/unarchive")
    );

    let unsubscribe = client
        .thread(&conversation_id)
        .send_event(ThreadEvent::Unsubscribe)
        .expect("unsubscribe thread");
    assert_eq!(
        unsubscribe.update.outgoing[0].value["method"],
        json!("thread/unsubscribe")
    );

    let shell = client
        .thread(&conversation_id)
        .send_event(ThreadEvent::shell("git status --short"))
        .expect("shell command");
    assert_eq!(
        shell.update.outgoing[0].value["method"],
        json!("thread/shellCommand")
    );
    assert_eq!(
        shell.update.outgoing[0].value["params"]["command"],
        json!("git status --short")
    );

    let fork = client
        .thread(&conversation_id)
        .send_event(ThreadEvent::fork())
        .expect("fork thread");
    assert_eq!(
        fork.update.outgoing[0].value["method"],
        json!("thread/fork")
    );
    assert_eq!(
        fork.update.outgoing[0].value["params"]["threadId"],
        json!("thread-1")
    );
    assert_ne!(
        fork.conversation_id.as_deref(),
        Some(conversation_id.as_str())
    );

    let compact = client
        .thread(&conversation_id)
        .send_event(ThreadEvent::CompactHistory)
        .expect("compact history");
    assert_eq!(
        compact.update.outgoing[0].value["method"],
        json!("thread/compact/start")
    );
    client
        .receive_json_value(response(
            &compact.request_id.expect("compact request id"),
            json!({}),
        ))
        .expect("compact response");

    let rollback = client
        .thread(&conversation_id)
        .send_event(ThreadEvent::rollback_history(2))
        .expect("rollback history");
    assert_eq!(
        rollback.update.outgoing[0].value["method"],
        json!("thread/rollback")
    );
    assert_eq!(
        rollback.update.outgoing[0].value["params"]["numTurns"],
        json!(2)
    );

    let close = client
        .thread(&conversation_id)
        .send_event(ThreadEvent::Close)
        .expect_err("close is not negotiated for codex test runtime");
    assert!(matches!(
        close,
        ClientError::Engine(angel_engine::EngineError::CapabilityUnsupported {
            capability
        }) if capability == "conversation.close"
    ));
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
                        {"id": "kimi-k2", "name": "Kimi K2"},
                        {"id": "moonshot-v1-128k", "name": "Moonshot v1 128k"}
                    ]
                }
            }),
        ))
        .expect("start response");
    (client, conversation_id)
}

fn ready_uri_mode_client() -> (Client, String) {
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
                "agentCapabilities": {"sessionCapabilities": {}}
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
                "modes": {
                    "currentModeId": "https://agentclientprotocol.com/protocol/session-modes#agent",
                    "availableModes": [
                        {
                            "id": "https://agentclientprotocol.com/protocol/session-modes#agent",
                            "name": "Agent"
                        },
                        {
                            "id": "https://agentclientprotocol.com/protocol/session-modes#plan",
                            "name": "Plan"
                        }
                    ]
                }
            }),
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
