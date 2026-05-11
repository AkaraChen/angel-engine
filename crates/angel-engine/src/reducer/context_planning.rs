use crate::error::EngineError;
use crate::ids::ConversationId;
use crate::protocol::ProtocolEffect;
use crate::state::{ContextPatch, ConversationLifecycle};

use super::context_effects::explicit_context_effect_specs;
use super::{AngelEngine, CommandPlan, PendingRequest};

impl AngelEngine {
    pub(super) fn plan_update_context(
        &mut self,
        conversation_id: ConversationId,
        patch: ContextPatch,
    ) -> Result<CommandPlan, EngineError> {
        {
            let conversation = self.conversation(&conversation_id)?;
            if matches!(
                conversation.lifecycle,
                ConversationLifecycle::Closed | ConversationLifecycle::Faulted(_)
            ) {
                return Err(EngineError::InvalidState {
                    expected: "loaded conversation".to_string(),
                    actual: format!("{:?}", conversation.lifecycle),
                });
            }
        }

        let uses_explicit_updates = self
            .conversation(&conversation_id)?
            .capabilities
            .context
            .explicit_context_updates
            .is_supported();

        let effect_specs = if uses_explicit_updates {
            let conversation = self.conversation(&conversation_id)?;
            explicit_context_effect_specs(conversation, &patch)
        } else {
            // Protocols that embed context in request fields (e.g. Codex) apply
            // the patch to local state immediately instead of sending explicit requests.
            let conversation = self.conversation_mut(&conversation_id)?;
            conversation.context.apply_patch(patch.clone());
            Vec::new()
        };

        let mut effects = Vec::new();
        let mut first_request_id = None;
        for spec in effect_specs {
            let request_id = self.next_request_id();
            if first_request_id.is_none() {
                first_request_id = Some(request_id.clone());
            }
            self.pending.insert(
                request_id.clone(),
                PendingRequest::UpdateContext {
                    conversation_id: conversation_id.clone(),
                    patch: spec.patch,
                },
            )?;
            let mut effect = ProtocolEffect::new(self.protocol, spec.method)
                .request_id(request_id)
                .conversation_id(conversation_id.clone());
            for (key, value) in spec.fields {
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
