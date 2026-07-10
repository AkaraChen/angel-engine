use super::*;

#[test]
fn settings_api_reports_reasoning_models_and_modes() {
    let capabilities = acp_capabilities();
    let mut engine = engine_with(ProtocolFlavor::Acp, capabilities.clone());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        capabilities.clone(),
    );
    engine
        .apply_event(EngineEvent::SessionConfigOptionsUpdated {
            conversation_id: conversation_id.clone(),
            options: vec![SessionConfigOption {
                id: "thought_level".to_string(),
                name: "Reasoning".to_string(),
                description: None,
                category: Some("reasoning".to_string()),
                current_value: "medium".to_string(),
                values: vec![
                    SessionConfigValue {
                        value: "low".to_string(),
                        name: "Low".to_string(),
                        description: None,
                    },
                    SessionConfigValue {
                        value: "medium".to_string(),
                        name: "Medium".to_string(),
                        description: None,
                    },
                ],
            }],
        })
        .expect("config options");
    engine
        .apply_event(EngineEvent::SessionModelsUpdated {
            conversation_id: conversation_id.clone(),
            models: SessionModelState {
                current_model_id: "model-a".to_string(),
                available_models: vec![
                    SessionModel {
                        id: "model-a".to_string(),
                        name: "Model A".to_string(),
                        description: None,
                    },
                    SessionModel {
                        id: "model-b".to_string(),
                        name: "Model B".to_string(),
                        description: None,
                    },
                ],
            },
        })
        .expect("models");
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
        .expect("modes");

    let settings = engine
        .conversation_settings(conversation_id.clone())
        .expect("settings");
    assert_eq!(settings.reasoning.current_level.as_deref(), Some("medium"));
    assert_eq!(settings.reasoning.available_levels, vec!["low", "medium"]);
    assert_eq!(settings.reasoning.available_options[0].name, "Low");
    assert_eq!(settings.reasoning.available_options[1].value, "medium");
    assert_eq!(
        settings.model_list.current_model_id.as_deref(),
        Some("model-a")
    );
    assert_eq!(settings.model_list.available_models[0].id, "model-a");
    assert_eq!(
        settings.available_modes.current_mode_id.as_deref(),
        Some("default")
    );
    assert_eq!(settings.available_modes.available_modes[1].id, "plan");

    let plan = engine
        .set_reasoning_level(conversation_id.clone(), "low")
        .expect("set reasoning");
    assert!(matches!(
        &plan.effects[0].method,
        ProtocolMethod::UpdateContext
    ));
    assert_eq!(
        plan.effects[0].payload.fields.get("reasoningEffort"),
        Some(&"low".to_string())
    );

    let plan = engine
        .set_model(conversation_id.clone(), "model-b")
        .expect("set model");
    assert!(matches!(
        &plan.effects[0].method,
        ProtocolMethod::UpdateContext
    ));

    let plan = engine
        .set_model(conversation_id, "model-b")
        .expect("set current model");
    assert!(plan.effects.is_empty());
}

#[test]
fn set_mode_materializes_context_mode() {
    let capabilities = codex_capabilities();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, capabilities.clone());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        capabilities.clone(),
    );

    let settings = engine
        .conversation_settings(conversation_id.clone())
        .expect("settings");
    assert_eq!(settings.available_modes.current_mode_id.as_deref(), None);
    assert_eq!(
        engine
            .conversations
            .get(&conversation_id)
            .unwrap()
            .context
            .mode
            .effective(),
        None
    );

    let plan = engine
        .set_mode(conversation_id.clone(), "default")
        .expect("set mode");
    assert!(matches!(
        &plan.effects[0].method,
        ProtocolMethod::UpdateContext
    ));

    let conversation = engine.conversations.get(&conversation_id).unwrap();
    assert_eq!(
        conversation
            .context
            .mode
            .effective()
            .and_then(Option::as_ref)
            .map(|mode| mode.id.as_str()),
        Some("default")
    );
}

#[test]
fn set_permission_mode_materializes_context_permission_mode() {
    let capabilities = acp_capabilities();
    let mut engine = engine_with(ProtocolFlavor::Acp, capabilities.clone());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        capabilities.clone(),
    );
    engine
        .apply_event(EngineEvent::SessionPermissionModesUpdated {
            conversation_id: conversation_id.clone(),
            modes: SessionPermissionModeState {
                current_mode_id: "default".to_string(),
                available_modes: vec![
                    SessionPermissionMode {
                        id: "default".to_string(),
                        name: "Default".to_string(),
                        description: None,
                    },
                    SessionPermissionMode {
                        id: "plan".to_string(),
                        name: "Plan".to_string(),
                        description: None,
                    },
                ],
            },
        })
        .expect("permission modes");

    let settings = engine
        .conversation_settings(conversation_id.clone())
        .expect("settings");
    assert_eq!(
        settings.permission_modes.current_mode_id.as_deref(),
        Some("default")
    );
    assert_eq!(settings.permission_modes.available_modes[1].id, "plan");

    let plan = engine
        .set_permission_mode(conversation_id.clone(), "plan")
        .expect("set permission mode");
    assert!(matches!(
        &plan.effects[0].method,
        ProtocolMethod::UpdateContext
    ));
    assert_eq!(
        plan.effects[0].payload.fields.get("contextUpdate"),
        Some(&"permissionMode".to_string())
    );
    assert_eq!(
        plan.effects[0].payload.fields.get("permissionMode"),
        Some(&"plan".to_string())
    );

    let conversation = engine.conversations.get(&conversation_id).unwrap();
    assert_eq!(
        conversation
            .context
            .permission_mode
            .effective()
            .and_then(Option::as_ref)
            .map(|mode| mode.id.as_str()),
        Some("plan")
    );
}
