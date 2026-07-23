use angel_engine_client::{ClientEvent, ClientStreamDelta, ThreadEvent};
use serde_json::json;

use super::helpers::{ready_client, ready_codex_client, response};

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
fn acp_prompt_error_is_preserved_in_turn_snapshot() {
    let (mut client, conversation_id) = ready_client();

    let turn = client
        .thread(&conversation_id)
        .send_event(ThreadEvent::text("explain the current file"))
        .expect("send text");
    let turn_id = turn.turn_id.expect("turn id");
    let request_id = turn.request_id.expect("turn request id");

    client
        .receive_json_value(json!({
            "jsonrpc": "2.0",
            "id": request_id,
            "error": {
                "code": 403,
                "message": "usage limit reached"
            }
        }))
        .expect("turn error response");

    let snapshot = client
        .thread(&conversation_id)
        .turn(&turn_id)
        .expect("turn snapshot");
    assert_eq!(
        snapshot.error,
        Some(angel_engine_client::ErrorSnapshot {
            code: "acp.rpc.403".to_string(),
            message: "usage limit reached".to_string(),
            recoverable: false,
        })
    );
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
fn codex_plan_text_allows_an_empty_todo_update() {
    let (mut client, conversation_id) = ready_codex_client();

    let sent = client
        .thread(&conversation_id)
        .send_event(ThreadEvent::text("make a plan"))
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

    client
        .receive_json_value(json!({
            "jsonrpc": "2.0",
            "method": "item/plan/delta",
            "params": {
                "threadId": "thread-1",
                "turnId": "turn-1",
                "itemId": "plan-1",
                "delta": "# Plan\nInspect the implementation."
            }
        }))
        .expect("plan text");

    let update = client
        .receive_json_value(json!({
            "jsonrpc": "2.0",
            "method": "turn/plan/updated",
            "params": {
                "threadId": "thread-1",
                "turnId": "turn-1",
                "plan": []
            }
        }))
        .expect("empty todo update");

    assert!(update.events.iter().any(|event| {
        matches!(
            event,
            ClientEvent::PlanUpdated { conversation_id: id, turn_id: tid, plan }
                if id == &conversation_id
                    && tid == &turn_id
                    && plan.kind == "todo"
                    && plan.entries.is_empty()
                    && plan.text.is_empty()
        )
    }));

    let snapshot = client
        .thread(&conversation_id)
        .turn(&turn_id)
        .expect("turn snapshot");
    assert_eq!(snapshot.plan_text, "# Plan\nInspect the implementation.");
    assert!(snapshot.todo.is_empty());
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
