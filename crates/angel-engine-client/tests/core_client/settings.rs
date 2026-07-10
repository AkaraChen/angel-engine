use angel_engine_client::{ClientOptions, StartConversationRequest, ThreadEvent};
use serde_json::json;

use super::helpers::{ready_client, ready_codex_client, ready_uri_mode_client, response};

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
        vec!["none", "low", "medium", "high", "xhigh"]
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
fn codex_refresh_skills_populates_conversation_snapshot() {
    let (mut client, conversation_id) = ready_codex_client();

    let refresh = client
        .thread(&conversation_id)
        .send_event(ThreadEvent::refresh_skills(true))
        .expect("refresh skills");
    assert_eq!(
        refresh.update.outgoing[0].value["method"],
        json!("skills/list")
    );
    assert_eq!(
        refresh.update.outgoing[0].value["params"]["forceReload"],
        json!(true)
    );

    client
        .receive_json_value(response(
            &refresh.request_id.expect("refresh skills request id"),
            json!({
                "data": [
                    {
                        "cwd": "/repo",
                        "skills": [
                            {
                                "name": "skill-authoring",
                                "description": "Create and validate skills",
                                "path": "/home/user/.agents/skills/skill-authoring/SKILL.md",
                                "scope": "user",
                                "enabled": true
                            }
                        ],
                        "errors": []
                    }
                ]
            }),
        ))
        .expect("skills list response");

    let snapshot = client
        .thread(&conversation_id)
        .require_state()
        .expect("conversation state");
    assert!(snapshot.skills.can_list);
    assert!(snapshot.skills.can_mention);
    assert_eq!(snapshot.skills.skills.len(), 1);
    assert_eq!(snapshot.skills.skills[0].name, "skill-authoring");
    assert!(snapshot.skills.skills[0].enabled);
}
