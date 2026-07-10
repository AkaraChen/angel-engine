use angel_engine_client::{
    ClientBuilder, ClientError, ClientEvent, ClientOptions, ElicitationResponse, RuntimeSnapshot,
    StartConversationRequest, ThreadEvent,
};
use serde_json::json;

use super::helpers::{ready_client, response};

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
