use angel_engine::ConversationState;
use serde::{Deserialize, Serialize};

use crate::settings::ThreadSettingsSnapshot;

use super::catalog_history::{
    AvailableCommandSnapshot, HistoryReplaySnapshot, HistorySnapshot, SessionUsageSnapshot,
    SkillsSnapshot,
};
use super::context_turn::{ActionSnapshot, ContextSnapshot, TurnSnapshot};
use super::display::DisplayMessageSnapshot;
use super::elicitation::ElicitationSnapshot;
use super::labels::lifecycle_label;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationSnapshot {
    pub id: String,
    pub remote_id: Option<String>,
    pub remote_kind: String,
    pub lifecycle: String,
    pub active_turn_ids: Vec<String>,
    pub focused_turn_id: Option<String>,
    pub context: ContextSnapshot,
    pub turns: Vec<TurnSnapshot>,
    pub actions: Vec<ActionSnapshot>,
    pub messages: Vec<DisplayMessageSnapshot>,
    pub elicitations: Vec<ElicitationSnapshot>,
    pub history: HistorySnapshot,
    pub agent_state: AgentStateSnapshot,
    pub settings: ThreadSettingsSnapshot,
    pub available_commands: Vec<AvailableCommandSnapshot>,
    pub skills: SkillsSnapshot,
    pub usage: Option<SessionUsageSnapshot>,
}

pub(crate) fn conversation_snapshot(conversation: &ConversationState) -> ConversationSnapshot {
    let (remote_kind, remote_id) = match &conversation.remote {
        angel_engine::RemoteConversationId::Known(value) => {
            ("known".to_string(), Some(value.clone()))
        }
        angel_engine::RemoteConversationId::Pending(value) => {
            ("pending".to_string(), Some(value.clone()))
        }
        angel_engine::RemoteConversationId::Local(value) => {
            ("local".to_string(), Some(value.clone()))
        }
    };
    let turns = conversation
        .turns
        .values()
        .map(TurnSnapshot::from)
        .collect::<Vec<_>>();
    let actions = conversation
        .actions
        .values()
        .map(ActionSnapshot::from)
        .collect::<Vec<_>>();
    let history_replay = conversation
        .history
        .replay
        .iter()
        .map(HistoryReplaySnapshot::from)
        .collect::<Vec<_>>();
    let context = ContextSnapshot::from(&conversation.context);
    let settings = ThreadSettingsSnapshot::from_conversation(conversation);
    let agent_state = AgentStateSnapshot::from_context_and_settings(&context, &settings);
    ConversationSnapshot {
        id: conversation.id.to_string(),
        remote_id,
        remote_kind,
        lifecycle: lifecycle_label(&conversation.lifecycle),
        active_turn_ids: conversation
            .active_turns
            .iter()
            .map(ToString::to_string)
            .collect(),
        focused_turn_id: conversation.focused_turn.as_ref().map(ToString::to_string),
        context,
        messages: angel_engine::conversation_display_messages(conversation)
            .iter()
            .map(DisplayMessageSnapshot::from)
            .collect(),
        turns,
        actions,
        elicitations: conversation
            .elicitations
            .values()
            .map(ElicitationSnapshot::from)
            .collect(),
        history: HistorySnapshot {
            hydrated: conversation.history.hydrated,
            turn_count: conversation.history.turn_count,
            replay: history_replay,
        },
        agent_state,
        settings,
        available_commands: conversation
            .available_commands
            .iter()
            .map(AvailableCommandSnapshot::from)
            .collect(),
        skills: SkillsSnapshot::from_conversation(conversation),
        usage: conversation
            .usage_state
            .as_ref()
            .map(SessionUsageSnapshot::from),
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStateSnapshot {
    pub current_mode: Option<String>,
    pub current_permission_mode: Option<String>,
}

impl AgentStateSnapshot {
    fn from_context_and_settings(
        context: &ContextSnapshot,
        settings: &ThreadSettingsSnapshot,
    ) -> Self {
        let current_mode = settings
            .available_modes
            .current_mode_id
            .clone()
            .or_else(|| context.mode.clone());
        let current_permission_mode = settings
            .permission_modes
            .current_mode_id
            .clone()
            .or_else(|| context.permission_mode.clone());
        Self {
            current_mode,
            current_permission_mode,
        }
    }
}
