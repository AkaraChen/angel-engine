use crate::error::EngineError;
use crate::ids::ConversationId;
use crate::protocol::{ProtocolEffect, ProtocolMethod};
use crate::state::{ConversationLifecycle, HistoryMutationOp};

use super::{AngelEngine, CommandPlan, PendingRequest};

impl AngelEngine {
    pub(super) fn plan_mutate_history(
        &mut self,
        conversation_id: ConversationId,
        op: HistoryMutationOp,
    ) -> Result<CommandPlan, EngineError> {
        {
            let conversation = self.conversation(&conversation_id)?;
            match &op {
                HistoryMutationOp::Compact => conversation
                    .capabilities
                    .history
                    .compact
                    .require("history.compact")?,
                HistoryMutationOp::Rollback { .. } => conversation
                    .capabilities
                    .history
                    .rollback
                    .require("history.rollback")?,
                HistoryMutationOp::InjectItems { .. } => conversation
                    .capabilities
                    .history
                    .inject_items
                    .require("history.inject_items")?,
                HistoryMutationOp::ReplaceHistory => {}
            }
            if conversation.active_turn_count() > 0 {
                return Err(EngineError::InvalidState {
                    expected: "idle conversation".to_string(),
                    actual: "active turns present".to_string(),
                });
            }
        }
        let request_id = self.next_request_id();
        {
            let conversation = self.conversation_mut(&conversation_id)?;
            conversation.lifecycle = ConversationLifecycle::MutatingHistory { op: op.clone() };
        }
        self.pending.insert(
            request_id.clone(),
            PendingRequest::HistoryMutation {
                conversation_id: conversation_id.clone(),
            },
        )?;
        let effect = ProtocolEffect::new(self.protocol, self.method_history_mutation(&op))
            .request_id(request_id.clone())
            .conversation_id(conversation_id.clone());
        let effect = match op {
            HistoryMutationOp::Compact | HistoryMutationOp::ReplaceHistory => effect,
            HistoryMutationOp::Rollback { num_turns } => {
                effect.field("numTurns", num_turns.to_string())
            }
            HistoryMutationOp::InjectItems { count } => effect.field("count", count.to_string()),
        };
        Ok(CommandPlan {
            effects: vec![effect],
            conversation_id: Some(conversation_id),
            request_id: Some(request_id),
            ..CommandPlan::default()
        })
    }

    pub(super) fn plan_run_shell_command(
        &mut self,
        conversation_id: ConversationId,
        command: String,
    ) -> Result<CommandPlan, EngineError> {
        {
            let conversation = self.conversation(&conversation_id)?;
            if !conversation.is_loaded() {
                return Err(EngineError::InvalidState {
                    expected: "loaded conversation".to_string(),
                    actual: format!("{:?}", conversation.lifecycle),
                });
            }
            conversation
                .capabilities
                .history
                .shell_command
                .require("history.shell_command")?;
        }
        let request_id = self.next_request_id();
        self.pending.insert(
            request_id.clone(),
            PendingRequest::RunShellCommand {
                conversation_id: conversation_id.clone(),
            },
        )?;
        let effect = ProtocolEffect::new(self.protocol, ProtocolMethod::RunShellCommand)
            .request_id(request_id.clone())
            .conversation_id(conversation_id.clone())
            .field("command", command);
        Ok(CommandPlan {
            effects: vec![effect],
            conversation_id: Some(conversation_id),
            request_id: Some(request_id),
            ..CommandPlan::default()
        })
    }
}
