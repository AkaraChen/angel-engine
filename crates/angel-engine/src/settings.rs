use crate::command::EngineCommand;
use crate::error::EngineError;
use crate::event::{EngineEvent, TransitionReport};
use crate::ids::ConversationId;
use crate::reducer::{AngelEngine, CommandPlan};
use crate::state::{
    AgentMode, ContextPatch, ContextScope, ContextUpdate, ConversationState, ReasoningProfile,
    SessionConfigOption, SessionMode, SessionModeState, SessionModel, SessionModelState,
};
use strum::Display;

/// Parsed reasoning level with disabled aliases.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Display)]
pub enum ReasoningLevel {
    None,
    Minimal,
    Low,
    Medium,
    High,
    XHigh,
}

impl ReasoningLevel {
    pub fn from_wire(value: &str) -> Option<Self> {
        match value.to_ascii_lowercase().as_str() {
            "none" | "off" | "false" | "disabled" | "disable" => Some(Self::None),
            "minimal" => Some(Self::Minimal),
            "low" => Some(Self::Low),
            "medium" => Some(Self::Medium),
            "high" => Some(Self::High),
            "xhigh" | "x_high" | "x-high" => Some(Self::XHigh),
            _ => None,
        }
    }
}

impl ReasoningLevel {
    pub fn is_disabled(&self) -> bool {
        matches!(self, Self::None)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ConversationSettingsState {
    pub reasoning: ReasoningLevelState,
    pub model_list: ModelListState,
    pub available_modes: AvailableModeState,
}

impl ConversationSettingsState {
    pub fn from_conversation(conversation: &ConversationState) -> Self {
        Self {
            reasoning: ReasoningLevelState::from_conversation(conversation),
            model_list: ModelListState::from_conversation(conversation),
            available_modes: AvailableModeState::from_conversation(conversation),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReasoningLevelState {
    pub current_level: Option<String>,
    pub available_levels: Vec<String>,
    pub available_options: Vec<ReasoningLevelOption>,
    pub source: ReasoningLevelSource,
    pub config_option_id: Option<String>,
    pub can_set: bool,
}

impl ReasoningLevelState {
    pub fn from_conversation(conversation: &ConversationState) -> Self {
        if let Some(option) = find_reasoning_config_option(&conversation.config_options) {
            let context_level = conversation
                .context
                .reasoning
                .effective()
                .and_then(Option::as_ref)
                .and_then(|reasoning| reasoning.effort.clone());
            let available_options = reasoning_options_from_config(option);
            return Self {
                current_level: context_level.or_else(|| Some(option.current_value.clone())),
                available_levels: reasoning_option_values(&available_options),
                available_options,
                source: ReasoningLevelSource::ConfigOption,
                config_option_id: Some(option.id.clone()),
                can_set: true,
            };
        }

        let context_level = conversation
            .context
            .reasoning
            .effective()
            .and_then(Option::as_ref)
            .and_then(|reasoning| reasoning.effort.clone());

        let can_set = conversation.capabilities.context.config.is_supported();
        let source = if context_level.is_some() || can_set {
            ReasoningLevelSource::Context
        } else {
            ReasoningLevelSource::Unsupported
        };

        Self {
            current_level: context_level,
            available_levels: Vec::new(),
            available_options: Vec::new(),
            source,
            config_option_id: None,
            can_set,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReasoningLevelOption {
    pub value: String,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReasoningLevelSource {
    ConfigOption,
    Context,
    Unsupported,
}

impl ReasoningLevelSource {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ConfigOption => "configOption",
            Self::Context => "context",
            Self::Unsupported => "unsupported",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ModelListState {
    pub current_model_id: Option<String>,
    pub available_models: Vec<SessionModel>,
    pub config_option_id: Option<String>,
    pub can_set: bool,
}

impl ModelListState {
    pub fn from_conversation(conversation: &ConversationState) -> Self {
        let context_model = conversation
            .context
            .model
            .effective()
            .and_then(Option::as_ref)
            .cloned();

        if let Some(models) = &conversation.model_state {
            return Self {
                current_model_id: context_model.or_else(|| Some(models.current_model_id.clone())),
                available_models: models.available_models.clone(),
                config_option_id: None,
                can_set: true,
            };
        }

        if let Some(option) = find_model_config_option(&conversation.config_options) {
            return Self {
                current_model_id: context_model.or_else(|| Some(option.current_value.clone())),
                available_models: option
                    .values
                    .iter()
                    .map(|value| SessionModel {
                        id: value.value.clone(),
                        name: value.name.clone(),
                        description: value.description.clone(),
                    })
                    .collect(),
                config_option_id: Some(option.id.clone()),
                can_set: true,
            };
        }

        Self {
            current_model_id: context_model,
            available_models: Vec::new(),
            config_option_id: None,
            can_set: conversation.capabilities.context.config.is_supported(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AvailableModeState {
    pub current_mode_id: Option<String>,
    pub available_modes: Vec<SessionMode>,
    pub config_option_id: Option<String>,
    pub can_set: bool,
}

impl AvailableModeState {
    pub fn from_conversation(conversation: &ConversationState) -> Self {
        let context_mode = conversation
            .context
            .mode
            .effective()
            .and_then(Option::as_ref)
            .map(|mode| mode.id.clone());

        if let Some(modes) = &conversation.mode_state {
            return Self {
                current_mode_id: context_mode.or_else(|| Some(modes.current_mode_id.clone())),
                available_modes: modes.available_modes.clone(),
                config_option_id: None,
                can_set: true,
            };
        }

        if let Some(option) = find_mode_config_option(&conversation.config_options) {
            return Self {
                current_mode_id: context_mode.or_else(|| Some(option.current_value.clone())),
                available_modes: option
                    .values
                    .iter()
                    .map(|value| SessionMode {
                        id: value.value.clone(),
                        name: value.name.clone(),
                        description: value.description.clone(),
                    })
                    .collect(),
                config_option_id: Some(option.id.clone()),
                can_set: true,
            };
        }

        Self {
            current_mode_id: context_mode,
            available_modes: Vec::new(),
            config_option_id: None,
            can_set: conversation.capabilities.context.mode.is_supported()
                || conversation.capabilities.context.config.is_supported(),
        }
    }
}

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

pub(crate) fn find_model_config_option(
    options: &[SessionConfigOption],
) -> Option<&SessionConfigOption> {
    find_config_option(options, "model")
}

pub(crate) fn find_mode_config_option(
    options: &[SessionConfigOption],
) -> Option<&SessionConfigOption> {
    find_config_option(options, "mode")
}

pub(crate) fn find_reasoning_config_option(
    options: &[SessionConfigOption],
) -> Option<&SessionConfigOption> {
    find_config_option(options, "reasoning")
}

pub(crate) fn find_config_option<'a>(
    options: &'a [SessionConfigOption],
    category: &str,
) -> Option<&'a SessionConfigOption> {
    options
        .iter()
        .find(|option| option.category.as_deref() == Some(category))
}

fn reasoning_options_from_config(option: &SessionConfigOption) -> Vec<ReasoningLevelOption> {
    option
        .values
        .iter()
        .map(|value| ReasoningLevelOption {
            value: value.value.clone(),
            name: if value.name.is_empty() {
                label_from_config_value(&value.value)
            } else {
                value.name.clone()
            },
            description: value.description.clone(),
        })
        .collect()
}

fn reasoning_option_values(options: &[ReasoningLevelOption]) -> Vec<String> {
    options.iter().map(|option| option.value.clone()).collect()
}

fn label_from_config_value(value: &str) -> String {
    if value == "xhigh" {
        return "XHigh".to_string();
    }
    if value == "default" {
        return "Default".to_string();
    }

    value
        .split(['_', '-', ' '])
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
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
