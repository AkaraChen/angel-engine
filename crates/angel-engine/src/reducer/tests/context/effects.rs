use super::*;

#[test]
fn acp_context_update_uses_advertised_model_config_option() {
    let capabilities = acp_capabilities();
    let mut engine = engine_with(ProtocolFlavor::Acp, capabilities.clone());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        capabilities.clone(),
    );
    engine
        .conversations
        .get_mut(&conversation_id)
        .unwrap()
        .config_options
        .push(SessionConfigOption {
            id: "model".to_string(),
            name: "Model".to_string(),
            description: None,
            category: Some("model".to_string()),
            current_value: "old".to_string(),
            values: Vec::new(),
        });

    let plan = engine
        .plan_command(EngineCommand::UpdateContext {
            conversation_id,
            patch: ContextPatch::one(ContextUpdate::Model {
                scope: ContextScope::TurnAndFuture,
                model: Some("gpt-5.5".to_string()),
            }),
        })
        .expect("model update");

    assert!(matches!(
        &plan.effects[0].method,
        ProtocolMethod::UpdateContext
    ));
    assert_eq!(
        plan.effects[0].payload.fields.get("contextUpdate"),
        Some(&"model".to_string())
    );
    assert_eq!(
        plan.effects[0].payload.fields.get("model"),
        Some(&"gpt-5.5".to_string())
    );
    let conversation_id = plan.conversation_id.as_ref().unwrap();
    let conversation = engine.conversations.get(conversation_id).unwrap();
    assert_eq!(
        conversation.context.model.effective(),
        Some(&Some("gpt-5.5".to_string()))
    );
}

#[test]
fn acp_context_update_uses_advertised_effort_config_option() {
    let capabilities = acp_capabilities();
    let mut engine = engine_with(ProtocolFlavor::Acp, capabilities.clone());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        capabilities.clone(),
    );
    engine
        .conversations
        .get_mut(&conversation_id)
        .unwrap()
        .config_options
        .push(SessionConfigOption {
            id: "thought_level".to_string(),
            name: "Thought level".to_string(),
            description: None,
            category: Some("reasoning".to_string()),
            current_value: "medium".to_string(),
            values: Vec::new(),
        });

    let plan = engine
        .plan_command(EngineCommand::UpdateContext {
            conversation_id,
            patch: ContextPatch::one(ContextUpdate::Reasoning {
                scope: ContextScope::TurnAndFuture,
                reasoning: Some(ReasoningProfile {
                    effort: Some("high".to_string()),
                }),
            }),
        })
        .expect("effort update");

    assert!(matches!(
        &plan.effects[0].method,
        ProtocolMethod::UpdateContext
    ));
    assert_eq!(
        plan.effects[0].payload.fields.get("contextUpdate"),
        Some(&"reasoning".to_string())
    );
    assert_eq!(
        plan.effects[0].payload.fields.get("reasoningEffort"),
        Some(&"high".to_string())
    );
    let conversation_id = plan.conversation_id.as_ref().unwrap();
    let conversation = engine.conversations.get(conversation_id).unwrap();
    assert_eq!(
        conversation
            .context
            .reasoning
            .effective()
            .and_then(Option::as_ref)
            .and_then(|reasoning| reasoning.effort.as_deref()),
        Some("high")
    );
}

#[test]
fn reasoning_effort_emits_neutral_context_update_without_model_variant_policy() {
    let capabilities = acp_capabilities();
    let mut engine = engine_with(ProtocolFlavor::Acp, capabilities.clone());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        capabilities.clone(),
    );
    let conversation = engine.conversations.get_mut(&conversation_id).unwrap();
    conversation.model_state = Some(SessionModelState {
        current_model_id: "model-base".to_string(),
        available_models: vec![
            SessionModel {
                id: "model-base".to_string(),
                name: "Base model".to_string(),
                description: None,
            },
            SessionModel {
                id: "model-thinking".to_string(),
                name: "Thinking model".to_string(),
                description: None,
            },
        ],
    });

    let plan = engine
        .plan_command(EngineCommand::UpdateContext {
            conversation_id,
            patch: ContextPatch::one(ContextUpdate::Reasoning {
                scope: ContextScope::TurnAndFuture,
                reasoning: Some(ReasoningProfile {
                    effort: Some("high".to_string()),
                }),
            }),
        })
        .expect("effort update");

    assert!(matches!(
        &plan.effects[0].method,
        ProtocolMethod::UpdateContext
    ));
    assert_eq!(
        plan.effects[0].payload.fields.get("contextUpdate"),
        Some(&"reasoning".to_string())
    );
    assert_eq!(plan.effects[0].payload.fields.get("model"), None);
}

#[test]
fn reasoning_none_emits_neutral_context_update_without_model_variant_policy() {
    let capabilities = acp_capabilities();
    let mut engine = engine_with(ProtocolFlavor::Acp, capabilities.clone());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        capabilities.clone(),
    );
    let conversation = engine.conversations.get_mut(&conversation_id).unwrap();
    conversation.model_state = Some(SessionModelState {
        current_model_id: "model-thinking".to_string(),
        available_models: vec![
            SessionModel {
                id: "model-base".to_string(),
                name: "Base model".to_string(),
                description: None,
            },
            SessionModel {
                id: "model-thinking".to_string(),
                name: "Thinking model".to_string(),
                description: None,
            },
        ],
    });

    let plan = engine
        .plan_command(EngineCommand::UpdateContext {
            conversation_id,
            patch: ContextPatch::one(ContextUpdate::Reasoning {
                scope: ContextScope::TurnAndFuture,
                reasoning: Some(ReasoningProfile {
                    effort: Some("none".to_string()),
                }),
            }),
        })
        .expect("effort update");

    assert!(matches!(
        &plan.effects[0].method,
        ProtocolMethod::UpdateContext
    ));
    assert_eq!(
        plan.effects[0].payload.fields.get("reasoningEffort"),
        Some(&"none".to_string())
    );
    assert_eq!(plan.effects[0].payload.fields.get("model"), None);
}

#[test]
fn acp_start_turn_rejects_unsupported_turn_overrides() {
    let capabilities = acp_capabilities();
    let mut engine = engine_with(ProtocolFlavor::Acp, capabilities.clone());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        capabilities.clone(),
    );

    let error = engine
        .plan_command(EngineCommand::StartTurn {
            conversation_id: conversation_id.clone(),
            input: vec![UserInput::text("hello")],
            overrides: TurnOverrides {
                context: ContextPatch::one(ContextUpdate::Model {
                    scope: ContextScope::CurrentTurn,
                    model: Some("gpt-5.5".to_string()),
                }),
            },
        })
        .expect_err("turn overrides should be gated");

    assert!(matches!(
        error,
        crate::EngineError::CapabilityUnsupported { capability }
            if capability == "context.turn_overrides"
    ));
    let conversation = engine.conversations.get(&conversation_id).unwrap();
    assert_eq!(conversation.context.model.effective(), None);
}

#[test]
fn context_update_emits_neutral_effects_and_start_turn_stays_context_free() {
    let capabilities = codex_capabilities();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, capabilities.clone());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        capabilities.clone(),
    );
    let plan = engine
        .plan_command(EngineCommand::UpdateContext {
            conversation_id: conversation_id.clone(),
            patch: ContextPatch {
                updates: vec![
                    ContextUpdate::Model {
                        scope: ContextScope::TurnAndFuture,
                        model: Some("gpt-5.5".to_string()),
                    },
                    ContextUpdate::Mode {
                        scope: ContextScope::TurnAndFuture,
                        mode: Some(AgentMode {
                            id: "plan".to_string(),
                        }),
                    },
                    ContextUpdate::PermissionMode {
                        scope: ContextScope::TurnAndFuture,
                        mode: Some(PermissionMode {
                            id: "plan".to_string(),
                        }),
                    },
                    ContextUpdate::Reasoning {
                        scope: ContextScope::TurnAndFuture,
                        reasoning: Some(ReasoningProfile {
                            effort: Some("high".to_string()),
                        }),
                    },
                    ContextUpdate::ApprovalPolicy {
                        scope: ContextScope::TurnAndFuture,
                        policy: ApprovalPolicy::Never,
                    },
                    ContextUpdate::Sandbox {
                        scope: ContextScope::TurnAndFuture,
                        sandbox: SandboxProfile::WorkspaceWrite,
                    },
                    ContextUpdate::Permissions {
                        scope: ContextScope::TurnAndFuture,
                        permissions: PermissionProfile {
                            name: "default".to_string(),
                        },
                    },
                ],
            },
        })
        .expect("context update");
    assert_eq!(plan.effects.len(), 7);
    assert!(
        plan.effects
            .iter()
            .all(|effect| matches!(effect.method, ProtocolMethod::UpdateContext))
    );
    assert_eq!(
        plan.effects[0].payload.fields.get("contextUpdate"),
        Some(&"model".to_string())
    );
    assert_eq!(
        plan.effects[1].payload.fields.get("contextUpdate"),
        Some(&"mode".to_string())
    );
    assert_eq!(
        plan.effects[2].payload.fields.get("contextUpdate"),
        Some(&"permissionMode".to_string())
    );
    assert_eq!(
        plan.effects[3].payload.fields.get("contextUpdate"),
        Some(&"reasoning".to_string())
    );
    assert_eq!(
        plan.effects[4].payload.fields.get("contextUpdate"),
        Some(&"approval".to_string())
    );
    assert_eq!(
        plan.effects[5].payload.fields.get("contextUpdate"),
        Some(&"sandbox".to_string())
    );
    assert_eq!(
        plan.effects[6].payload.fields.get("contextUpdate"),
        Some(&"permissions".to_string())
    );

    let turn = engine
        .plan_command(EngineCommand::StartTurn {
            conversation_id,
            input: vec![UserInput::text("hello")],
            overrides: TurnOverrides::default(),
        })
        .expect("start turn");
    let fields = &turn.effects[0].payload.fields;
    assert_eq!(fields.get("model"), None);
    assert_eq!(fields.get("mode"), None);
    assert_eq!(fields.get("permissionMode"), None);
    assert_eq!(fields.get("reasoningEffort"), None);
    assert_eq!(fields.get("approval"), None);
    assert_eq!(fields.get("permissions"), None);
    assert_eq!(fields.get("sandbox"), None);
}
