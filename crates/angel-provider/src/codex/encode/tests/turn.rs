use super::super::*;

#[test]
fn turn_start_collaboration_mode_uses_current_model_state() {
    let adapter = CodexAdapter::app_server();
    let mut engine = AngelEngine::with_available_runtime(
        angel_engine::ProtocolFlavor::CodexAppServer,
        angel_engine::RuntimeCapabilities::new("test"),
        adapter.capabilities(),
    );
    let conversation_id = ConversationId::new("conv");
    engine
        .apply_event(EngineEvent::ConversationProvisionStarted {
            id: conversation_id.clone(),
            remote: RemoteConversationId::Known("thread".to_string()),
            op: angel_engine::ProvisionOp::New,
            capabilities: adapter.capabilities(),
        })
        .expect("conversation provision");
    engine
        .apply_event(EngineEvent::ConversationReady {
            id: conversation_id.clone(),
            remote: Some(RemoteConversationId::Known("thread".to_string())),
            context: ContextPatch::empty(),
            capabilities: None,
        })
        .expect("conversation ready");
    engine
        .apply_event(EngineEvent::SessionModelsUpdated {
            conversation_id: conversation_id.clone(),
            models: SessionModelState {
                current_model_id: "gpt-5.5".to_string(),
                available_models: vec![SessionModel {
                    id: "gpt-5.5".to_string(),
                    name: "GPT-5.5".to_string(),
                    description: None,
                }],
            },
        })
        .expect("model state");
    engine
        .plan_command(angel_engine::EngineCommand::UpdateContext {
            conversation_id: conversation_id.clone(),
            patch: ContextPatch::one(angel_engine::ContextUpdate::Mode {
                scope: angel_engine::ContextScope::TurnAndFuture,
                mode: Some(angel_engine::AgentMode {
                    id: "plan".to_string(),
                }),
            }),
        })
        .expect("set mode");

    let plan = engine
        .plan_command(angel_engine::EngineCommand::StartTurn {
            conversation_id,
            input: vec![angel_engine::UserInput::text("make a plan")],
            overrides: angel_engine::TurnOverrides::default(),
        })
        .expect("start turn");
    let params = adapter
        .encode_params(&engine, &plan.effects[0], &TransportOptions::default())
        .expect("turn start params");

    assert_eq!(params["collaborationMode"]["mode"], json!("plan"));
    assert_eq!(
        params["collaborationMode"]["settings"]["model"],
        json!("gpt-5.5")
    );
}

#[test]
fn turn_start_keeps_collaboration_mode_and_permission_mode_independent() {
    let adapter = CodexAdapter::app_server();
    let mut engine = AngelEngine::with_available_runtime(
        angel_engine::ProtocolFlavor::CodexAppServer,
        angel_engine::RuntimeCapabilities::new("test"),
        adapter.capabilities(),
    );
    let conversation_id = ConversationId::new("conv");
    engine
        .apply_event(EngineEvent::ConversationProvisionStarted {
            id: conversation_id.clone(),
            remote: RemoteConversationId::Known("thread".to_string()),
            op: angel_engine::ProvisionOp::New,
            capabilities: adapter.capabilities(),
        })
        .expect("conversation provision");
    engine
        .apply_event(EngineEvent::ConversationReady {
            id: conversation_id.clone(),
            remote: Some(RemoteConversationId::Known("thread".to_string())),
            context: ContextPatch::empty(),
            capabilities: None,
        })
        .expect("conversation ready");
    engine
        .apply_event(EngineEvent::SessionModelsUpdated {
            conversation_id: conversation_id.clone(),
            models: SessionModelState {
                current_model_id: "gpt-5.5".to_string(),
                available_models: vec![SessionModel {
                    id: "gpt-5.5".to_string(),
                    name: "GPT-5.5".to_string(),
                    description: None,
                }],
            },
        })
        .expect("model state");
    engine
        .apply_event(EngineEvent::SessionModesUpdated {
            conversation_id: conversation_id.clone(),
            modes: SessionModeState {
                current_mode_id: "default".to_string(),
                available_modes: vec![
                    SessionMode {
                        id: "default".to_string(),
                        name: "Default".to_string(),
                        description: None,
                    },
                    SessionMode {
                        id: "plan".to_string(),
                        name: "Plan".to_string(),
                        description: None,
                    },
                ],
            },
        })
        .expect("mode state");
    engine
        .apply_event(EngineEvent::SessionPermissionModesUpdated {
            conversation_id: conversation_id.clone(),
            modes: SessionPermissionModeState {
                current_mode_id: "on-request".to_string(),
                available_modes: CodexPermissionMode::ALL
                    .into_iter()
                    .map(|mode| SessionPermissionMode {
                        id: mode.id().to_string(),
                        name: mode.name().to_string(),
                        description: mode.description().map(str::to_string),
                    })
                    .collect(),
            },
        })
        .expect("permission mode state");
    engine
        .set_mode(conversation_id.clone(), "plan")
        .expect("set mode");
    engine
        .set_permission_mode(conversation_id.clone(), "never")
        .expect("set permission mode");

    let plan = engine
        .plan_command(angel_engine::EngineCommand::StartTurn {
            conversation_id,
            input: vec![angel_engine::UserInput::text("make a plan")],
            overrides: angel_engine::TurnOverrides::default(),
        })
        .expect("start turn");
    let params = adapter
        .encode_params(&engine, &plan.effects[0], &TransportOptions::default())
        .expect("turn start params");

    assert_eq!(params["collaborationMode"]["mode"], json!("plan"));
    assert_eq!(params["approvalPolicy"], json!("never"));
}

#[test]
fn turn_start_uses_context_service_tier() {
    let adapter = CodexAdapter::app_server();
    let mut engine = AngelEngine::with_available_runtime(
        angel_engine::ProtocolFlavor::CodexAppServer,
        angel_engine::RuntimeCapabilities::new("test"),
        adapter.capabilities(),
    );
    let conversation_id = ConversationId::new("conv");
    engine
        .apply_event(EngineEvent::ConversationProvisionStarted {
            id: conversation_id.clone(),
            remote: RemoteConversationId::Known("thread".to_string()),
            op: angel_engine::ProvisionOp::New,
            capabilities: adapter.capabilities(),
        })
        .expect("conversation provision");
    engine
        .apply_event(EngineEvent::ConversationReady {
            id: conversation_id.clone(),
            remote: Some(RemoteConversationId::Known("thread".to_string())),
            context: ContextPatch::empty(),
            capabilities: None,
        })
        .expect("conversation ready");
    engine
        .apply_event(EngineEvent::ContextUpdated {
            conversation_id: conversation_id.clone(),
            patch: ContextPatch::one(angel_engine::ContextUpdate::Raw {
                scope: angel_engine::ContextScope::TurnAndFuture,
                key: SERVICE_TIER_CONTEXT_KEY.to_string(),
                value: crate::codex::commands::SERVICE_TIER_FAST.to_string(),
            }),
        })
        .expect("service tier context");

    let plan = engine
        .plan_command(angel_engine::EngineCommand::StartTurn {
            conversation_id,
            input: vec![angel_engine::UserInput::text("hello")],
            overrides: angel_engine::TurnOverrides::default(),
        })
        .expect("start turn");
    let params = adapter
        .encode_params(&engine, &plan.effects[0], &TransportOptions::default())
        .expect("turn start params");

    assert_eq!(params["serviceTier"], json!("priority"));
}

#[test]
fn turn_start_encodes_structured_user_input_as_codex_dto() {
    let adapter = CodexAdapter::app_server();
    let mut engine = AngelEngine::with_available_runtime(
        angel_engine::ProtocolFlavor::CodexAppServer,
        angel_engine::RuntimeCapabilities::new("test"),
        adapter.capabilities(),
    );
    let conversation_id = ConversationId::new("conv");
    engine
        .apply_event(EngineEvent::ConversationProvisionStarted {
            id: conversation_id.clone(),
            remote: RemoteConversationId::Known("thread".to_string()),
            op: angel_engine::ProvisionOp::New,
            capabilities: adapter.capabilities(),
        })
        .expect("conversation provision");
    engine
        .apply_event(EngineEvent::ConversationReady {
            id: conversation_id.clone(),
            remote: Some(RemoteConversationId::Known("thread".to_string())),
            context: ContextPatch::empty(),
            capabilities: None,
        })
        .expect("conversation ready");
    let plan = engine
        .plan_command(angel_engine::EngineCommand::StartTurn {
            conversation_id,
            input: vec![
                angel_engine::UserInput::text("describe this"),
                angel_engine::UserInput::image(
                    "ZmFrZQ==",
                    "image/png",
                    Some("shot.png".to_string()),
                ),
                angel_engine::UserInput::resource_link(
                    "Project Notes.pdf",
                    "file:///repo/Project%20Notes.pdf",
                ),
                angel_engine::UserInput::file_mention(
                    "src/lib.rs",
                    "/repo/src/lib.rs",
                    Some("text/x-rust".to_string()),
                ),
                angel_engine::UserInput {
                    content: "file:///repo/shot.png".to_string(),
                    kind: angel_engine::UserInputKind::ResourceLink {
                        name: "shot.png".to_string(),
                        uri: "file:///repo/shot.png".to_string(),
                        mime_type: Some("image/png".to_string()),
                        title: None,
                        description: None,
                    },
                },
                angel_engine::UserInput::embedded_text_resource(
                    "attachment://notes.txt",
                    "hello from a file",
                    Some("text/plain".to_string()),
                ),
                angel_engine::UserInput::embedded_blob_resource(
                    "attachment://archive.zip",
                    "UEsDBAo=",
                    Some("application/zip".to_string()),
                    Some("archive.zip".to_string()),
                ),
            ],
            overrides: angel_engine::TurnOverrides::default(),
        })
        .expect("start turn");

    let params = adapter
        .encode_params(&engine, &plan.effects[0], &TransportOptions::default())
        .expect("turn start params");

    assert_eq!(params["threadId"], json!("thread"));
    assert_eq!(
        params["input"],
        json!([
            {
                "type": "text",
                "text": "\n# Files mentioned by the user:\n\n## Project Notes.pdf: /repo/Project Notes.pdf\n\n## My request for Codex:\ndescribe this\n",
                "text_elements": []
            },
            {"type": "image", "url": "data:image/png;base64,ZmFrZQ=="},
            {"type": "mention", "name": "src/lib.rs", "path": "/repo/src/lib.rs"},
            {"type": "localImage", "path": "/repo/shot.png"},
            {
                "type": "text",
                "text": "Attached text resource: attachment://notes.txt\nMIME type: text/plain\n\nhello from a file",
                "text_elements": []
            },
            {
                "type": "text",
                "text": "Attached file: archive.zip\nURI: attachment://archive.zip\nMIME type: application/zip\nEncoding: base64\n\nUEsDBAo=",
                "text_elements": []
            }
        ])
    );
}

#[test]
fn turn_start_encodes_skill_mention_as_codex_skill_input() {
    let adapter = CodexAdapter::app_server();
    let mut engine = AngelEngine::with_available_runtime(
        angel_engine::ProtocolFlavor::CodexAppServer,
        angel_engine::RuntimeCapabilities::new("test"),
        adapter.capabilities(),
    );
    let conversation_id = ConversationId::new("conv");
    engine
        .apply_event(EngineEvent::ConversationProvisionStarted {
            id: conversation_id.clone(),
            remote: RemoteConversationId::Known("thread".to_string()),
            op: angel_engine::ProvisionOp::New,
            capabilities: adapter.capabilities(),
        })
        .expect("conversation provision");
    engine
        .apply_event(EngineEvent::ConversationReady {
            id: conversation_id.clone(),
            remote: Some(RemoteConversationId::Known("thread".to_string())),
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
        .expect("start turn");

    let params = adapter
        .encode_params(&engine, &plan.effects[0], &TransportOptions::default())
        .expect("turn start params");

    assert_eq!(
        params["input"],
        json!([
            {
                "type": "skill",
                "name": "skill-authoring",
                "path": "/home/user/.agents/skills/skill-authoring/SKILL.md"
            },
            {
                "type": "text",
                "text": "use this skill",
                "text_elements": []
            }
        ])
    );
}
