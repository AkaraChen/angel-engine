use crate::command::GoalStatus;
use crate::error::EngineError;
use crate::ids::ConversationId;
use crate::protocol::{ProtocolEffect, ProtocolMethod};

use super::{AngelEngine, CommandPlan, PendingRequest};

impl AngelEngine {
    pub(super) fn plan_set_goal(
        &mut self,
        conversation_id: ConversationId,
        objective: String,
    ) -> Result<CommandPlan, EngineError> {
        if objective.trim().is_empty() {
            return Err(EngineError::InvalidCommand {
                message: "goal objective must not be empty".to_string(),
            });
        }
        self.plan_goal_mutation(
            conversation_id,
            ProtocolMethod::SetGoal,
            Some(("objective", objective)),
        )
    }

    pub(super) fn plan_set_goal_status(
        &mut self,
        conversation_id: ConversationId,
        status: GoalStatus,
    ) -> Result<CommandPlan, EngineError> {
        self.plan_goal_mutation(
            conversation_id,
            ProtocolMethod::SetGoal,
            Some(("status", goal_status_id(status).to_string())),
        )
    }

    pub(super) fn plan_clear_goal(
        &mut self,
        conversation_id: ConversationId,
    ) -> Result<CommandPlan, EngineError> {
        self.plan_goal_mutation(conversation_id, ProtocolMethod::ClearGoal, None)
    }

    fn plan_goal_mutation(
        &mut self,
        conversation_id: ConversationId,
        method: ProtocolMethod,
        field: Option<(&str, String)>,
    ) -> Result<CommandPlan, EngineError> {
        let conversation = self.conversation(&conversation_id)?;
        if !conversation.is_loaded() {
            return Err(EngineError::InvalidState {
                expected: "loaded conversation".to_string(),
                actual: format!("{:?}", conversation.lifecycle),
            });
        }

        let request_id = self.next_request_id();
        self.pending.insert(
            request_id.clone(),
            PendingRequest::GoalMutation {
                conversation_id: conversation_id.clone(),
            },
        )?;
        let effect = ProtocolEffect::new(self.protocol, method)
            .request_id(request_id.clone())
            .conversation_id(conversation_id.clone());
        let effect = match field {
            Some((key, value)) => effect.field(key, value),
            None => effect,
        };

        Ok(CommandPlan {
            effects: vec![effect],
            conversation_id: Some(conversation_id),
            request_id: Some(request_id),
            ..CommandPlan::default()
        })
    }
}

fn goal_status_id(status: GoalStatus) -> &'static str {
    match status {
        GoalStatus::Active => "active",
        GoalStatus::Paused => "paused",
        GoalStatus::Blocked => "blocked",
        GoalStatus::UsageLimited => "usage_limited",
        GoalStatus::BudgetLimited => "budget_limited",
        GoalStatus::Complete => "complete",
    }
}
