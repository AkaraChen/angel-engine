use angel_engine_client::{ClientEvent, ClientOptions, ResumeConversationRequest, ThreadEvent};
use serde_json::json;

use super::helpers::{ready_codex_client, response};

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
