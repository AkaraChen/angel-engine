use crate::error::EngineError;
use crate::event::{TransitionReport, UiEvent};
use crate::ids::{ConversationId, RemoteTurnId, TurnId};
use crate::state::{
    ActionPhase, ContentDelta, ConversationLifecycle, ElicitationPhase, TurnDisplayContentKind,
    TurnDisplayPart, TurnOutcome, TurnPhase, TurnState, UserInputRef,
};

use super::AngelEngine;
use super::event_helpers::{DeltaKind, handle_stale_with_policy, is_terminal_action_phase};

impl AngelEngine {
    pub(super) fn apply_turn_started(
        &mut self,
        conversation_id: ConversationId,
        turn_id: TurnId,
        remote: RemoteTurnId,
        input: Vec<UserInputRef>,
    ) -> Result<TransitionReport, EngineError> {
        let generation = self.generation;
        let conversation = self.conversation_mut(&conversation_id)?;
        if let Some(existing) = conversation.turns.get_mut(&turn_id) {
            existing.remote = remote;
            existing.input.extend(input);
            if !existing.is_terminal() {
                existing.phase = TurnPhase::Starting;
            }
        } else {
            let mut turn = TurnState::new(turn_id.clone(), remote, generation);
            turn.input = input;
            conversation.turns.insert(turn_id.clone(), turn);
        }
        conversation.active_turns.insert(turn_id.clone());
        conversation.focused_turn = Some(turn_id.clone());
        conversation.lifecycle = ConversationLifecycle::Active;
        Ok(TransitionReport::one(UiEvent::TurnChanged {
            conversation_id,
            turn_id,
        }))
    }

    pub(super) fn apply_content_delta(
        &mut self,
        conversation_id: ConversationId,
        turn_id: TurnId,
        delta: ContentDelta,
        kind: DeltaKind,
    ) -> Result<TransitionReport, EngineError> {
        let invalid_event_policy = self.policy.invalid_event_policy;
        let conversation = self.conversation_mut(&conversation_id)?;
        let turn =
            conversation
                .turns
                .get_mut(&turn_id)
                .ok_or_else(|| EngineError::TurnNotFound {
                    turn_id: turn_id.to_string(),
                })?;
        if turn.is_terminal() {
            return handle_stale_with_policy(
                invalid_event_policy,
                format!("delta arrived for terminal turn {turn_id}"),
            );
        }
        match kind {
            DeltaKind::Assistant => {
                let chunk_index = turn.output.chunks.len();
                turn.output.chunks.push(delta);
                turn.display_parts.push(TurnDisplayPart::Content {
                    kind: TurnDisplayContentKind::Assistant,
                    chunk_index,
                });
                turn.phase = TurnPhase::StreamingOutput;
            }
            DeltaKind::Reasoning => {
                let chunk_index = turn.reasoning.chunks.len();
                turn.reasoning.chunks.push(delta);
                turn.display_parts.push(TurnDisplayPart::Content {
                    kind: TurnDisplayContentKind::Reasoning,
                    chunk_index,
                });
                turn.phase = TurnPhase::Reasoning;
            }
            DeltaKind::Plan => {
                turn.plan_text.chunks.push(delta);
                append_turn_plan_display_part(turn);
                turn.phase = TurnPhase::Planning;
            }
        }
        Ok(TransitionReport::one(UiEvent::TurnChanged {
            conversation_id,
            turn_id,
        }))
    }

    pub(super) fn apply_turn_terminal(
        &mut self,
        conversation_id: ConversationId,
        turn_id: TurnId,
        outcome: TurnOutcome,
    ) -> Result<TransitionReport, EngineError> {
        let conversation = self.conversation_mut(&conversation_id)?;
        let turn =
            conversation
                .turns
                .get_mut(&turn_id)
                .ok_or_else(|| EngineError::TurnNotFound {
                    turn_id: turn_id.to_string(),
                })?;
        turn.phase = TurnPhase::Terminal(outcome.clone());
        turn.outcome = Some(outcome);
        turn.completed_at = Some(turn.completed_at.unwrap_or(turn.started_at + 1));
        conversation.active_turns.remove(&turn_id);
        if conversation.focused_turn.as_ref() == Some(&turn_id) {
            conversation.focused_turn = conversation.active_turns.iter().next_back().cloned();
        }

        for action in conversation.actions.values_mut() {
            if action.turn_id == turn_id && !is_terminal_action_phase(&action.phase) {
                action.phase = match action.phase {
                    ActionPhase::AwaitingDecision { .. } => ActionPhase::Cancelled,
                    _ => ActionPhase::Completed,
                };
            }
        }
        for elicitation in conversation.elicitations.values_mut() {
            if elicitation.turn_id.as_ref() == Some(&turn_id)
                && matches!(
                    elicitation.phase,
                    ElicitationPhase::Open | ElicitationPhase::Resolving
                )
            {
                elicitation.phase = ElicitationPhase::Cancelled;
            }
        }

        if conversation.active_turns.is_empty() {
            conversation.lifecycle = ConversationLifecycle::Idle;
        } else {
            conversation.lifecycle = ConversationLifecycle::Active;
        }
        Ok(TransitionReport::one(UiEvent::TurnChanged {
            conversation_id,
            turn_id,
        }))
    }
}

pub(super) fn append_turn_plan_display_part(turn: &mut TurnState) {
    if !turn
        .display_parts
        .iter()
        .any(|part| matches!(part, TurnDisplayPart::Plan))
    {
        turn.display_parts.push(TurnDisplayPart::Plan);
    }
}
