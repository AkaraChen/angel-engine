use std::error::Error;
use std::io::{self, Write};

use angel_engine::{
    ConversationId, ElicitationDecision, ElicitationKind, ElicitationPhase, ElicitationState,
    EngineCommand, ProtocolTransport, UserAnswer, UserQuestion,
};

use super::ProtocolShell;

impl<A> ProtocolShell<A>
where
    A: ProtocolTransport,
{
    pub(super) fn resolve_open_elicitation(&mut self) -> Result<bool, Box<dyn Error>> {
        let Some((conversation_id, elicitation)) = self.next_open_elicitation() else {
            return Ok(false);
        };

        if matches!(elicitation.kind, ElicitationKind::UserInput) {
            self.resolve_user_input_elicitation(conversation_id, elicitation)?;
            return Ok(true);
        }

        println!(
            "[approval] {}",
            elicitation
                .options
                .title
                .clone()
                .unwrap_or_else(|| "approval requested".to_string())
        );
        if let Some(body) = elicitation.options.body.clone()
            && !body.is_empty()
        {
            println!("[approval] {body}");
        }
        if !elicitation.options.choices.is_empty() {
            println!(
                "[approval] options: {}",
                elicitation.options.choices.join(", ")
            );
        }
        print!("Allow? [y]es/[s]ession/[n]o/[c]ancel: ");
        io::stdout().flush()?;

        let input = read_stdin_line()?;
        let decision = match input.trim().to_ascii_lowercase().as_str() {
            "y" | "yes" | "allow" => ElicitationDecision::Allow,
            "s" | "session" | "always" => ElicitationDecision::AllowForSession,
            "c" | "cancel" => ElicitationDecision::Cancel,
            _ => ElicitationDecision::Deny,
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
        if elicitation.options.questions.is_empty() {
            if let Some(body) = &elicitation.options.body
                && !body.is_empty()
            {
                println!("[input] {body}");
            }
            print!("Type your answer, or :cancel to cancel: ");
            io::stdout().flush()?;
            let input = read_stdin_line()?;
            if input.trim() == ":cancel" {
                return Ok(None);
            }
            return Ok(Some(vec![UserAnswer {
                id: "answer".to_string(),
                value: input.trim().to_string(),
            }]));
        }

        let mut answers = Vec::new();
        for question in &elicitation.options.questions {
            print_question(question);
            if question.options.is_empty() {
                print!("Type your answer, or :cancel to cancel: ");
            } else {
                print!(
                    "Choose 1-{} (or exact option text); use commas for multiple; :cancel to cancel: ",
                    question.options.len()
                );
            }
            io::stdout().flush()?;
            let input = read_stdin_line()?;
            if input.trim() == ":cancel" {
                return Ok(None);
            }
            let values = answer_values(question, input.trim());
            if values.is_empty() {
                answers.push(UserAnswer {
                    id: question.id.clone(),
                    value: String::new(),
                });
            } else {
                answers.extend(values.into_iter().map(|value| UserAnswer {
                    id: question.id.clone(),
                    value,
                }));
            }
        }
        Ok(Some(answers))
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

fn print_question(question: &UserQuestion) {
    if !question.header.is_empty() {
        println!("[input] {}", question.header);
    }
    println!("[input] {}", question.question);
    for (index, option) in question.options.iter().enumerate() {
        if option.description.is_empty() {
            println!("[input] {}. {}", index + 1, option.label);
        } else {
            println!(
                "[input] {}. {} - {}",
                index + 1,
                option.label,
                option.description
            );
        }
    }
}

fn answer_values(question: &UserQuestion, input: &str) -> Vec<String> {
    if question.options.is_empty() {
        return if input.is_empty() {
            Vec::new()
        } else {
            vec![input.to_string()]
        };
    }

    input
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| {
            value
                .parse::<usize>()
                .ok()
                .and_then(|index| index.checked_sub(1))
                .and_then(|index| question.options.get(index))
                .map(|option| option.label.clone())
                .unwrap_or_else(|| value.to_string())
        })
        .collect()
}

fn read_stdin_line() -> io::Result<String> {
    let mut input = String::new();
    if io::stdin().read_line(&mut input)? == 0 {
        input.clear();
    }
    Ok(input)
}

#[cfg(test)]
mod tests {
    use super::*;
    use angel_engine::UserQuestionOption;

    #[test]
    fn answer_values_maps_numbered_choices_and_free_text() {
        let question = UserQuestion {
            id: "path".to_string(),
            header: "Plan path".to_string(),
            question: "Where should the plan be saved?".to_string(),
            is_secret: false,
            is_other: false,
            options: vec![
                UserQuestionOption {
                    label: "plans/plan.md".to_string(),
                    description: "Use the plans folder".to_string(),
                },
                UserQuestionOption {
                    label: "PLAN.md".to_string(),
                    description: "Use the repository root".to_string(),
                },
            ],
        };

        assert_eq!(
            answer_values(&question, "1, PLAN.md"),
            vec!["plans/plan.md".to_string(), "PLAN.md".to_string()]
        );
    }
}
