use angel_engine::{ConversationLifecycle, ConversationState, ElicitationPhase, TurnState};
use angel_provider::ProtocolAdapter;

use crate::error::ClientResult;
use crate::settings::{
    AvailableModeSettingSnapshot, AvailablePermissionModeSettingSnapshot, ModelListSettingSnapshot,
    ReasoningLevelSettingSnapshot, ThreadSettingsSnapshot,
};
use crate::snapshot::{ElicitationSnapshot, TurnSnapshot};

use super::AngelClientCore;
use super::resolution::{
    resolve_mode_request, resolve_permission_mode_request, to_conversation_id, to_turn_id,
};
use super::types::ClientCommandResult;

impl<A> AngelClientCore<A>
where
    A: ProtocolAdapter,
{
    pub fn set_model(
        &mut self,
        conversation_id: impl Into<String>,
        model: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        let plan = self
            .engine
            .set_model(to_conversation_id(conversation_id), model.into())?;
        self.apply_plan(plan)
    }

    pub fn set_mode(
        &mut self,
        conversation_id: impl Into<String>,
        mode: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        let conversation_id = to_conversation_id(conversation_id);
        let settings = self.engine.get_available_modes(conversation_id.clone())?;
        let mode = resolve_mode_request(&settings, &mode.into())?;
        let plan = self.engine.set_mode(conversation_id, mode)?;
        self.apply_plan(plan)
    }

    pub fn set_permission_mode(
        &mut self,
        conversation_id: impl Into<String>,
        mode: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        let conversation_id = to_conversation_id(conversation_id);
        let settings = self.engine.get_permission_modes(conversation_id.clone())?;
        let mode = resolve_permission_mode_request(&settings, &mode.into())?;
        let plan = self.engine.set_permission_mode(conversation_id, mode)?;
        self.apply_plan(plan)
    }

    pub fn set_reasoning_level(
        &mut self,
        conversation_id: impl Into<String>,
        level: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        let plan = self
            .engine
            .set_reasoning_level(to_conversation_id(conversation_id), level.into())?;
        self.apply_plan(plan)
    }

    pub fn set_reasoning_effort(
        &mut self,
        conversation_id: impl Into<String>,
        effort: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        self.set_reasoning_level(conversation_id, effort)
    }
    pub fn conversation_is_idle(&self, conversation_id: &str) -> bool {
        self.conversation(conversation_id)
            .is_some_and(|conversation| {
                matches!(conversation.lifecycle, ConversationLifecycle::Idle)
            })
    }

    pub fn turn_is_terminal(&self, conversation_id: &str, turn_id: &str) -> bool {
        self.turn(conversation_id, turn_id)
            .is_some_and(TurnState::is_terminal)
    }

    pub fn turn_snapshot(&self, conversation_id: &str, turn_id: &str) -> Option<TurnSnapshot> {
        self.turn(conversation_id, turn_id).map(TurnSnapshot::from)
    }

    pub fn open_elicitations(
        &self,
        conversation_id: &str,
    ) -> ClientResult<Vec<ElicitationSnapshot>> {
        let conversation =
            self.conversation(conversation_id)
                .ok_or_else(|| crate::ClientError::InvalidInput {
                    message: format!("conversation {conversation_id} does not exist"),
                })?;
        Ok(conversation
            .elicitations
            .values()
            .filter(|elicitation| matches!(elicitation.phase, ElicitationPhase::Open))
            .map(ElicitationSnapshot::from)
            .collect())
    }

    pub fn thread_settings(
        &self,
        conversation_id: impl Into<String>,
    ) -> ClientResult<ThreadSettingsSnapshot> {
        Ok(self
            .engine
            .conversation_settings(to_conversation_id(conversation_id))?
            .into())
    }

    pub fn reasoning_level(
        &self,
        conversation_id: impl Into<String>,
    ) -> ClientResult<ReasoningLevelSettingSnapshot> {
        Ok(self
            .engine
            .get_reasoning_level(to_conversation_id(conversation_id))?
            .into())
    }

    pub fn model_list(
        &self,
        conversation_id: impl Into<String>,
    ) -> ClientResult<ModelListSettingSnapshot> {
        Ok(self
            .engine
            .get_model_list(to_conversation_id(conversation_id))?
            .into())
    }

    pub(crate) fn hydrate_model_catalog_from_runtime_debug(
        &mut self,
        conversation_id: impl Into<String>,
        result: &serde_json::Value,
    ) -> ClientResult<()> {
        let conversation_id = conversation_id.into();
        let current_model_id = self
            .engine
            .get_model_list(to_conversation_id(conversation_id.clone()))?
            .current_model_id;

        let Some(models) = self
            .adapter
            .model_catalog_from_runtime_debug(result, current_model_id.as_deref())
        else {
            return Ok(());
        };
        self.engine
            .hydrate_model_list(to_conversation_id(conversation_id), models)?;
        Ok(())
    }

    pub(crate) fn needs_runtime_model_catalog(
        &self,
        conversation_id: impl Into<String>,
    ) -> ClientResult<bool> {
        let model_list = self
            .engine
            .get_model_list(to_conversation_id(conversation_id))?;
        Ok(model_list.can_set && model_list.available_models.is_empty())
    }

    pub fn available_modes(
        &self,
        conversation_id: impl Into<String>,
    ) -> ClientResult<AvailableModeSettingSnapshot> {
        Ok(self
            .engine
            .get_available_modes(to_conversation_id(conversation_id))?
            .into())
    }

    pub fn permission_modes(
        &self,
        conversation_id: impl Into<String>,
    ) -> ClientResult<AvailablePermissionModeSettingSnapshot> {
        Ok(self
            .engine
            .get_permission_modes(to_conversation_id(conversation_id))?
            .into())
    }

    fn conversation(&self, conversation_id: &str) -> Option<&ConversationState> {
        self.engine
            .conversations
            .get(&to_conversation_id(conversation_id))
    }

    fn turn(&self, conversation_id: &str, turn_id: &str) -> Option<&TurnState> {
        self.conversation(conversation_id)?
            .turns
            .get(&to_turn_id(turn_id))
    }
}
