use super::*;

#[test]
fn initialize_omits_auth_client_capability_when_authentication_is_unsupported() {
    let adapter = AcpAdapter::without_authentication();
    let engine = AngelEngine::new(angel_engine::ProtocolFlavor::Acp, adapter.capabilities());
    let options = TransportOptions {
        experimental_api: false,
        ..TransportOptions::default()
    };
    let effect = angel_engine::ProtocolEffect::new(
        angel_engine::ProtocolFlavor::Acp,
        ProtocolMethod::Initialize,
    );

    let params = adapter
        .encode_params(&engine, &effect, &options)
        .expect("initialize params");

    assert_eq!(params["clientCapabilities"], json!({}));
}

#[test]
fn initialize_advertises_experimental_elicitation_capability() {
    let adapter = AcpAdapter::without_authentication();
    let engine = AngelEngine::new(angel_engine::ProtocolFlavor::Acp, adapter.capabilities());
    let effect = angel_engine::ProtocolEffect::new(
        angel_engine::ProtocolFlavor::Acp,
        ProtocolMethod::Initialize,
    );

    let params = adapter
        .encode_params(&engine, &effect, &TransportOptions::default())
        .expect("initialize params");

    assert_eq!(
        params["clientCapabilities"]["elicitation"],
        json!({"form": {}, "url": {}})
    );
}

#[test]
fn initialize_uses_stable_acp_version_and_only_advertised_host_capabilities() {
    let adapter = AcpAdapter::standard();
    let engine = AngelEngine::new(angel_engine::ProtocolFlavor::Acp, adapter.capabilities());
    let effect = angel_engine::ProtocolEffect::new(
        angel_engine::ProtocolFlavor::Acp,
        ProtocolMethod::Initialize,
    );

    let params = adapter
        .encode_params(&engine, &effect, &TransportOptions::default())
        .expect("initialize params");

    assert_eq!(params["protocolVersion"], json!(1));
    assert!(params["clientCapabilities"].get("auth").is_some());
    assert!(params["clientCapabilities"].get("elicitation").is_some());
    assert!(params["clientCapabilities"].get("fs").is_none());
    assert!(params["clientCapabilities"].get("terminal").is_none());
}

#[test]
fn permission_selection_uses_protocol_kind_not_option_id_text() {
    let options = ElicitationOptions {
        title: None,
        body: None,
        choices: vec![
            "Looks like cancel".to_string(),
            "Looks like proceed".to_string(),
            "Always".to_string(),
        ],
        choice_details: vec![
            ElicitationChoice {
                id: "cancel".to_string(),
                label: "Looks like cancel".to_string(),
                kind: Some(ElicitationChoiceKind::AllowOnce),
            },
            ElicitationChoice {
                id: "proceed_once".to_string(),
                label: "Looks like proceed".to_string(),
                kind: Some(ElicitationChoiceKind::RejectOnce),
            },
            ElicitationChoice {
                id: "forever".to_string(),
                label: "Always".to_string(),
                kind: Some(ElicitationChoiceKind::AllowAlways),
            },
        ],
        questions: Vec::new(),
    };

    assert_eq!(
        select_permission_option(&options, "Allow").as_deref(),
        Some("cancel")
    );
    assert_eq!(
        select_permission_option(&options, "AllowForSession").as_deref(),
        Some("forever")
    );
    assert_eq!(
        select_permission_option(&options, "Deny").as_deref(),
        Some("proceed_once")
    );
}

#[test]
fn session_list_encodes_common_discovery_params() {
    let adapter = AcpAdapter::standard();
    let engine = AngelEngine::new(angel_engine::ProtocolFlavor::Acp, adapter.capabilities());
    let effect = angel_engine::ProtocolEffect::new(
        angel_engine::ProtocolFlavor::Acp,
        ProtocolMethod::ListConversations,
    )
    .field("cwd", "/tmp/project")
    .field("cursor", "opaque");

    let params = adapter
        .encode_params(&engine, &effect, &TransportOptions::default())
        .expect("session list params");

    assert_eq!(params, json!({"cwd": "/tmp/project", "cursor": "opaque"}));
}

#[test]
fn session_resume_encodes_common_remote_conversation_id() {
    let adapter = AcpAdapter::standard();
    let engine = AngelEngine::new(angel_engine::ProtocolFlavor::Acp, adapter.capabilities());
    let effect = angel_engine::ProtocolEffect::new(
        angel_engine::ProtocolFlavor::Acp,
        ProtocolMethod::ResumeConversation,
    )
    .field("remoteConversationId", "sess")
    .field("cwd", "/tmp/project");

    let params = adapter
        .encode_params(&engine, &effect, &TransportOptions::default())
        .expect("session resume params");

    assert_eq!(
        params,
        json!({"sessionId": "sess", "cwd": "/tmp/project", "mcpServers": []})
    );
}

#[test]
fn session_load_uses_conversation_cwd_when_effect_omits_it() {
    let adapter = AcpAdapter::standard();
    let mut engine = AngelEngine::new(angel_engine::ProtocolFlavor::Acp, adapter.capabilities());
    let conversation_id = ConversationId::new("conv");
    engine
        .apply_event(EngineEvent::ConversationProvisionStarted {
            id: conversation_id.clone(),
            remote: RemoteConversationId::Known("sess".to_string()),
            op: angel_engine::ProvisionOp::Load,
            capabilities: adapter.capabilities(),
        })
        .expect("conversation provision");
    engine
        .apply_event(EngineEvent::ContextUpdated {
            conversation_id: conversation_id.clone(),
            patch: ContextPatch::one(angel_engine::ContextUpdate::Cwd {
                scope: angel_engine::ContextScope::Conversation,
                cwd: Some("/tmp/from-context".to_string()),
            }),
        })
        .expect("context update");
    let effect = angel_engine::ProtocolEffect::new(
        angel_engine::ProtocolFlavor::Acp,
        ProtocolMethod::ResumeConversation,
    )
    .conversation_id(conversation_id)
    .field("sessionId", "sess");

    let params = adapter
        .encode_params(&engine, &effect, &TransportOptions::default())
        .expect("session load params");

    assert_eq!(
        params,
        json!({"sessionId": "sess", "cwd": "/tmp/from-context", "mcpServers": []})
    );
}

#[test]
fn session_prompt_encodes_structured_content_blocks() {
    let adapter = AcpAdapter::standard();
    let mut engine = AngelEngine::with_available_runtime(
        angel_engine::ProtocolFlavor::Acp,
        angel_engine::RuntimeCapabilities::new("test"),
        adapter.capabilities(),
    );
    let conversation_id = ConversationId::new("conv");
    engine
        .apply_event(EngineEvent::ConversationProvisionStarted {
            id: conversation_id.clone(),
            remote: RemoteConversationId::Known("sess".to_string()),
            op: angel_engine::ProvisionOp::New,
            capabilities: adapter.capabilities(),
        })
        .expect("conversation provision");
    engine
        .apply_event(EngineEvent::ConversationReady {
            id: conversation_id.clone(),
            remote: Some(RemoteConversationId::Known("sess".to_string())),
            context: ContextPatch::empty(),
            capabilities: None,
        })
        .expect("conversation ready");
    let plan = engine
        .plan_command(angel_engine::EngineCommand::StartTurn {
            conversation_id,
            input: vec![
                angel_engine::UserInput::text("summarize this"),
                angel_engine::UserInput::resource_link("README", "file:///repo/README.md"),
                angel_engine::UserInput::file_mention(
                    "Project Notes.pdf",
                    "/repo/Project Notes.pdf",
                    Some("application/pdf".to_string()),
                ),
                angel_engine::UserInput::embedded_text_resource(
                    "file:///repo/context.txt",
                    "important context",
                    Some("text/plain".to_string()),
                ),
                angel_engine::UserInput::embedded_blob_resource(
                    "attachment://archive.zip",
                    "UEsDBAo=",
                    Some("application/zip".to_string()),
                    Some("archive.zip".to_string()),
                ),
                angel_engine::UserInput::image(
                    "ZmFrZQ==",
                    "image/png",
                    Some("shot.png".to_string()),
                ),
            ],
            overrides: angel_engine::TurnOverrides::default(),
        })
        .expect("start turn");

    let params = adapter
        .encode_params(&engine, &plan.effects[0], &TransportOptions::default())
        .expect("prompt params");

    assert_eq!(params["sessionId"], json!("sess"));
    assert_eq!(
        params["prompt"][0],
        json!({"type": "text", "text": "summarize this"})
    );
    assert_eq!(
        params["prompt"][1],
        json!({
            "type": "resource_link",
            "name": "README",
            "uri": "file:///repo/README.md"
        })
    );
    assert_eq!(
        params["prompt"][2],
        json!({
            "type": "resource_link",
            "name": "Project Notes.pdf",
            "uri": "file:///repo/Project%20Notes.pdf",
            "mimeType": "application/pdf"
        })
    );
    assert_eq!(
        params["prompt"][3],
        json!({
            "type": "resource",
            "resource": {
                "uri": "file:///repo/context.txt",
                "text": "important context",
                "mimeType": "text/plain"
            }
        })
    );
    assert_eq!(
        params["prompt"][4],
        json!({
            "type": "resource",
            "resource": {
                "uri": "attachment://archive.zip",
                "blob": "UEsDBAo=",
                "mimeType": "application/zip"
            }
        })
    );
    assert_eq!(
        params["prompt"][5],
        json!({
            "type": "image",
            "data": "ZmFrZQ==",
            "mimeType": "image/png"
        })
    );
}

#[test]
fn session_prompt_encodes_skill_mention_as_text() {
    let adapter = AcpAdapter::standard();
    let mut engine = AngelEngine::with_available_runtime(
        angel_engine::ProtocolFlavor::Acp,
        angel_engine::RuntimeCapabilities::new("test"),
        adapter.capabilities(),
    );
    let conversation_id = ConversationId::new("conv");
    engine
        .apply_event(EngineEvent::ConversationProvisionStarted {
            id: conversation_id.clone(),
            remote: RemoteConversationId::Known("sess".to_string()),
            op: angel_engine::ProvisionOp::New,
            capabilities: adapter.capabilities(),
        })
        .expect("conversation provision");
    engine
        .apply_event(EngineEvent::ConversationReady {
            id: conversation_id.clone(),
            remote: Some(RemoteConversationId::Known("sess".to_string())),
            context: ContextPatch::empty(),
            capabilities: None,
        })
        .expect("conversation ready");
    let plan = engine
        .plan_command(angel_engine::EngineCommand::StartTurn {
            conversation_id,
            input: vec![
                angel_engine::UserInput::skill_mention(
                    "skill-authoring",
                    "/home/user/.agents/skills/skill-authoring/SKILL.md",
                ),
                angel_engine::UserInput::text("use this skill"),
            ],
            overrides: angel_engine::TurnOverrides::default(),
        })
        .expect("start turn with skill mention");

    let params = adapter
        .encode_params(&engine, &plan.effects[0], &TransportOptions::default())
        .expect("prompt params");

    assert_eq!(
        params["prompt"][0],
        json!({"type": "text", "text": "$skill-authoring"})
    );
    assert_eq!(
        params["prompt"][1],
        json!({"type": "text", "text": "use this skill"})
    );
}

#[test]
fn file_mentions_encode_windows_paths_as_file_uris() {
    let adapter = AcpAdapter::standard();
    let mut engine = AngelEngine::with_available_runtime(
        angel_engine::ProtocolFlavor::Acp,
        angel_engine::RuntimeCapabilities::new("test"),
        adapter.capabilities(),
    );
    let conversation_id = ConversationId::new("conv");
    engine
        .apply_event(EngineEvent::ConversationProvisionStarted {
            id: conversation_id.clone(),
            remote: RemoteConversationId::Known("sess".to_string()),
            op: angel_engine::ProvisionOp::New,
            capabilities: adapter.capabilities(),
        })
        .expect("conversation provision");
    engine
        .apply_event(EngineEvent::ConversationReady {
            id: conversation_id.clone(),
            remote: Some(RemoteConversationId::Known("sess".to_string())),
            context: ContextPatch::empty(),
            capabilities: None,
        })
        .expect("conversation ready");
    let plan = engine
        .plan_command(angel_engine::EngineCommand::StartTurn {
            conversation_id,
            input: vec![angel_engine::UserInput::file_mention(
                "Notes.md",
                r"C:\Users\Ada Lovelace\Notes.md",
                Some("text/markdown".to_string()),
            )],
            overrides: angel_engine::TurnOverrides::default(),
        })
        .expect("start turn");

    let params = adapter
        .encode_params(&engine, &plan.effects[0], &TransportOptions::default())
        .expect("prompt params");

    assert_eq!(
        params["prompt"][0]["uri"],
        json!("file:///C:/Users/Ada%20Lovelace/Notes.md")
    );
}
