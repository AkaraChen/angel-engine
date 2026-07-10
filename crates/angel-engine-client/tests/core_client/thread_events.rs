use angel_engine_client::{ClientError, ClientEvent, ThreadEvent};
use serde_json::json;

use super::helpers::{ready_client, ready_codex_client, response};

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
    let open = client
        .thread(&conversation_id)
        .open_elicitations()
        .expect("open elicitations");
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
            .expect("open elicitations")
            .is_empty()
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
