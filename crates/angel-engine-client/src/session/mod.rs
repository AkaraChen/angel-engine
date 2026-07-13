use crate::{AngelClient, RuntimeOptions};

use active_turn::ActiveTurn;

mod active_turn;
mod commands;
mod helpers;
mod lifecycle;
mod turn_collector;
mod types;

#[cfg(test)]
mod tests;

#[allow(unused_imports)]
pub use types::TurnRunDeltaPart;
pub use types::{
    HydrateRequest, InspectRequest, RefreshSkillsRequest, SendTextRequest, SetModeRequest,
    SetPermissionModeRequest, TurnRunEvent, TurnRunResult,
};

pub struct AngelSession {
    client: AngelClient,
    options: RuntimeOptions,
    conversation_id: Option<String>,
    active_turn: Option<ActiveTurn>,
}

impl AngelSession {
    pub fn process_id(&self) -> u32 {
        self.client.process_id()
    }
}
