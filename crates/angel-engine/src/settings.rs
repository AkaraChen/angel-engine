use crate::state::{
    ConversationState, SessionConfigOption, SessionMode, SessionModel, SessionPermissionMode,
};
use strum::Display;

mod commands;

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
    pub fn is_disabled(&self) -> bool {
        matches!(self, Self::None)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ConversationSettingsState {
    pub reasoning: ReasoningLevelState,
    pub model_list: ModelListState,
    pub available_modes: AvailableModeState,
    pub permission_modes: AvailablePermissionModeState,
}

impl ConversationSettingsState {
    pub fn from_conversation(conversation: &ConversationState) -> Self {
        Self {
            reasoning: ReasoningLevelState::from_conversation(conversation),
            model_list: ModelListState::from_conversation(conversation),
            available_modes: AvailableModeState::from_conversation(conversation),
            permission_modes: AvailablePermissionModeState::from_conversation(conversation),
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
            can_set: conversation.capabilities.context.mode.is_supported(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AvailablePermissionModeState {
    pub current_mode_id: Option<String>,
    pub available_modes: Vec<SessionPermissionMode>,
    pub config_option_id: Option<String>,
    pub can_set: bool,
}

impl AvailablePermissionModeState {
    pub fn from_conversation(conversation: &ConversationState) -> Self {
        let context_mode = conversation
            .context
            .permission_mode
            .effective()
            .and_then(Option::as_ref)
            .map(|mode| mode.id.clone());

        if let Some(modes) = &conversation.permission_mode_state {
            return Self {
                current_mode_id: context_mode.or_else(|| Some(modes.current_mode_id.clone())),
                available_modes: modes.available_modes.clone(),
                config_option_id: None,
                can_set: true,
            };
        }

        if let Some(option) = find_permission_mode_config_option(&conversation.config_options) {
            return Self {
                current_mode_id: context_mode.or_else(|| Some(option.current_value.clone())),
                available_modes: option
                    .values
                    .iter()
                    .map(|value| SessionPermissionMode {
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
            can_set: false,
        }
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

pub(crate) fn find_permission_mode_config_option(
    options: &[SessionConfigOption],
) -> Option<&SessionConfigOption> {
    find_config_option(options, "permissionMode")
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
