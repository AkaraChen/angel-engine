use angel_engine::{
    AvailableModeState, ConversationSettingsState, ModelListState, ReasoningLevelOption,
    ReasoningLevelState, SessionMode, SessionModel,
};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadSettingsSnapshot {
    pub reasoning_level: ReasoningLevelSettingSnapshot,
    pub model_list: ModelListSettingSnapshot,
    pub available_modes: AvailableModeSettingSnapshot,
}

impl ThreadSettingsSnapshot {
    pub(crate) fn from_conversation(conversation: &angel_engine::ConversationState) -> Self {
        ConversationSettingsState::from_conversation(conversation).into()
    }
}

impl From<ConversationSettingsState> for ThreadSettingsSnapshot {
    fn from(settings: ConversationSettingsState) -> Self {
        Self {
            reasoning_level: settings.reasoning.into(),
            model_list: settings.model_list.into(),
            available_modes: settings.available_modes.into(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReasoningLevelSettingSnapshot {
    pub current_level: Option<String>,
    pub available_levels: Vec<String>,
    pub available_options: Vec<ReasoningLevelOptionSnapshot>,
    pub source: String,
    pub config_option_id: Option<String>,
    pub can_set: bool,
}

impl From<ReasoningLevelState> for ReasoningLevelSettingSnapshot {
    fn from(reasoning: ReasoningLevelState) -> Self {
        let current_level = reasoning.current_level;
        Self {
            available_options: reasoning
                .available_options
                .iter()
                .map(|option| {
                    ReasoningLevelOptionSnapshot::from_option(option, current_level.as_deref())
                })
                .collect(),
            available_levels: reasoning.available_levels,
            source: reasoning.source.as_str().to_string(),
            config_option_id: reasoning.config_option_id,
            can_set: reasoning.can_set,
            current_level,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReasoningLevelOptionSnapshot {
    pub value: String,
    pub label: String,
    pub description: Option<String>,
    pub selected: bool,
}

impl ReasoningLevelOptionSnapshot {
    fn from_option(option: &ReasoningLevelOption, current_level: Option<&str>) -> Self {
        Self {
            value: option.value.clone(),
            label: option.name.clone(),
            description: option.description.clone(),
            selected: current_level == Some(option.value.as_str()),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelListSettingSnapshot {
    pub current_model_id: Option<String>,
    pub available_models: Vec<ModelOptionSnapshot>,
    pub config_option_id: Option<String>,
    pub can_set: bool,
}

impl From<ModelListState> for ModelListSettingSnapshot {
    fn from(model_list: ModelListState) -> Self {
        let current_model_id = model_list.current_model_id;
        Self {
            available_models: model_list
                .available_models
                .iter()
                .map(|model| ModelOptionSnapshot::from_model(model, current_model_id.as_deref()))
                .collect(),
            config_option_id: model_list.config_option_id,
            can_set: model_list.can_set,
            current_model_id,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailableModeSettingSnapshot {
    pub current_mode_id: Option<String>,
    pub available_modes: Vec<ModeOptionSnapshot>,
    pub config_option_id: Option<String>,
    pub can_set: bool,
}

impl From<AvailableModeState> for AvailableModeSettingSnapshot {
    fn from(available_modes: AvailableModeState) -> Self {
        let current_mode_id = available_modes.current_mode_id;
        Self {
            available_modes: available_modes
                .available_modes
                .iter()
                .map(|mode| ModeOptionSnapshot::from_mode(mode, current_mode_id.as_deref()))
                .collect(),
            config_option_id: available_modes.config_option_id,
            can_set: available_modes.can_set,
            current_mode_id,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelOptionSnapshot {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub selected: bool,
}

impl ModelOptionSnapshot {
    fn from_model(model: &SessionModel, current_model_id: Option<&str>) -> Self {
        Self {
            id: model.id.clone(),
            name: model.name.clone(),
            description: model.description.clone(),
            selected: current_model_id == Some(model.id.as_str()),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModeOptionSnapshot {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub selected: bool,
}

impl ModeOptionSnapshot {
    fn from_mode(mode: &SessionMode, current_mode_id: Option<&str>) -> Self {
        Self {
            id: mode.id.clone(),
            name: mode.name.clone(),
            description: mode.description.clone(),
            selected: current_mode_id == Some(mode.id.as_str()),
        }
    }
}
