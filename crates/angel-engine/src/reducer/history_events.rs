use crate::error::{EngineError, ErrorInfo};
use crate::event::{TransitionReport, UiEvent};
use crate::ids::ConversationId;
use crate::state::{ConversationLifecycle, HistoryMutationResult};

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
        } else {
            conversation.lifecycle = ConversationLifecycle::Faulted(ErrorInfo::new(
                "history.mutation_failed",
                result
                    .message
                    .unwrap_or_else(|| "history mutation failed".to_string()),
            ));
        }
        Ok(TransitionReport::one(UiEvent::HistoryChanged(
            conversation_id,
        )))
    }
}
