use crate::protocol::ProtocolMethod;
use crate::settings::{
    find_config_option, find_mode_config_option, find_model_config_option,
    find_reasoning_config_option, thinking_model_for_level,
};
use crate::state::{
    AgentMode, ApprovalPolicy, ContextPatch, ContextScope, ContextUpdate, ConversationState,
    ReasoningProfile, SandboxProfile, SessionConfigOption,
};

pub(super) struct ContextEffectSpec {
    pub(super) method: ProtocolMethod,
    pub(super) fields: Vec<(String, String)>,
    pub(super) patch: ContextPatch,
}

pub(super) fn sync_context_from_config_options(
    context: &mut crate::EffectiveContext,
    options: &[SessionConfigOption],
) {
    if let Some(option) = find_model_config_option(options) {
        context.apply_patch(ContextPatch::one(ContextUpdate::Model {
            scope: ContextScope::TurnAndFuture,
            model: Some(option.current_value.clone()),
        }));
    }
    if let Some(option) = find_mode_config_option(options) {
        context.apply_patch(ContextPatch::one(ContextUpdate::Mode {
            scope: ContextScope::TurnAndFuture,
            mode: Some(AgentMode {
                id: option.current_value.clone(),
            }),
        }));
    }
    if let Some(option) = find_reasoning_config_option(options) {
        context.apply_patch(ContextPatch::one(ContextUpdate::Reasoning {
            scope: ContextScope::TurnAndFuture,
            reasoning: Some(ReasoningProfile {
                effort: Some(option.current_value.clone()),
            }),
        }));
    }
}

pub(super) fn codex_context_fields(context: &crate::EffectiveContext) -> Vec<(String, String)> {
    let mut fields = Vec::new();
    if let Some(Some(model)) = context.model.effective() {
        fields.push(("model".to_string(), model.clone()));
    }
    if let Some(reasoning) = context.reasoning.effective().and_then(Option::as_ref)
        && let Some(effort) = &reasoning.effort
    {
        fields.push(("effort".to_string(), effort.clone()));
    }
    if let Some(policy) = context.approvals.effective() {
        fields.push((
            "approvalPolicy".to_string(),
            codex_approval_policy(policy).to_string(),
        ));
    }
    if let Some(permissions) = context.permissions.effective() {
        fields.push(("permissions".to_string(), permissions.name.clone()));
    } else if let Some(sandbox) = context.sandbox.effective() {
        fields.push((
            "sandboxPolicy".to_string(),
            codex_sandbox_policy(sandbox).to_string(),
        ));
    }
    if let Some(mode) = context.mode.effective().and_then(Option::as_ref)
        && matches!(mode.id.as_str(), "plan" | "default")
    {
        fields.push(("collaborationMode".to_string(), mode.id.clone()));
        if let Some(Some(model)) = context.model.effective() {
            fields.push(("collaborationModel".to_string(), model.clone()));
        }
    }
    fields
}

pub(super) fn codex_approval_policy(policy: &ApprovalPolicy) -> &'static str {
    match policy {
        ApprovalPolicy::Never => "never",
        ApprovalPolicy::OnRequest => "on-request",
        ApprovalPolicy::OnFailure => "on-failure",
        ApprovalPolicy::UnlessTrusted => "untrusted",
    }
}

pub(super) fn codex_sandbox_policy(sandbox: &SandboxProfile) -> &str {
    match sandbox {
        SandboxProfile::ReadOnly => "read-only",
        SandboxProfile::WorkspaceWrite => "workspace-write",
        SandboxProfile::FullAccess => "danger-full-access",
        SandboxProfile::Custom(value) => value,
    }
}

pub(super) fn acp_context_effect_specs(
    conversation: &ConversationState,
    patch: &ContextPatch,
) -> Vec<ContextEffectSpec> {
    let mut specs = Vec::new();
    for update in &patch.updates {
        match update {
            ContextUpdate::Model {
                model: Some(model), ..
            } => {
                if let Some(option) = find_model_config_option(&conversation.config_options) {
                    specs.push(set_config_option_spec(&option.id, model, update.clone()));
                } else {
                    specs.push(ContextEffectSpec {
                        method: ProtocolMethod::SetSessionModel,
                        fields: vec![("modelId".to_string(), model.clone())],
                        patch: ContextPatch::one(update.clone()),
                    });
                }
            }
            ContextUpdate::Mode {
                mode: Some(mode), ..
            } => {
                if let Some(option) = find_mode_config_option(&conversation.config_options) {
                    specs.push(set_config_option_spec(&option.id, &mode.id, update.clone()));
                } else {
                    specs.push(ContextEffectSpec {
                        method: ProtocolMethod::SetSessionMode,
                        fields: vec![("modeId".to_string(), mode.id.clone())],
                        patch: ContextPatch::one(update.clone()),
                    });
                }
            }
            ContextUpdate::Reasoning {
                scope,
                reasoning: Some(reasoning),
                ..
            } => {
                if let Some(effort) = &reasoning.effort
                    && let Some(option) = find_reasoning_config_option(&conversation.config_options)
                {
                    specs.push(set_config_option_spec(&option.id, effort, update.clone()));
                } else if let Some(effort) = &reasoning.effort
                    && let Some(model) = thinking_model_for_level(conversation, effort)
                {
                    specs.push(ContextEffectSpec {
                        method: ProtocolMethod::SetSessionModel,
                        fields: vec![("modelId".to_string(), model.clone())],
                        patch: ContextPatch {
                            updates: vec![
                                ContextUpdate::Model {
                                    scope: *scope,
                                    model: Some(model),
                                },
                                update.clone(),
                            ],
                        },
                    });
                }
            }
            ContextUpdate::ApprovalPolicy { policy, .. } => {
                if let Some(option) = find_config_option(
                    &conversation.config_options,
                    "approval",
                    &[
                        "approval",
                        "approvals",
                        "approval_policy",
                        "permission",
                        "permissions",
                    ],
                )
                .or_else(|| find_mode_config_option(&conversation.config_options))
                {
                    specs.push(set_config_option_spec(
                        &option.id,
                        codex_approval_policy(policy),
                        update.clone(),
                    ));
                }
            }
            ContextUpdate::Sandbox { sandbox, .. } => {
                if let Some(option) =
                    find_config_option(&conversation.config_options, "sandbox", &["sandbox"])
                {
                    specs.push(set_config_option_spec(
                        &option.id,
                        codex_sandbox_policy(sandbox),
                        update.clone(),
                    ));
                }
            }
            ContextUpdate::Permissions { permissions, .. } => {
                if let Some(option) = find_config_option(
                    &conversation.config_options,
                    "permission",
                    &["permission", "permissions", "permission_profile"],
                )
                .or_else(|| find_mode_config_option(&conversation.config_options))
                {
                    specs.push(set_config_option_spec(
                        &option.id,
                        &permissions.name,
                        update.clone(),
                    ));
                }
            }
            _ => {}
        }
    }
    specs
}

fn set_config_option_spec(
    config_id: &str,
    value: &str,
    update: ContextUpdate,
) -> ContextEffectSpec {
    ContextEffectSpec {
        method: ProtocolMethod::SetSessionConfigOption,
        fields: vec![
            ("configId".to_string(), config_id.to_string()),
            ("value".to_string(), value.to_string()),
        ],
        patch: ContextPatch::one(update),
    }
}
