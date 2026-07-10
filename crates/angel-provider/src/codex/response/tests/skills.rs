use super::super::*;

#[test]
fn skills_list_response_populates_session_skills_updated() {
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

    let request_id = engine
        .plan_command(angel_engine::EngineCommand::Extension(
            angel_engine::EngineExtensionCommand::RefreshSkills {
                conversation_id: conversation_id.clone(),
                force_reload: true,
            },
        ))
        .expect("refresh skills plan")
        .request_id
        .expect("request id");

    let output = adapter
        .decode_response(
            &engine,
            &request_id,
            &json!({
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
                            },
                            {
                                "name": "eric-backend",
                                "description": "Backend standards",
                                "path": "/repo/.codex/skills/eric-backend/SKILL.md",
                                "scope": "repo",
                                "enabled": false
                            }
                        ],
                        "errors": []
                    }
                ]
            }),
        )
        .expect("skills list response");

    let skills = output
        .events
        .iter()
        .find_map(|event| match event {
            EngineEvent::SessionSkillsUpdated { skills, .. } => Some(skills),
            _ => None,
        })
        .expect("skills updated event");

    assert_eq!(skills.len(), 2);
    assert_eq!(skills[0].name, "skill-authoring");
    assert_eq!(skills[0].scope, angel_engine::state::SkillScope::User);
    assert!(skills[0].enabled);
    assert_eq!(skills[1].name, "eric-backend");
    assert_eq!(skills[1].scope, angel_engine::state::SkillScope::Repo);
    assert!(!skills[1].enabled);
}

#[test]
fn skills_list_response_rejects_unknown_scope() {
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
    let request_id = engine
        .plan_command(angel_engine::EngineCommand::Extension(
            angel_engine::EngineExtensionCommand::RefreshSkills {
                conversation_id,
                force_reload: false,
            },
        ))
        .expect("refresh skills plan")
        .request_id
        .expect("request id");

    let result = adapter.decode_response(
        &engine,
        &request_id,
        &json!({
            "data": [
                {
                    "cwd": "/repo",
                    "skills": [
                        {
                            "name": "mystery",
                            "description": "unknown scope",
                            "path": "/mystery/SKILL.md",
                            "scope": "plugin",
                            "enabled": true
                        }
                    ],
                    "errors": []
                }
            ]
        }),
    );

    assert!(result.is_err());
}

#[test]
fn skill_content_part_hydrates_as_marker_text() {
    let adapter = CodexAdapter::app_server();
    let mut engine = AngelEngine::with_available_runtime(
        angel_engine::ProtocolFlavor::CodexAppServer,
        angel_engine::RuntimeCapabilities::new("test"),
        adapter.capabilities(),
    );
    let request_id = engine
        .plan_command(angel_engine::EngineCommand::ResumeConversation {
            target: angel_engine::ResumeTarget::Remote {
                id: "thread_1".to_string(),
                hydrate: true,
                cwd: None,
            },
        })
        .expect("resume plan")
        .request_id
        .expect("request id");

    let output = adapter
        .decode_response(
            &engine,
            &request_id,
            &json!({
                "thread": {
                    "id": "thread_1",
                    "turns": [
                        {
                            "items": [
                                {
                                    "type": "userMessage",
                                    "content": [
                                        {
                                            "type": "skill",
                                            "name": "skill-authoring",
                                            "path": "/home/user/.agents/skills/skill-authoring/SKILL.md"
                                        },
                                        { "type": "text", "text": "use this skill" }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            }),
        )
        .expect("thread resume response");

    let entry = output
        .events
        .iter()
        .find_map(|event| match event {
            EngineEvent::HistoryReplayChunk { entry, .. } => Some(entry),
            _ => None,
        })
        .expect("history replay entry");

    assert_eq!(entry.role, HistoryRole::User);
    assert_eq!(
        entry.content,
        ContentDelta::Text("$skill-authoring ".to_string() + "use this skill")
    );
}

#[test]
fn skills_list_response_rejects_missing_required_fields() {
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
    let request_id = engine
        .plan_command(angel_engine::EngineCommand::Extension(
            angel_engine::EngineExtensionCommand::RefreshSkills {
                conversation_id,
                force_reload: false,
            },
        ))
        .expect("refresh skills plan")
        .request_id
        .expect("request id");

    let result = adapter.decode_response(
        &engine,
        &request_id,
        &json!({
            "data": [
                {
                    "cwd": "/repo",
                    "skills": [
                        {
                            "name": "skill-authoring",
                            "path": "/home/user/.agents/skills/skill-authoring/SKILL.md",
                            "scope": "user"
                        }
                    ],
                    "errors": []
                }
            ]
        }),
    );

    assert!(result.is_err());
}
