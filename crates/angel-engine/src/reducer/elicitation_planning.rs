use crate::error::EngineError;
use crate::ids::{ConversationId, ElicitationId};
use crate::protocol::ProtocolEffect;
use crate::state::{ElicitationDecision, ElicitationPhase};

use super::{AngelEngine, CommandPlan, PendingRequest};

impl AngelEngine {
    pub(super) fn plan_resolve_elicitation(
        &mut self,
        conversation_id: ConversationId,
        elicitation_id: ElicitationId,
        decision: ElicitationDecision,
    ) -> Result<CommandPlan, EngineError> {
        {
            let conversation = self.conversation_mut(&conversation_id)?;
            let elicitation = conversation
                .elicitations
                .get_mut(&elicitation_id)
                .ok_or_else(|| EngineError::ElicitationNotFound {
                    elicitation_id: elicitation_id.to_string(),
                })?;
            if !matches!(elicitation.phase, ElicitationPhase::Open) {
                return Err(EngineError::InvalidState {
                    expected: "open elicitation".to_string(),
                    actual: format!("{:?}", elicitation.phase),
                });
            }
            elicitation.phase = ElicitationPhase::Resolving;
        }
        let request_id = self.next_request_id();
        self.pending.insert(
            request_id.clone(),
            PendingRequest::ResolveElicitation {
                conversation_id: conversation_id.clone(),
                elicitation_id: elicitation_id.clone(),
            },
        )?;
        let mut effect = ProtocolEffect::new(self.protocol, self.method_resolve_elicitation())
            .request_id(request_id.clone())
            .conversation_id(conversation_id.clone())
            .field("elicitationId", elicitation_id.to_string());
        match &decision {
            ElicitationDecision::Answers(answers) => {
                effect = effect
                    .field("decision", "Answers")
                    .field("answerCount", answers.len().to_string());
                for (index, answer) in answers.iter().enumerate() {
                    effect = effect
                        .field(format!("answer.{index}.id"), answer.id.clone())
                        .field(format!("answer.{index}.value"), answer.value.clone());
                }
            }
            _ => {
                effect = effect.field("decision", format!("{decision:?}"));
            }
        }
        Ok(CommandPlan {
            effects: vec![effect],
            conversation_id: Some(conversation_id),
            request_id: Some(request_id),
            ..CommandPlan::default()
        })
    }
}
