use crate::error::EngineError;
use crate::event::{TransitionReport, UiEvent};
use crate::ids::{ActionId, ConversationId};
use crate::state::{ActionPhase, ActionState, TurnPhase};

use super::AngelEngine;
use super::event_helpers::is_terminal_action_phase;

impl AngelEngine {
    pub(super) fn apply_action_observed(
        &mut self,
        conversation_id: ConversationId,
        action: ActionState,
    ) -> Result<TransitionReport, EngineError> {
        let action_id = action.id.clone();
        let turn_id = action.turn_id.clone();
        let conversation = self.conversation_mut(&conversation_id)?;
        if !conversation.turns.contains_key(&turn_id) {
            return Err(EngineError::TurnNotFound {
                turn_id: turn_id.to_string(),
            });
        }
        conversation.actions.insert(action_id.clone(), action);
        if let Some(turn) = conversation.turns.get_mut(&turn_id)
            && !turn.is_terminal()
        {
            turn.phase = TurnPhase::Acting {
                action_id: action_id.clone(),
            };
        }
        Ok(TransitionReport::one(UiEvent::ActionChanged {
            conversation_id,
            action_id,
        }))
    }

    pub(super) fn apply_action_updated(
        &mut self,
        conversation_id: ConversationId,
        action_id: ActionId,
        patch: crate::ActionPatch,
    ) -> Result<TransitionReport, EngineError> {
        let conversation = self.conversation_mut(&conversation_id)?;
        let action = conversation.actions.get_mut(&action_id).ok_or_else(|| {
            EngineError::ActionNotFound {
                action_id: action_id.to_string(),
            }
        })?;
        if let Some(phase) = patch.phase {
            action.phase = phase;
        }
        if let Some(output_delta) = patch.output_delta {
            action.output.chunks.push(output_delta);
            if !is_terminal_action_phase(&action.phase) {
                action.phase = ActionPhase::StreamingResult;
            }
        }
        if let Some(error) = patch.error {
            action.error = Some(error);
            action.phase = ActionPhase::Failed;
        }
        if let Some(title) = patch.title {
            action.title = Some(title);
        }
        Ok(TransitionReport::one(UiEvent::ActionChanged {
            conversation_id,
            action_id,
        }))
    }
}
