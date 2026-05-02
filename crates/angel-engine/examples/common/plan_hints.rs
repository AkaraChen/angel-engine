use std::io;

use angel_engine::{
    ContentDelta, ConversationId, ConversationLifecycle, ConversationState, EngineEvent,
    ProtocolTransport, TurnId,
};

use super::ProtocolShell;

#[derive(Clone, Debug)]
pub(super) struct PlanReadyHint {
    pub(super) conversation_id: ConversationId,
    pub(super) turn_id: Option<TurnId>,
    pub(super) location: Option<String>,
    pub(super) exit_command: String,
}

impl<A> ProtocolShell<A>
where
    A: ProtocolTransport,
{
    pub(super) fn plan_ready_hints(
        &self,
        output: &angel_engine::TransportOutput,
    ) -> Vec<PlanReadyHint> {
        output
            .events
            .iter()
            .filter_map(|event| match event {
                EngineEvent::PlanPathUpdated {
                    conversation_id,
                    turn_id,
                    path,
                } => Some(PlanReadyHint {
                    conversation_id: conversation_id.clone(),
                    turn_id: Some(turn_id.clone()),
                    location: Some(path.clone()),
                    exit_command: self.plan_exit_command(conversation_id),
                }),
                EngineEvent::AssistantDelta {
                    conversation_id,
                    turn_id,
                    delta: ContentDelta::Text(text),
                } => extract_plan_file_path(text).map(|location| PlanReadyHint {
                    conversation_id: conversation_id.clone(),
                    turn_id: Some(turn_id.clone()),
                    location: Some(location),
                    exit_command: self.plan_exit_command(conversation_id),
                }),
                _ => None,
            })
            .collect()
    }

    pub(super) fn record_plan_file_from_turn_output(
        &mut self,
        conversation_id: &ConversationId,
        turn_id: &TurnId,
    ) {
        let Some(conversation) = self.engine.conversations.get(conversation_id) else {
            return;
        };
        let Some(turn) = conversation.turns.get(turn_id) else {
            return;
        };
        let text = turn
            .output
            .chunks
            .iter()
            .filter_map(|delta| match delta {
                ContentDelta::Text(text) => Some(text.as_str()),
                _ => None,
            })
            .collect::<String>();
        if let Some(location) = extract_plan_file_path(&text) {
            self.queue_plan_ready_hint(PlanReadyHint {
                conversation_id: conversation_id.clone(),
                turn_id: Some(turn_id.clone()),
                location: Some(location),
                exit_command: self.plan_exit_command(conversation_id),
            });
        }
    }

    pub(super) fn record_plan_output_completion_hint(
        &mut self,
        conversation_id: &ConversationId,
        turn_id: &TurnId,
    ) {
        if !self.conversation_mode_is_plan(conversation_id) {
            return;
        }
        let Some(conversation) = self.engine.conversations.get(conversation_id) else {
            return;
        };
        let Some(turn) = conversation.turns.get(turn_id) else {
            return;
        };
        let text = turn
            .output
            .chunks
            .iter()
            .filter_map(|delta| match delta {
                ContentDelta::Text(text) => Some(text.as_str()),
                _ => None,
            })
            .collect::<String>();
        let has_structured_plan = turn.plan.is_some() || !turn.plan_text.chunks.is_empty();
        if !has_structured_plan && !looks_like_plan_output(&text) {
            return;
        }
        self.queue_plan_ready_hint(PlanReadyHint {
            conversation_id: conversation_id.clone(),
            turn_id: Some(turn_id.clone()),
            location: None,
            exit_command: self.plan_exit_command(conversation_id),
        });
    }

    pub(super) fn queue_plan_ready_hint(&mut self, hint: PlanReadyHint) {
        if !self
            .printed_plan_ready_hints
            .contains(&plan_ready_hint_key(&hint))
        {
            self.pending_plan_ready_hint = Some(hint);
        }
    }

    pub(super) fn print_plan_ready_hint_if_interactive(&mut self) -> io::Result<()> {
        let Some(hint) = self.pending_plan_ready_hint.clone() else {
            return Ok(());
        };
        if !self.plan_ready_hint_is_interactive(&hint) {
            return Ok(());
        }
        let key = plan_ready_hint_key(&hint);
        if !self.printed_plan_ready_hints.insert(key) {
            self.pending_plan_ready_hint = None;
            return Ok(());
        }
        if let Some(location) = &hint.location {
            println!(
                "[hint] Plan ready at {location}. Review it, then run `{}` to exit plan mode.",
                hint.exit_command
            );
        } else {
            println!(
                "[hint] Plan turn completed. Review the plan output, then run `{}` to exit plan mode.",
                hint.exit_command
            );
        }
        self.pending_plan_ready_hint = None;
        Ok(())
    }

    fn plan_ready_hint_is_interactive(&self, hint: &PlanReadyHint) -> bool {
        let Some(conversation) = self.engine.conversations.get(&hint.conversation_id) else {
            return false;
        };
        if let Some(turn_id) = &hint.turn_id {
            return conversation
                .turns
                .get(turn_id)
                .map(|turn| turn.is_terminal())
                .unwrap_or_else(|| conversation.active_turn_count() == 0);
        }
        conversation.active_turn_count() == 0
            && matches!(conversation.lifecycle, ConversationLifecycle::Idle)
    }

    fn plan_exit_command(&self, conversation_id: &ConversationId) -> String {
        let Some(conversation) = self.engine.conversations.get(conversation_id) else {
            return "/mode default".to_string();
        };
        if self.conversation_mode_is_plan(conversation_id) {
            if let Some(mode_id) = non_plan_mode_id(conversation) {
                return format!("/mode {mode_id}");
            }
            return "/mode default".to_string();
        }
        if conversation
            .available_commands
            .iter()
            .any(|command| command.name == "plan")
        {
            return "/plan off".to_string();
        }
        "/mode default".to_string()
    }

    fn conversation_mode_is_plan(&self, conversation_id: &ConversationId) -> bool {
        self.engine
            .conversations
            .get(conversation_id)
            .and_then(|conversation| conversation.context.mode.effective())
            .and_then(|mode| mode.as_ref())
            .is_some_and(|mode| mode.id == "plan")
    }
}

fn extract_plan_file_path(text: &str) -> Option<String> {
    text.lines().find_map(|line| {
        let (_, location) = line.split_once("Plan file:")?;
        let location = location.trim().trim_matches('`');
        (!location.is_empty()).then(|| location.to_string())
    })
}

fn looks_like_plan_output(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    lower.contains("plan")
        && (lower.contains("1.") || lower.contains("- ") || lower.contains("step"))
}

fn plan_ready_hint_key(hint: &PlanReadyHint) -> String {
    format!(
        "{}:{}:{}",
        hint.conversation_id,
        hint.turn_id
            .as_ref()
            .map(ToString::to_string)
            .unwrap_or_default(),
        hint.location.as_deref().unwrap_or("plan-output")
    )
}

fn non_plan_mode_id(conversation: &ConversationState) -> Option<String> {
    let modes = conversation.mode_state.as_ref()?;
    ["default", "build"]
        .iter()
        .find_map(|preferred| {
            modes
                .available_modes
                .iter()
                .find(|mode| mode.id == *preferred)
        })
        .or_else(|| modes.available_modes.iter().find(|mode| mode.id != "plan"))
        .map(|mode| mode.id.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_plan_file_path_reads_shell_output_location() {
        assert_eq!(
            extract_plan_file_path("Plan mode ON\nPlan file: /tmp/angel-plan.md\n"),
            Some("/tmp/angel-plan.md".to_string())
        );
        assert_eq!(extract_plan_file_path("Plan mode OFF\n"), None);
    }

    #[test]
    fn looks_like_plan_output_requires_plan_and_steps() {
        assert!(looks_like_plan_output("Plan\n1. Inspect\n2. Write"));
        assert!(looks_like_plan_output("Plan:\n- Inspect\n- Write"));
        assert!(!looks_like_plan_output("Reply with OK only."));
    }
}
