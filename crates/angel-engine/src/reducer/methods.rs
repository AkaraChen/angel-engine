use crate::capabilities::CapabilitySupport;
use crate::error::EngineError;
use crate::ids::ConversationId;
use crate::protocol::ProtocolMethod;
use crate::state::HistoryMutationOp;

use super::AngelEngine;

impl AngelEngine {
    pub(super) fn method_initialize(&self) -> ProtocolMethod {
        ProtocolMethod::Initialize
    }

    pub(super) fn method_authenticate(&self) -> ProtocolMethod {
        ProtocolMethod::Authenticate
    }

    pub(super) fn method_list_conversations(&self) -> ProtocolMethod {
        ProtocolMethod::ListConversations
    }

    pub(super) fn method_start_conversation(&self) -> ProtocolMethod {
        ProtocolMethod::StartConversation
    }

    pub(super) fn method_resume_conversation(&self, _load_history: bool) -> ProtocolMethod {
        ProtocolMethod::ResumeConversation
    }

    pub(super) fn method_fork_conversation(&self) -> ProtocolMethod {
        ProtocolMethod::ForkConversation
    }

    pub(super) fn method_start_turn(&self) -> ProtocolMethod {
        ProtocolMethod::StartTurn
    }

    pub(super) fn method_steer_turn(
        &self,
        conversation_id: &ConversationId,
    ) -> Result<ProtocolMethod, EngineError> {
        let conversation = self.conversation(conversation_id)?;
        match &conversation.capabilities.turn.steer {
            CapabilitySupport::Extension { name } => Ok(ProtocolMethod::Extension(name.clone())),
            CapabilitySupport::Supported => Ok(ProtocolMethod::SteerTurn),
            other => Err(EngineError::CapabilityUnsupported {
                capability: format!("turn.steer ({other:?})"),
            }),
        }
    }

    pub(super) fn method_cancel_turn(&self) -> ProtocolMethod {
        ProtocolMethod::CancelTurn
    }

    pub(super) fn method_resolve_elicitation(&self) -> ProtocolMethod {
        ProtocolMethod::ResolveElicitation
    }

    pub(super) fn method_history_mutation(&self, op: &HistoryMutationOp) -> ProtocolMethod {
        match op {
            HistoryMutationOp::Compact => ProtocolMethod::CompactHistory,
            HistoryMutationOp::Rollback { .. } => ProtocolMethod::RollbackHistory,
            HistoryMutationOp::InjectItems { .. } => ProtocolMethod::InjectHistoryItems,
            HistoryMutationOp::ReplaceHistory => {
                ProtocolMethod::Extension("history/mutate".to_string())
            }
        }
    }

    pub(super) fn method_close_conversation(&self) -> ProtocolMethod {
        ProtocolMethod::CloseConversation
    }

    pub(super) fn method_unsubscribe(&self) -> ProtocolMethod {
        ProtocolMethod::Unsubscribe
    }

    pub(super) fn method_archive_conversation(&self, archive: bool) -> ProtocolMethod {
        if archive {
            ProtocolMethod::ArchiveConversation
        } else {
            ProtocolMethod::UnarchiveConversation
        }
    }
}
