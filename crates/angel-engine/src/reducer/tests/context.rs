use crate::adapters::acp::AcpAdapter;
use crate::adapters::codex::CodexAdapter;
use crate::command::{EngineCommand, TurnOverrides, UserInput};
use crate::ids::RemoteConversationId;
use crate::protocol::{AcpMethod, ProtocolFlavor, ProtocolMethod};
use crate::state::{
    AgentMode, ApprovalPolicy, ContextPatch, ContextScope, ContextUpdate, PermissionProfile,
    ReasoningProfile, SandboxProfile, SessionConfigOption, SessionModel, SessionModelState,
};

use super::{engine_with, insert_ready_conversation};

#[test]
fn acp_context_update_uses_advertised_model_config_option() {
    let adapter = AcpAdapter::standard();
    let mut engine = engine_with(ProtocolFlavor::Acp, adapter.capabilities());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        adapter.capabilities(),
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
        ProtocolMethod::Acp(AcpMethod::SetSessionConfigOption)
    ));
    assert_eq!(
        plan.effects[0].payload.fields.get("configId"),
        Some(&"model".to_string())
    );
    assert_eq!(
        plan.effects[0].payload.fields.get("value"),
        Some(&"gpt-5.5".to_string())
    );
    let conversation_id = plan.conversation_id.as_ref().unwrap();
    let conversation = engine.conversations.get(conversation_id).unwrap();
    assert_eq!(conversation.context.model.effective(), None);
}

#[test]
fn acp_context_update_uses_advertised_effort_config_option() {
    let adapter = AcpAdapter::standard();
    let mut engine = engine_with(ProtocolFlavor::Acp, adapter.capabilities());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        adapter.capabilities(),
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
            category: Some("thought_level".to_string()),
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
        ProtocolMethod::Acp(AcpMethod::SetSessionConfigOption)
    ));
    assert_eq!(
        plan.effects[0].payload.fields.get("configId"),
        Some(&"thought_level".to_string())
    );
    assert_eq!(
        plan.effects[0].payload.fields.get("value"),
        Some(&"high".to_string())
    );
    let conversation_id = plan.conversation_id.as_ref().unwrap();
    let conversation = engine.conversations.get(conversation_id).unwrap();
    assert_eq!(conversation.context.reasoning.effective(), None);
}

#[test]
fn acp_reasoning_effort_uses_thinking_model_variant_when_available() {
    let adapter = AcpAdapter::standard();
    let mut engine = engine_with(ProtocolFlavor::Acp, adapter.capabilities());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        adapter.capabilities(),
    );
    let conversation = engine.conversations.get_mut(&conversation_id).unwrap();
    conversation.model_state = Some(SessionModelState {
        current_model_id: "kimi-code/kimi-for-coding".to_string(),
        available_models: vec![
            SessionModel {
                id: "kimi-code/kimi-for-coding".to_string(),
                name: "Kimi Coding".to_string(),
                description: None,
            },
            SessionModel {
                id: "kimi-code/kimi-for-coding,thinking".to_string(),
                name: "Kimi Coding (thinking)".to_string(),
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
        ProtocolMethod::Acp(AcpMethod::SetSessionModel)
    ));
    assert_eq!(
        plan.effects[0].payload.fields.get("modelId"),
        Some(&"kimi-code/kimi-for-coding,thinking".to_string())
    );
}

#[test]
fn acp_reasoning_none_disables_thinking_model_variant_when_available() {
    let adapter = AcpAdapter::standard();
    let mut engine = engine_with(ProtocolFlavor::Acp, adapter.capabilities());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        adapter.capabilities(),
    );
    let conversation = engine.conversations.get_mut(&conversation_id).unwrap();
    conversation.model_state = Some(SessionModelState {
        current_model_id: "kimi-code/kimi-for-coding,thinking".to_string(),
        available_models: vec![
            SessionModel {
                id: "kimi-code/kimi-for-coding".to_string(),
                name: "Kimi Coding".to_string(),
                description: None,
            },
            SessionModel {
                id: "kimi-code/kimi-for-coding,thinking".to_string(),
                name: "Kimi Coding (thinking)".to_string(),
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
        ProtocolMethod::Acp(AcpMethod::SetSessionModel)
    ));
    assert_eq!(
        plan.effects[0].payload.fields.get("modelId"),
        Some(&"kimi-code/kimi-for-coding".to_string())
    );
}

#[test]
fn acp_start_turn_rejects_unsupported_turn_overrides() {
    let adapter = AcpAdapter::standard();
    let mut engine = engine_with(ProtocolFlavor::Acp, adapter.capabilities());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        adapter.capabilities(),
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
fn codex_start_turn_includes_sticky_context_overrides() {
    let adapter = CodexAdapter::app_server();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, adapter.capabilities());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        adapter.capabilities(),
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
    assert!(plan.effects.is_empty());

    let turn = engine
        .plan_command(EngineCommand::StartTurn {
            conversation_id,
            input: vec![UserInput::text("hello")],
            overrides: TurnOverrides::default(),
        })
        .expect("start turn");
    let fields = &turn.effects[0].payload.fields;
    assert_eq!(fields.get("model"), Some(&"gpt-5.5".to_string()));
    assert_eq!(fields.get("collaborationMode"), Some(&"plan".to_string()));
    assert_eq!(fields.get("effort"), Some(&"high".to_string()));
    assert_eq!(fields.get("approvalPolicy"), Some(&"never".to_string()));
    assert_eq!(fields.get("permissions"), Some(&"default".to_string()));
    assert_eq!(fields.get("sandboxPolicy"), None);
}
