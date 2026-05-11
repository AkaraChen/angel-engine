use std::collections::{BTreeMap, BTreeSet};

use crate::capabilities::ConversationCapabilities;
use crate::error::ErrorInfo;
use crate::ids::{ActionId, ConversationId, ElicitationId, RemoteConversationId, TurnId};

use super::*;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub enum ConversationLifecycle {
    Discovered,
    Provisioning { op: ProvisionOp },
    Hydrating { source: HydrationSource },
    Idle,
    Active,
    Cancelling { turn_id: TurnId },
    MutatingHistory { op: HistoryMutationOp },
    Archived,
    Closing,
    Closed,
    Faulted(ErrorInfo),
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProvisionOp {
    New,
    Load,
    Resume,
    Fork,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub enum HydrationSource {
    Load,
    Resume,
    Read,
    Imported,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct ConversationState {
    pub id: ConversationId,
    pub remote: RemoteConversationId,
    pub lifecycle: ConversationLifecycle,
    pub active_turns: BTreeSet<TurnId>,
    pub focused_turn: Option<TurnId>,
    pub turns: BTreeMap<TurnId, TurnState>,
    pub actions: BTreeMap<ActionId, ActionState>,
    pub elicitations: BTreeMap<ElicitationId, ElicitationState>,
    pub context: EffectiveContext,
    pub history: HistoryState,
    pub observer: ObserverState,
    pub available_commands: Vec<AvailableCommand>,
    pub config_options: Vec<SessionConfigOption>,
    pub mode_state: Option<SessionModeState>,
    pub model_state: Option<SessionModelState>,
    pub usage_state: Option<SessionUsageState>,
    pub capabilities: ConversationCapabilities,
    pub generation: u64,
}

impl ConversationState {
    pub fn new(
        id: ConversationId,
        remote: RemoteConversationId,
        lifecycle: ConversationLifecycle,
        capabilities: ConversationCapabilities,
    ) -> Self {
        Self {
            id,
            remote,
            lifecycle,
            active_turns: BTreeSet::new(),
            focused_turn: None,
            turns: BTreeMap::new(),
            actions: BTreeMap::new(),
            elicitations: BTreeMap::new(),
            context: EffectiveContext::default(),
            history: HistoryState::default(),
            observer: ObserverState::default(),
            available_commands: Vec::new(),
            config_options: Vec::new(),
            mode_state: None,
            model_state: None,
            usage_state: None,
            capabilities,
            generation: 0,
        }
    }

    pub fn active_turn_count(&self) -> usize {
        self.active_turns.len()
    }

    pub fn primary_active_turn(&self) -> Option<&TurnId> {
        self.focused_turn
            .as_ref()
            .filter(|turn_id| self.active_turns.contains(*turn_id))
            .or_else(|| self.active_turns.iter().next_back())
    }

    pub fn is_loaded(&self) -> bool {
        !matches!(
            self.lifecycle,
            ConversationLifecycle::Discovered
                | ConversationLifecycle::Provisioning { .. }
                | ConversationLifecycle::Hydrating { .. }
                | ConversationLifecycle::Closed
        )
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct AvailableCommand {
    pub name: String,
    pub description: String,
    pub input: Option<AvailableCommandInput>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct AvailableCommandInput {
    pub hint: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct SessionConfigOption {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub current_value: String,
    pub values: Vec<SessionConfigValue>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct SessionConfigValue {
    pub value: String,
    pub name: String,
    pub description: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct SessionModeState {
    pub current_mode_id: String,
    pub available_modes: Vec<SessionMode>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct SessionMode {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct SessionModelState {
    pub current_model_id: String,
    pub available_models: Vec<SessionModel>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct SessionModel {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct SessionUsageState {
    pub used: u64,
    pub size: u64,
    pub cost: Option<SessionUsageCost>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct SessionUsageCost {
    pub amount: String,
    pub currency: String,
}
