use crate::error::EngineError;
use crate::event::{TransitionReport, UiEvent};
use crate::ids::{ConversationId, ElicitationId};
use crate::state::{
    ActionPhase, ConversationLifecycle, ElicitationDecision, ElicitationPhase, ElicitationState,
    TurnPhase,
};

use super::AngelEngine;

impl AngelEngine {
    pub(super) fn apply_elicitation_opened(
        &mut self,
        conversation_id: ConversationId,
        elicitation: ElicitationState,
    ) -> Result<TransitionReport, EngineError> {
        let elicitation_id = elicitation.id.clone();
        let turn_id = elicitation.turn_id.clone();
        let action_id = elicitation.action_id.clone();
        let conversation = self.conversation_mut(&conversation_id)?;
        if let Some(action_id) = action_id {
            let action = conversation.actions.get_mut(&action_id).ok_or_else(|| {
                EngineError::ActionNotFound {
                    action_id: action_id.to_string(),
                }
            })?;
            action.phase = ActionPhase::AwaitingDecision {
                elicitation_id: elicitation_id.clone(),
            };
        }
        if let Some(turn_id) = turn_id {
            let turn =
                conversation
                    .turns
                    .get_mut(&turn_id)
                    .ok_or_else(|| EngineError::TurnNotFound {
                        turn_id: turn_id.to_string(),
                    })?;
            if !turn.is_terminal() {
                turn.phase = TurnPhase::AwaitingUser {
                    elicitation_id: elicitation_id.clone(),
                };
            }
        }
        conversation
            .elicitations
            .insert(elicitation_id.clone(), elicitation);
        conversation.lifecycle = ConversationLifecycle::Active;
        Ok(TransitionReport::one(UiEvent::ElicitationChanged {
            conversation_id,
            elicitation_id,
        }))
    }

    pub(super) fn apply_elicitation_resolved(
        &mut self,
        conversation_id: ConversationId,
        elicitation_id: ElicitationId,
        decision: ElicitationDecision,
    ) -> Result<TransitionReport, EngineError> {
        let conversation = self.conversation_mut(&conversation_id)?;
        let elicitation = conversation
            .elicitations
            .get_mut(&elicitation_id)
            .ok_or_else(|| EngineError::ElicitationNotFound {
                elicitation_id: elicitation_id.to_string(),
            })?;
        elicitation.phase = ElicitationPhase::Resolved {
            decision: decision.clone(),
        };
        if let Some(action_id) = elicitation.action_id.clone()
            && let Some(action) = conversation.actions.get_mut(&action_id)
        {
            action.phase = match decision {
                ElicitationDecision::Allow
                | ElicitationDecision::AllowForSession
                | ElicitationDecision::Answers(_)
                | ElicitationDecision::DynamicToolResult { success: true }
                | ElicitationDecision::PermissionGrant { .. }
                | ElicitationDecision::ExternalComplete => ActionPhase::Running,
                ElicitationDecision::Deny
                | ElicitationDecision::DynamicToolResult { success: false } => {
                    ActionPhase::Declined
                }
                ElicitationDecision::Cancel => ActionPhase::Cancelled,
                ElicitationDecision::Raw(_) => ActionPhase::Running,
            };
        }
        if let Some(turn_id) = elicitation.turn_id.clone()
            && let Some(turn) = conversation.turns.get_mut(&turn_id)
            && !turn.is_terminal()
        {
            turn.phase = TurnPhase::Reasoning;
        }
        Ok(TransitionReport::one(UiEvent::ElicitationChanged {
            conversation_id,
            elicitation_id,
        }))
    }
}
