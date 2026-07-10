use super::{
    AvailableModeState, AvailablePermissionModeState, ConversationSettingsState, ModelListState,
    ReasoningLevelState,
};
use crate::command::EngineCommand;
use crate::error::EngineError;
use crate::event::{EngineEvent, TransitionReport};
use crate::ids::ConversationId;
use crate::reducer::{AngelEngine, CommandPlan};
use crate::state::{
    AgentMode, ContextPatch, ContextScope, ContextUpdate, PermissionMode, ReasoningProfile,
    SessionModeState, SessionModelState, SessionPermissionModeState,
};

impl AngelEngine {
    pub fn conversation_settings(
        &self,
        conversation_id: impl Into<ConversationId>,
    ) -> Result<ConversationSettingsState, EngineError> {
        let conversation_id = conversation_id.into();
        let conversation = self.conversations.get(&conversation_id).ok_or_else(|| {
            EngineError::ConversationNotFound {
                conversation_id: conversation_id.to_string(),
            }
        })?;
        Ok(ConversationSettingsState::from_conversation(conversation))
    }

    pub fn get_reasoning_level(
        &self,
        conversation_id: impl Into<ConversationId>,
    ) -> Result<ReasoningLevelState, EngineError> {
        Ok(self.conversation_settings(conversation_id)?.reasoning)
    }

    pub fn reasoning_level(
        &self,
        conversation_id: impl Into<ConversationId>,
    ) -> Result<ReasoningLevelState, EngineError> {
        self.get_reasoning_level(conversation_id)
    }

    pub fn get_model_list(
        &self,
        conversation_id: impl Into<ConversationId>,
    ) -> Result<ModelListState, EngineError> {
        Ok(self.conversation_settings(conversation_id)?.model_list)
    }

    pub fn model_list(
        &self,
        conversation_id: impl Into<ConversationId>,
    ) -> Result<ModelListState, EngineError> {
        self.get_model_list(conversation_id)
    }

    pub fn get_available_modes(
        &self,
        conversation_id: impl Into<ConversationId>,
    ) -> Result<AvailableModeState, EngineError> {
        Ok(self.conversation_settings(conversation_id)?.available_modes)
    }

    pub fn available_modes(
        &self,
        conversation_id: impl Into<ConversationId>,
    ) -> Result<AvailableModeState, EngineError> {
        self.get_available_modes(conversation_id)
    }

    pub fn get_permission_modes(
        &self,
        conversation_id: impl Into<ConversationId>,
    ) -> Result<AvailablePermissionModeState, EngineError> {
        Ok(self
            .conversation_settings(conversation_id)?
            .permission_modes)
    }

    pub fn permission_modes(
        &self,
        conversation_id: impl Into<ConversationId>,
    ) -> Result<AvailablePermissionModeState, EngineError> {
        self.get_permission_modes(conversation_id)
    }

    pub fn set_reasoning_level(
        &mut self,
        conversation_id: impl Into<ConversationId>,
        level: impl Into<String>,
    ) -> Result<CommandPlan, EngineError> {
        let conversation_id = conversation_id.into();
        let level = level.into().trim().to_string();
        let settings = self.get_reasoning_level(conversation_id.clone())?;
        if level.is_empty()
            || !settings.can_set
            || settings.current_level.as_deref() == Some(level.as_str())
            || !known_reasoning_level(&settings, &level)
        {
            return Ok(settings_noop_plan(conversation_id));
        }

        let mut reasoning = self.current_reasoning_profile(&conversation_id)?;
        reasoning.effort = Some(level);
        self.plan_command(EngineCommand::UpdateContext {
            conversation_id,
            patch: ContextPatch::one(ContextUpdate::Reasoning {
                scope: ContextScope::TurnAndFuture,
                reasoning: Some(reasoning),
            }),
        })
    }

    pub fn set_model(
        &mut self,
        conversation_id: impl Into<ConversationId>,
        model: impl Into<String>,
    ) -> Result<CommandPlan, EngineError> {
        let conversation_id = conversation_id.into();
        let model = model.into().trim().to_string();
        let settings = self.get_model_list(conversation_id.clone())?;
        if model.is_empty()
            || !settings.can_set
            || settings.current_model_id.as_deref() == Some(model.as_str())
            || !known_model(&settings, &model)
        {
            return Ok(settings_noop_plan(conversation_id));
        }

        self.plan_command(EngineCommand::UpdateContext {
            conversation_id,
            patch: ContextPatch::one(ContextUpdate::Model {
                scope: ContextScope::TurnAndFuture,
                model: Some(model),
            }),
        })
    }

    pub fn replace_model_list(
        &mut self,
        conversation_id: impl Into<ConversationId>,
        models: SessionModelState,
    ) -> Result<TransitionReport, EngineError> {
        self.apply_event(EngineEvent::SessionModelsUpdated {
            conversation_id: conversation_id.into(),
            models,
        })
    }

    pub fn hydrate_model_list(
        &mut self,
        conversation_id: impl Into<ConversationId>,
        models: SessionModelState,
    ) -> Result<Option<TransitionReport>, EngineError> {
        let conversation_id = conversation_id.into();
        let settings = self.get_model_list(conversation_id.clone())?;
        if !settings.can_set || !settings.available_models.is_empty() {
            return Ok(None);
        }

        self.replace_model_list(conversation_id, models).map(Some)
    }

    pub fn set_mode(
        &mut self,
        conversation_id: impl Into<ConversationId>,
        mode: impl Into<String>,
    ) -> Result<CommandPlan, EngineError> {
        let conversation_id = conversation_id.into();
        let mode = mode.into().trim().to_string();
        let settings = self.get_available_modes(conversation_id.clone())?;
        let context_mode_id = self
            .conversations
            .get(&conversation_id)
            .and_then(|conversation| {
                conversation
                    .context
                    .mode
                    .effective()
                    .and_then(Option::as_ref)
                    .map(|mode| mode.id.as_str())
            });
        let mode_is_materialized = context_mode_id == Some(mode.as_str());
        if mode.is_empty()
            || !settings.can_set
            || !known_mode(&settings, &mode)
            || (settings.current_mode_id.as_deref() == Some(mode.as_str()) && mode_is_materialized)
        {
            return Ok(settings_noop_plan(conversation_id));
        }

        self.plan_command(EngineCommand::UpdateContext {
            conversation_id,
            patch: ContextPatch::one(ContextUpdate::Mode {
                scope: ContextScope::TurnAndFuture,
                mode: Some(AgentMode { id: mode }),
            }),
        })
    }

    pub fn replace_available_modes(
        &mut self,
        conversation_id: impl Into<ConversationId>,
        modes: SessionModeState,
    ) -> Result<TransitionReport, EngineError> {
        self.apply_event(EngineEvent::SessionModesUpdated {
            conversation_id: conversation_id.into(),
            modes,
        })
    }

    pub fn set_permission_mode(
        &mut self,
        conversation_id: impl Into<ConversationId>,
        mode: impl Into<String>,
    ) -> Result<CommandPlan, EngineError> {
        let conversation_id = conversation_id.into();
        let mode = mode.into().trim().to_string();
        let settings = self.get_permission_modes(conversation_id.clone())?;
        let context_mode_id = self
            .conversations
            .get(&conversation_id)
            .and_then(|conversation| {
                conversation
                    .context
                    .permission_mode
                    .effective()
                    .and_then(Option::as_ref)
                    .map(|mode| mode.id.as_str())
            });
        let mode_is_materialized = context_mode_id == Some(mode.as_str());
        if mode.is_empty()
            || !settings.can_set
            || !known_permission_mode(&settings, &mode)
            || (settings.current_mode_id.as_deref() == Some(mode.as_str()) && mode_is_materialized)
        {
            return Ok(settings_noop_plan(conversation_id));
        }

        self.plan_command(EngineCommand::UpdateContext {
            conversation_id,
            patch: ContextPatch::one(ContextUpdate::PermissionMode {
                scope: ContextScope::TurnAndFuture,
                mode: Some(PermissionMode { id: mode }),
            }),
        })
    }

    pub fn replace_permission_modes(
        &mut self,
        conversation_id: impl Into<ConversationId>,
        modes: SessionPermissionModeState,
    ) -> Result<TransitionReport, EngineError> {
        self.apply_event(EngineEvent::SessionPermissionModesUpdated {
            conversation_id: conversation_id.into(),
            modes,
        })
    }

    fn current_reasoning_profile(
        &self,
        conversation_id: &ConversationId,
    ) -> Result<ReasoningProfile, EngineError> {
        Ok(self
            .conversations
            .get(conversation_id)
            .ok_or_else(|| EngineError::ConversationNotFound {
                conversation_id: conversation_id.to_string(),
            })?
            .context
            .reasoning
            .effective()
            .and_then(Option::as_ref)
            .cloned()
            .unwrap_or(ReasoningProfile { effort: None }))
    }
}

fn settings_noop_plan(conversation_id: ConversationId) -> CommandPlan {
    CommandPlan {
        conversation_id: Some(conversation_id),
        ..CommandPlan::default()
    }
}

fn known_reasoning_level(settings: &ReasoningLevelState, level: &str) -> bool {
    settings.available_levels.is_empty()
        || settings
            .available_levels
            .iter()
            .any(|available| available == level)
}

fn known_model(settings: &ModelListState, model: &str) -> bool {
    settings.available_models.is_empty()
        || settings
            .available_models
            .iter()
            .any(|available| available.id == model)
}

fn known_mode(settings: &AvailableModeState, mode: &str) -> bool {
    settings.available_modes.is_empty()
        || settings
            .available_modes
            .iter()
            .any(|available| available.id == mode)
}

fn known_permission_mode(settings: &AvailablePermissionModeState, mode: &str) -> bool {
    settings.available_modes.is_empty()
        || settings
            .available_modes
            .iter()
            .any(|available| available.id == mode)
}
