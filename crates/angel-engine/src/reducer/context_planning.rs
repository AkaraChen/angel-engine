use crate::error::EngineError;
use crate::ids::ConversationId;
use crate::protocol::{ProtocolEffect, ProtocolMethod};
use crate::state::{
    ApprovalPolicy, ContextPatch, ContextScope, ContextUpdate, ConversationLifecycle,
    SandboxProfile,
};

use super::{AngelEngine, CommandPlan, PendingRequest};

impl AngelEngine {
    pub(super) fn plan_update_context(
        &mut self,
        conversation_id: ConversationId,
        patch: ContextPatch,
    ) -> Result<CommandPlan, EngineError> {
        {
            let conversation = self.conversation(&conversation_id)?;
            if !conversation.is_loaded()
                || matches!(conversation.lifecycle, ConversationLifecycle::Faulted(_))
            {
                return Err(EngineError::InvalidState {
                    expected: "loaded conversation".to_string(),
                    actual: format!("{:?}", conversation.lifecycle),
                });
            }
        }

        self.conversation_mut(&conversation_id)?
            .context
            .apply_patch(patch.clone());

        let mut effects = Vec::new();
        let mut first_request_id = None;
        for update in patch.updates {
            let Some(fields) = context_update_fields(&update) else {
                continue;
            };
            let request_id = self.next_request_id();
            if first_request_id.is_none() {
                first_request_id = Some(request_id.clone());
            }
            self.pending.insert(
                request_id.clone(),
                PendingRequest::UpdateContext {
                    conversation_id: conversation_id.clone(),
                    patch: ContextPatch::one(update),
                },
            )?;
            let mut effect = ProtocolEffect::new(self.protocol, ProtocolMethod::UpdateContext)
                .request_id(request_id)
                .conversation_id(conversation_id.clone());
            for (key, value) in fields {
                effect = effect.field(key, value);
            }
            effects.push(effect);
        }

        Ok(CommandPlan {
            effects,
            conversation_id: Some(conversation_id),
            request_id: first_request_id,
            ..CommandPlan::default()
        })
    }
}

fn context_update_fields(update: &ContextUpdate) -> Option<Vec<(String, String)>> {
    let mut fields = Vec::new();
    match update {
        ContextUpdate::Model { scope, model } => {
            fields.push(("contextUpdate".to_string(), "model".to_string()));
            fields.push(("scope".to_string(), context_scope_name(*scope).to_string()));
            push_optional_field(&mut fields, "model", model.as_deref());
        }
        ContextUpdate::Reasoning { scope, reasoning } => {
            fields.push(("contextUpdate".to_string(), "reasoning".to_string()));
            fields.push(("scope".to_string(), context_scope_name(*scope).to_string()));
            push_optional_field(
                &mut fields,
                "reasoning",
                reasoning
                    .as_ref()
                    .and_then(|reasoning| reasoning.effort.as_deref()),
            );
            if let Some(reasoning) = reasoning {
                push_optional_field(&mut fields, "reasoningEffort", reasoning.effort.as_deref());
            }
        }
        ContextUpdate::Mode { scope, mode } => {
            fields.push(("contextUpdate".to_string(), "mode".to_string()));
            fields.push(("scope".to_string(), context_scope_name(*scope).to_string()));
            push_optional_field(
                &mut fields,
                "mode",
                mode.as_ref().map(|mode| mode.id.as_str()),
            );
        }
        ContextUpdate::PermissionMode { scope, mode } => {
            fields.push(("contextUpdate".to_string(), "permissionMode".to_string()));
            fields.push(("scope".to_string(), context_scope_name(*scope).to_string()));
            push_optional_field(
                &mut fields,
                "permissionMode",
                mode.as_ref().map(|mode| mode.id.as_str()),
            );
        }
        ContextUpdate::Cwd { scope, cwd } => {
            fields.push(("contextUpdate".to_string(), "cwd".to_string()));
            fields.push(("scope".to_string(), context_scope_name(*scope).to_string()));
            push_optional_field(&mut fields, "cwd", cwd.as_deref());
        }
        ContextUpdate::AdditionalDirectories { scope, directories } => {
            fields.push((
                "contextUpdate".to_string(),
                "additionalDirectories".to_string(),
            ));
            fields.push(("scope".to_string(), context_scope_name(*scope).to_string()));
            fields.push(("directoryCount".to_string(), directories.len().to_string()));
            for (index, directory) in directories.iter().enumerate() {
                fields.push((format!("directory.{index}"), directory.clone()));
            }
        }
        ContextUpdate::ApprovalPolicy { scope, policy } => {
            fields.push(("contextUpdate".to_string(), "approval".to_string()));
            fields.push(("scope".to_string(), context_scope_name(*scope).to_string()));
            fields.push((
                "approval".to_string(),
                approval_policy_name(policy).to_string(),
            ));
        }
        ContextUpdate::Sandbox { scope, sandbox } => {
            fields.push(("contextUpdate".to_string(), "sandbox".to_string()));
            fields.push(("scope".to_string(), context_scope_name(*scope).to_string()));
            fields.push((
                "sandbox".to_string(),
                sandbox_profile_name(sandbox).to_string(),
            ));
        }
        ContextUpdate::Permissions { scope, permissions } => {
            fields.push(("contextUpdate".to_string(), "permissions".to_string()));
            fields.push(("scope".to_string(), context_scope_name(*scope).to_string()));
            fields.push(("permissions".to_string(), permissions.name.clone()));
        }
        ContextUpdate::Raw { .. } => return None,
    }
    Some(fields)
}

fn push_optional_field(fields: &mut Vec<(String, String)>, key: &str, value: Option<&str>) {
    match value {
        Some(value) => fields.push((key.to_string(), value.to_string())),
        None => fields.push((format!("{key}Cleared"), "true".to_string())),
    }
}

fn context_scope_name(scope: ContextScope) -> &'static str {
    match scope {
        ContextScope::RuntimeDefault => "runtimeDefault",
        ContextScope::Conversation => "conversation",
        ContextScope::TurnAndFuture => "turnAndFuture",
        ContextScope::CurrentTurn => "currentTurn",
        ContextScope::TemporaryGrant => "temporaryGrant",
    }
}

fn approval_policy_name(policy: &ApprovalPolicy) -> &'static str {
    match policy {
        ApprovalPolicy::Never => "never",
        ApprovalPolicy::OnRequest => "onRequest",
        ApprovalPolicy::OnFailure => "onFailure",
        ApprovalPolicy::UnlessTrusted => "unlessTrusted",
    }
}

fn sandbox_profile_name(sandbox: &SandboxProfile) -> &str {
    match sandbox {
        SandboxProfile::ReadOnly => "readOnly",
        SandboxProfile::WorkspaceWrite => "workspaceWrite",
        SandboxProfile::FullAccess => "fullAccess",
        SandboxProfile::Custom(value) => value,
    }
}
