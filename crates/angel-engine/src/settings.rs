use crate::command::EngineCommand;
use crate::error::EngineError;
use crate::event::{EngineEvent, TransitionReport};
use crate::ids::ConversationId;
use crate::protocol::ProtocolFlavor;
use crate::reducer::{AngelEngine, CommandPlan};
use crate::state::{
    AgentMode, ContextPatch, ContextScope, ContextUpdate, ConversationState, ReasoningProfile,
    SessionConfigOption, SessionMode, SessionModeState, SessionModel, SessionModelState,
};

const CODEX_REASONING_LEVELS: &[&str] = &["none", "minimal", "low", "medium", "high", "xhigh"];

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ConversationSettingsState {
    pub reasoning: ReasoningLevelState,
    pub model_list: ModelListState,
    pub available_modes: AvailableModeState,
}

impl ConversationSettingsState {
    pub fn from_conversation(protocol: ProtocolFlavor, conversation: &ConversationState) -> Self {
        Self {
            reasoning: ReasoningLevelState::from_conversation(protocol, conversation),
            model_list: ModelListState::from_conversation(protocol, conversation),
            available_modes: AvailableModeState::from_conversation(protocol, conversation),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReasoningLevelState {
    pub current_level: Option<String>,
    pub available_levels: Vec<String>,
    pub source: ReasoningLevelSource,
    pub config_option_id: Option<String>,
    pub can_set: bool,
}

impl ReasoningLevelState {
    pub fn from_conversation(protocol: ProtocolFlavor, conversation: &ConversationState) -> Self {
        if let Some(option) = find_reasoning_config_option(&conversation.config_options) {
            return Self {
                current_level: Some(option.current_value.clone()),
                available_levels: option
                    .values
                    .iter()
                    .map(|value| value.value.clone())
                    .collect(),
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

        if protocol == ProtocolFlavor::CodexAppServer {
            return Self {
                current_level: context_level,
                available_levels: CODEX_REASONING_LEVELS
                    .iter()
                    .map(ToString::to_string)
                    .collect(),
                source: ReasoningLevelSource::CodexDefaults,
                config_option_id: None,
                can_set: true,
            };
        }

        if let Some(inferred_level) = model_variant_reasoning_level(conversation) {
            return Self {
                current_level: context_level.or(Some(inferred_level)),
                available_levels: vec!["none".to_string(), "thinking".to_string()],
                source: ReasoningLevelSource::ModelVariant,
                config_option_id: None,
                can_set: true,
            };
        }

        Self {
            current_level: context_level,
            available_levels: Vec::new(),
            source: ReasoningLevelSource::Unsupported,
            config_option_id: None,
            can_set: false,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReasoningLevelSource {
    ConfigOption,
    CodexDefaults,
    ModelVariant,
    Unsupported,
}

impl ReasoningLevelSource {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ConfigOption => "configOption",
            Self::CodexDefaults => "codexDefaults",
            Self::ModelVariant => "modelVariant",
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
    pub fn from_conversation(protocol: ProtocolFlavor, conversation: &ConversationState) -> Self {
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
            can_set: protocol == ProtocolFlavor::CodexAppServer,
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
    pub fn from_conversation(protocol: ProtocolFlavor, conversation: &ConversationState) -> Self {
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

        if protocol == ProtocolFlavor::CodexAppServer {
            return Self {
                current_mode_id: Some(context_mode.unwrap_or_else(|| "default".to_string())),
                available_modes: vec![
                    SessionMode {
                        id: "default".to_string(),
                        name: "Default".to_string(),
                        description: None,
                    },
                    SessionMode {
                        id: "plan".to_string(),
                        name: "Plan".to_string(),
                        description: Some("Plan before making changes.".to_string()),
                    },
                ],
                config_option_id: None,
                can_set: true,
            };
        }

        Self {
            current_mode_id: context_mode,
            available_modes: Vec::new(),
            config_option_id: None,
            can_set: false,
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
        Ok(ConversationSettingsState::from_conversation(
            self.protocol,
            conversation,
        ))
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
        let mut reasoning = self.current_reasoning_profile(&conversation_id)?;
        reasoning.effort = Some(level.into());
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
        self.plan_command(EngineCommand::UpdateContext {
            conversation_id: conversation_id.into(),
            patch: ContextPatch::one(ContextUpdate::Model {
                scope: ContextScope::TurnAndFuture,
                model: Some(model.into()),
            }),
        })
    }

    pub fn set_model_list(
        &mut self,
        conversation_id: impl Into<ConversationId>,
        model: impl Into<String>,
    ) -> Result<CommandPlan, EngineError> {
        self.set_model(conversation_id, model)
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

    pub fn set_mode(
        &mut self,
        conversation_id: impl Into<ConversationId>,
        mode: impl Into<String>,
    ) -> Result<CommandPlan, EngineError> {
        self.plan_command(EngineCommand::UpdateContext {
            conversation_id: conversation_id.into(),
            patch: ContextPatch::one(ContextUpdate::Mode {
                scope: ContextScope::TurnAndFuture,
                mode: Some(AgentMode { id: mode.into() }),
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
    find_config_option(options, "model", &["model"])
}

pub(crate) fn find_mode_config_option(
    options: &[SessionConfigOption],
) -> Option<&SessionConfigOption> {
    find_config_option(options, "mode", &["mode"])
}

pub(crate) fn find_reasoning_config_option(
    options: &[SessionConfigOption],
) -> Option<&SessionConfigOption> {
    find_config_option(
        options,
        "thought_level",
        &[
            "thought_level",
            "reasoning",
            "reasoning_effort",
            "effort",
            "thinking",
            "thought",
        ],
    )
}

pub(crate) fn find_config_option<'a>(
    options: &'a [SessionConfigOption],
    category: &str,
    ids: &[&str],
) -> Option<&'a SessionConfigOption> {
    options
        .iter()
        .find(|option| option.category.as_deref() == Some(category))
        .or_else(|| {
            options.iter().find(|option| {
                ids.iter()
                    .any(|id| option.id.eq_ignore_ascii_case(id) || normalized_eq(&option.id, id))
            })
        })
        .or_else(|| {
            options.iter().find(|option| {
                let name = normalize_name(&option.name);
                ids.iter().any(|id| name == normalize_name(id))
            })
        })
}

pub(crate) fn thinking_model_for_level(
    conversation: &ConversationState,
    level: &str,
) -> Option<String> {
    const THINKING_SUFFIX: &str = ",thinking";

    let models = conversation.model_state.as_ref()?;
    let current = models.current_model_id.as_str();
    let target = if disables_reasoning(level) {
        current.strip_suffix(THINKING_SUFFIX).map(str::to_string)?
    } else if current.ends_with(THINKING_SUFFIX) {
        return None;
    } else {
        format!("{current}{THINKING_SUFFIX}")
    };

    models
        .available_models
        .iter()
        .any(|model| model.id == target)
        .then_some(target)
}

fn model_variant_reasoning_level(conversation: &ConversationState) -> Option<String> {
    const THINKING_SUFFIX: &str = ",thinking";

    let models = conversation.model_state.as_ref()?;
    let current = models.current_model_id.as_str();
    if current.ends_with(THINKING_SUFFIX) {
        let base = current.strip_suffix(THINKING_SUFFIX)?;
        return models
            .available_models
            .iter()
            .any(|model| model.id == base)
            .then(|| "thinking".to_string());
    }

    models
        .available_models
        .iter()
        .any(|model| model.id == format!("{current}{THINKING_SUFFIX}"))
        .then(|| "none".to_string())
}

fn disables_reasoning(level: &str) -> bool {
    matches!(
        level.to_ascii_lowercase().as_str(),
        "none" | "off" | "false" | "disabled" | "disable"
    )
}

fn normalized_eq(left: &str, right: &str) -> bool {
    normalize_name(left) == normalize_name(right)
}

fn normalize_name(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}
