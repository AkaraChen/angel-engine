use crate::error::{EngineError, ErrorInfo};
use crate::event::{TransitionReport, UiEvent};
use crate::ids::ConversationId;
use crate::state::{
    ConversationLifecycle, HistoryMutationOp, HistoryMutationResult, HistoryReplayEntry,
    HistoryRole,
};

use super::AngelEngine;

impl AngelEngine {
    pub(super) fn apply_history_mutation_finished(
        &mut self,
        conversation_id: ConversationId,
        result: HistoryMutationResult,
    ) -> Result<TransitionReport, EngineError> {
        let conversation = self.conversation_mut(&conversation_id)?;
        conversation.history.workspace_reverted = Some(result.workspace_reverted);
        if result.success {
            conversation.lifecycle = ConversationLifecycle::Idle;
            conversation.history.replay.clear();
            conversation.history.turn_count = 0;
        } else {
            let Some(message) = result.message else {
                return Err(EngineError::InvalidCommand {
                    message: "failed history mutation result is missing message".to_string(),
                });
            };
            conversation.lifecycle =
                ConversationLifecycle::Faulted(ErrorInfo::new("history.mutation_failed", message));
        }
        Ok(TransitionReport::one(UiEvent::HistoryChanged(
            conversation_id,
        )))
    }

    pub(super) fn apply_history_mutation_started(
        &mut self,
        conversation_id: ConversationId,
        op: HistoryMutationOp,
    ) -> Result<TransitionReport, EngineError> {
        let conversation = self.conversation_mut(&conversation_id)?;
        conversation.lifecycle = ConversationLifecycle::MutatingHistory { op };
        Ok(TransitionReport::one(UiEvent::HistoryChanged(
            conversation_id,
        )))
    }

    pub(super) fn apply_history_replay_chunk(
        &mut self,
        conversation_id: ConversationId,
        entry: HistoryReplayEntry,
    ) -> Result<TransitionReport, EngineError> {
        if entry.role == HistoryRole::Tool {
            let Some(tool) = entry.tool.as_ref() else {
                return Err(EngineError::InvalidCommand {
                    message: "history tool replay entry is missing tool action".to_string(),
                });
            };
            if tool.id.as_deref().is_none_or(str::is_empty) {
                return Err(EngineError::InvalidCommand {
                    message: "history tool replay entry is missing tool id".to_string(),
                });
            }
        }
        let conversation = self.conversation_mut(&conversation_id)?;
        if entry.role == HistoryRole::User {
            conversation.history.turn_count += 1;
        }
        conversation.history.replay.push(entry);
        Ok(TransitionReport::one(UiEvent::HistoryChanged(
            conversation_id,
        )))
    }
}
