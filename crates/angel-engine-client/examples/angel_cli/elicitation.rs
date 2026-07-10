use std::error::Error;

use angel_engine_client::{
    ClientAnswer, ElicitationResponse, ElicitationSnapshot, QuestionSnapshot, ThreadEvent,
};
use test_cli::{
    ApprovalChoice, CliAnswer, CliQuestion, CliQuestionOption, prompt_answers, prompt_approval,
};

use super::MultiRuntimeCli;

impl MultiRuntimeCli {
    pub(super) fn resolve_open_elicitation(&mut self) -> Result<bool, Box<dyn Error>> {
        let conversation_id = self.conversation_id()?;
        let Some(elicitation) = self
            .client
            .open_elicitations(&conversation_id)?
            .first()
            .cloned()
        else {
            return Ok(false);
        };
        let response = if elicitation.kind == "userInput" || !elicitation.questions.is_empty() {
            self.read_user_input_response(&elicitation)?
        } else {
            self.read_approval_response(&elicitation)?
        };
        let result = self.client.send_thread_event(
            conversation_id,
            ThreadEvent::resolve(elicitation.id, response),
        )?;
        self.handle_update(result.update)?;
        Ok(true)
    }

    fn read_approval_response(
        &self,
        elicitation: &ElicitationSnapshot,
    ) -> Result<ElicitationResponse, Box<dyn Error>> {
        Ok(
            match prompt_approval(
                elicitation.title.as_deref(),
                elicitation.body.as_deref(),
                &elicitation.choices,
            )? {
                ApprovalChoice::Allow => ElicitationResponse::Allow,
                ApprovalChoice::AllowForSession => ElicitationResponse::AllowForSession,
                ApprovalChoice::Deny => ElicitationResponse::Deny,
                ApprovalChoice::Cancel => ElicitationResponse::Cancel,
            },
        )
    }

    fn read_user_input_response(
        &self,
        elicitation: &ElicitationSnapshot,
    ) -> Result<ElicitationResponse, Box<dyn Error>> {
        Ok(
            match prompt_answers(
                elicitation.title.as_deref(),
                elicitation.body.as_deref(),
                &elicitation
                    .questions
                    .iter()
                    .map(cli_question)
                    .collect::<Vec<_>>(),
            )? {
                Some(answers) => ElicitationResponse::answers(to_client_answers(answers)),
                None => ElicitationResponse::Cancel,
            },
        )
    }
}

fn cli_question(question: &QuestionSnapshot) -> CliQuestion {
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

fn to_client_answers(answers: Vec<CliAnswer>) -> Vec<ClientAnswer> {
    answers
        .into_iter()
        .map(|answer| ClientAnswer::new(answer.id, answer.value))
        .collect()
}
