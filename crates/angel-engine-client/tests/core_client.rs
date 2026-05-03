use angel_engine_client::{
    Client, ClientBuilder, ClientEvent, ClientOptions, RuntimeSnapshot, StartConversationRequest,
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
                }
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
fn thread_set_model_event_updates_snapshot_after_runtime_ack() {
    let (mut client, conversation_id) = ready_client();

    let update = client
        .thread(&conversation_id)
        .send_event(ThreadEvent::set_model("moonshot-v1-128k"))
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
