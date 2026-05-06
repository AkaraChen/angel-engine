use std::error::Error;

use angel_engine::{
    ConversationId, ElicitationDecision, ElicitationKind, ElicitationPhase, ElicitationState,
    EngineCommand, UserAnswer,
};
use angel_provider::ProtocolAdapter;
use test_cli::{
    ApprovalChoice, CliAnswer, CliQuestion, CliQuestionOption, prompt_answers, prompt_approval,
};

use super::ProtocolShell;

impl<A> ProtocolShell<A>
where
    A: ProtocolAdapter,
{
    pub(super) fn resolve_open_elicitation(&mut self) -> Result<bool, Box<dyn Error>> {
        let Some((conversation_id, elicitation)) = self.next_open_elicitation() else {
            return Ok(false);
        };

        if matches!(elicitation.kind, ElicitationKind::UserInput) {
            self.resolve_user_input_elicitation(conversation_id, elicitation)?;
            return Ok(true);
        }

        let decision = match prompt_approval(
            elicitation.options.title.as_deref(),
            elicitation.options.body.as_deref(),
            &elicitation.options.choices,
        )? {
            ApprovalChoice::Allow => ElicitationDecision::Allow,
            ApprovalChoice::AllowForSession => ElicitationDecision::AllowForSession,
            ApprovalChoice::Deny => ElicitationDecision::Deny,
            ApprovalChoice::Cancel => ElicitationDecision::Cancel,
        };
        let plan = self
            .engine
            .plan_command(EngineCommand::ResolveElicitation {
                conversation_id,
                elicitation_id: elicitation.id,
                decision,
            })?;
        self.send_plan(plan)?;
        Ok(true)
    }

    fn resolve_user_input_elicitation(
        &mut self,
        conversation_id: ConversationId,
        elicitation: ElicitationState,
    ) -> Result<(), Box<dyn Error>> {
        println!(
            "[input] {}",
            elicitation
                .options
                .title
                .clone()
                .unwrap_or_else(|| "input requested".to_string())
        );
        let decision = match self.read_user_answers(&elicitation)? {
            Some(answers) => ElicitationDecision::Answers(answers),
            None => ElicitationDecision::Cancel,
        };
        let plan = self
            .engine
            .plan_command(EngineCommand::ResolveElicitation {
                conversation_id,
                elicitation_id: elicitation.id,
                decision,
            })?;
        self.send_plan(plan)?;
        Ok(())
    }

    fn read_user_answers(
        &mut self,
        elicitation: &ElicitationState,
    ) -> Result<Option<Vec<UserAnswer>>, Box<dyn Error>> {
        Ok(prompt_answers(
            elicitation.options.title.as_deref(),
            elicitation.options.body.as_deref(),
            &elicitation
                .options
                .questions
                .iter()
                .map(cli_question)
                .collect::<Vec<_>>(),
        )?
        .map(to_user_answers))
    }

    fn next_open_elicitation(&self) -> Option<(ConversationId, ElicitationState)> {
        let conversation_id = self.engine.selected.as_ref()?;
        let conversation = self.engine.conversations.get(conversation_id)?;
        conversation
            .elicitations
            .values()
            .find(|elicitation| matches!(elicitation.phase, ElicitationPhase::Open))
            .map(|elicitation| (conversation_id.clone(), elicitation.clone()))
    }
}

fn cli_question(question: &angel_engine::UserQuestion) -> CliQuestion {
    CliQuestion {
        id: question.id.clone(),
        header: question.header.clone(),
        question: question.question.clone(),
        options: question
            .options
            .iter()
            .map(|option| CliQuestionOption {
                label: option.label.clone(),
                description: option.description.clone(),
            })
            .collect(),
    }
}

fn to_user_answers(answers: Vec<CliAnswer>) -> Vec<UserAnswer> {
    answers
        .into_iter()
        .map(|answer| UserAnswer {
            id: answer.id,
            value: answer.value,
        })
        .collect()
}
