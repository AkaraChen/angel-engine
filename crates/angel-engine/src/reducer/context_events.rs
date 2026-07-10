use crate::error::EngineError;
use crate::event::{TransitionReport, UiEvent};
use crate::ids::ConversationId;
use crate::state::{
    AgentMode, ContextPatch, ContextScope, ContextUpdate, PermissionMode, SessionConfigOption,
    SessionModeState, SessionModelState, SessionPermissionModeState,
};

use super::AngelEngine;
use super::context_effects::sync_context_from_config_options;

impl AngelEngine {
    pub(super) fn apply_session_config_options_updated(
        &mut self,
        conversation_id: ConversationId,
        options: Vec<SessionConfigOption>,
    ) -> Result<TransitionReport, EngineError> {
        let conversation = self.conversation_mut(&conversation_id)?;
        sync_context_from_config_options(&mut conversation.context, &options);
        conversation.config_options = options;
        Ok(TransitionReport::one(UiEvent::ContextChanged(
            conversation_id,
        )))
    }

    pub(super) fn apply_session_modes_updated(
        &mut self,
        conversation_id: ConversationId,
        modes: SessionModeState,
    ) -> Result<TransitionReport, EngineError> {
        let conversation = self.conversation_mut(&conversation_id)?;
        conversation
            .context
            .apply_patch(ContextPatch::one(ContextUpdate::Mode {
                scope: ContextScope::TurnAndFuture,
                mode: Some(AgentMode {
                    id: modes.current_mode_id.clone(),
                }),
            }));
        conversation.mode_state = Some(modes);
        Ok(TransitionReport::one(UiEvent::ContextChanged(
            conversation_id,
        )))
    }

    pub(super) fn apply_session_mode_changed(
        &mut self,
        conversation_id: ConversationId,
        mode_id: String,
    ) -> Result<TransitionReport, EngineError> {
        let conversation = self.conversation_mut(&conversation_id)?;
        if let Some(modes) = &mut conversation.mode_state {
            modes.current_mode_id = mode_id.clone();
        }
        conversation
            .context
            .apply_patch(ContextPatch::one(ContextUpdate::Mode {
                scope: ContextScope::TurnAndFuture,
                mode: Some(AgentMode { id: mode_id }),
            }));
        Ok(TransitionReport::one(UiEvent::ContextChanged(
            conversation_id,
        )))
    }

    pub(super) fn apply_session_permission_modes_updated(
        &mut self,
        conversation_id: ConversationId,
        modes: SessionPermissionModeState,
    ) -> Result<TransitionReport, EngineError> {
        let conversation = self.conversation_mut(&conversation_id)?;
        conversation
            .context
            .apply_patch(ContextPatch::one(ContextUpdate::PermissionMode {
                scope: ContextScope::TurnAndFuture,
                mode: Some(PermissionMode {
                    id: modes.current_mode_id.clone(),
                }),
            }));
        conversation.permission_mode_state = Some(modes);
        Ok(TransitionReport::one(UiEvent::ContextChanged(
            conversation_id,
        )))
    }

    pub(super) fn apply_session_permission_mode_changed(
        &mut self,
        conversation_id: ConversationId,
        mode_id: String,
    ) -> Result<TransitionReport, EngineError> {
        let conversation = self.conversation_mut(&conversation_id)?;
        if let Some(modes) = &mut conversation.permission_mode_state {
            modes.current_mode_id = mode_id.clone();
        }
        conversation
            .context
            .apply_patch(ContextPatch::one(ContextUpdate::PermissionMode {
                scope: ContextScope::TurnAndFuture,
                mode: Some(PermissionMode { id: mode_id }),
            }));
        Ok(TransitionReport::one(UiEvent::ContextChanged(
            conversation_id,
        )))
    }

    pub(super) fn apply_session_models_updated(
        &mut self,
        conversation_id: ConversationId,
        models: SessionModelState,
    ) -> Result<TransitionReport, EngineError> {
        let conversation = self.conversation_mut(&conversation_id)?;
        conversation
            .context
            .apply_patch(ContextPatch::one(ContextUpdate::Model {
                scope: ContextScope::TurnAndFuture,
                model: Some(models.current_model_id.clone()),
            }));
        conversation.model_state = Some(models);
        Ok(TransitionReport::one(UiEvent::ContextChanged(
            conversation_id,
        )))
    }

    pub(super) fn apply_context_updated(
        &mut self,
        conversation_id: ConversationId,
        patch: ContextPatch,
    ) -> Result<TransitionReport, EngineError> {
        let conversation = self.conversation_mut(&conversation_id)?;
        let model = patch.updates.iter().find_map(|update| {
            if let ContextUpdate::Model {
                model: Some(model), ..
            } = update
            {
                Some(model.clone())
            } else {
                None
            }
        });
        let mode = patch.updates.iter().find_map(|update| {
            if let ContextUpdate::Mode {
                mode: Some(mode), ..
            } = update
            {
                Some(mode.id.clone())
            } else {
                None
            }
        });
        let permission_mode = patch.updates.iter().find_map(|update| {
            if let ContextUpdate::PermissionMode {
                mode: Some(mode), ..
            } = update
            {
                Some(mode.id.clone())
            } else {
                None
            }
        });
        conversation.context.apply_patch(patch);
        if let Some(model) = model
            && let Some(models) = &mut conversation.model_state
        {
            models.current_model_id = model;
        }
        if let Some(mode) = mode
            && let Some(modes) = &mut conversation.mode_state
        {
            modes.current_mode_id = mode;
        }
        if let Some(mode) = permission_mode
            && let Some(modes) = &mut conversation.permission_mode_state
        {
            modes.current_mode_id = mode;
        }
        Ok(TransitionReport::one(UiEvent::ContextChanged(
            conversation_id,
        )))
    }
}
