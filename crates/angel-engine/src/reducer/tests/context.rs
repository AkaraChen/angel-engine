use crate::command::{EngineCommand, TurnOverrides, UserInput};
use crate::event::EngineEvent;
use crate::ids::RemoteConversationId;
use crate::protocol::{ProtocolFlavor, ProtocolMethod};
use crate::state::{
    AgentMode, ApprovalPolicy, ContextPatch, ContextScope, ContextUpdate, PermissionProfile,
    ReasoningProfile, SandboxProfile, SessionConfigOption, SessionConfigValue, SessionMode,
    SessionModeState, SessionModel, SessionModelState,
};

use super::{acp_capabilities, codex_capabilities, engine_with, insert_ready_conversation};

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
    assert_eq!(plan.effects.len(), 6);
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
        Some(&"reasoning".to_string())
    );
    assert_eq!(
        plan.effects[3].payload.fields.get("contextUpdate"),
        Some(&"approval".to_string())
    );
    assert_eq!(
        plan.effects[4].payload.fields.get("contextUpdate"),
        Some(&"sandbox".to_string())
    );
    assert_eq!(
        plan.effects[5].payload.fields.get("contextUpdate"),
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
    assert_eq!(fields.get("reasoningEffort"), None);
    assert_eq!(fields.get("approval"), None);
    assert_eq!(fields.get("permissions"), None);
    assert_eq!(fields.get("sandbox"), None);
}
