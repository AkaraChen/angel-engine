use angel_engine::{
    AvailableCommand, ConversationState, HistoryReplayEntry, HistoryRole, SessionUsageCost,
    SessionUsageState, Skill, SkillScope,
};
use serde::{Deserialize, Serialize};

use super::context_turn::ContentChunk;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailableCommandSnapshot {
    pub name: String,
    pub description: String,
    pub input_hint: Option<String>,
}

impl From<&AvailableCommand> for AvailableCommandSnapshot {
    fn from(command: &AvailableCommand) -> Self {
        Self {
            name: command.name.clone(),
            description: command.description.clone(),
            input_hint: command.input.as_ref().map(|input| input.hint.clone()),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsSnapshot {
    pub can_list: bool,
    pub can_mention: bool,
    pub skills: Vec<SkillSnapshot>,
}

impl SkillsSnapshot {
    pub(super) fn from_conversation(conversation: &ConversationState) -> Self {
        Self {
            can_list: conversation.capabilities.skills.list.is_supported(),
            can_mention: conversation.capabilities.skills.mention.is_supported(),
            skills: conversation
                .available_skills
                .iter()
                .map(SkillSnapshot::from)
                .collect(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillSnapshot {
    pub name: String,
    pub description: String,
    pub path: String,
    pub scope: SkillScopeSnapshot,
    pub enabled: bool,
}

impl From<&Skill> for SkillSnapshot {
    fn from(skill: &Skill) -> Self {
        Self {
            name: skill.name.clone(),
            description: skill.description.clone(),
            path: skill.path.clone(),
            scope: SkillScopeSnapshot::from(skill.scope),
            enabled: skill.enabled,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SkillScopeSnapshot {
    User,
    Repo,
    System,
    Admin,
}

impl From<SkillScope> for SkillScopeSnapshot {
    fn from(scope: SkillScope) -> Self {
        match scope {
            SkillScope::User => Self::User,
            SkillScope::Repo => Self::Repo,
            SkillScope::System => Self::System,
            SkillScope::Admin => Self::Admin,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionUsageSnapshot {
    pub used: u64,
    pub size: u64,
    pub cost: Option<SessionUsageCostSnapshot>,
}

impl From<&SessionUsageState> for SessionUsageSnapshot {
    fn from(usage: &SessionUsageState) -> Self {
        Self {
            used: usage.used,
            size: usage.size,
            cost: usage.cost.as_ref().map(SessionUsageCostSnapshot::from),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionUsageCostSnapshot {
    pub amount: String,
    pub currency: String,
}

impl From<&SessionUsageCost> for SessionUsageCostSnapshot {
    fn from(cost: &SessionUsageCost) -> Self {
        Self {
            amount: cost.amount.clone(),
            currency: cost.currency.clone(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistorySnapshot {
    pub hydrated: bool,
    pub turn_count: usize,
    pub replay: Vec<HistoryReplaySnapshot>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryReplaySnapshot {
    pub role: String,
    pub content: ContentChunk,
}

impl From<&HistoryReplayEntry> for HistoryReplaySnapshot {
    fn from(entry: &HistoryReplayEntry) -> Self {
        Self {
            role: match &entry.role {
                HistoryRole::User => "user".to_string(),
                HistoryRole::Assistant => "assistant".to_string(),
                HistoryRole::Reasoning => "reasoning".to_string(),
                HistoryRole::Tool => "tool".to_string(),
                HistoryRole::Unknown(value) => value.clone(),
            },
            content: ContentChunk::from(&entry.content),
        }
    }
}
