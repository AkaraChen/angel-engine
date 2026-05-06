use std::error::Error;
use std::time::Duration;

use angel_engine::{
    EngineCommand, EngineExtensionCommand, ProtocolFlavor, TurnOverrides, UserInput,
};
use angel_provider::ProtocolAdapter;
use test_cli::{is_quit_command, read_prompt_line};

use super::ProtocolShell;

impl<A> ProtocolShell<A>
where
    A: ProtocolAdapter,
{
    pub fn run_repl(&mut self) -> Result<(), Box<dyn Error>> {
        println!("{}", self.config.banner);
        if self.config.direct_shell {
            println!(
                "Type a message, /shell <command>, /model, /effort, /mode, /permission, or :quit."
            );
        } else {
            println!("Type a message, /model, /effort, /mode, /permission, or :quit.");
        }
        self.print_command_summary();

        loop {
            let Some(input) = read_prompt_line(self.config.prompt)? else {
                break;
            };
            let line = input.trim();
            if line.is_empty() {
                continue;
            }
            if is_quit_command(line) {
                break;
            }
            if line == "/commands" {
                self.print_available_commands();
                continue;
            }
            if self.handle_setting_command(line)? {
                continue;
            }

            if let Some(command) = line.strip_prefix("/shell ") {
                if self.config.direct_shell {
                    self.run_shell_command(command.to_string())?;
                } else {
                    println!("[warn] direct shell command is not available for this protocol");
                }
            } else if line.starts_with('/') {
                self.run_slash_command(line.to_string())?;
            } else {
                self.run_turn(line.to_string())?;
            }
        }
        Ok(())
    }

    fn run_shell_command(&mut self, command: String) -> Result<(), Box<dyn Error>> {
        let conversation_id = self.selected_conversation()?;
        let plan = self.engine.plan_command(EngineCommand::Extension(
            EngineExtensionCommand::RunShellCommand {
                conversation_id,
                command,
            },
        ))?;
        let request_id = plan.request_id.clone();
        self.send_plan(plan)?;

        loop {
            if self.resolve_open_elicitation()? {
                continue;
            }

            let request_done = request_id
                .as_ref()
                .map(|id| !self.engine.pending.requests.contains_key(id))
                .unwrap_or(true);
            let active_turns = self.selected_active_turn_count();
            if request_done && active_turns == 0 {
                if !self.process_next_line(Some(Duration::from_secs(1)))? {
                    break;
                }
                continue;
            }
            if active_turns > 0 {
                self.process_next_line(None)?;
            } else if !self.process_next_line(Some(Duration::from_millis(200)))? && request_done {
                break;
            }
        }
        println!();
        Ok(())
    }

    fn run_slash_command(&mut self, command_line: String) -> Result<(), Box<dyn Error>> {
        let command = command_line[1..].split_whitespace().next().unwrap_or("");
        let available_commands = self.selected_available_commands();
        if let Some(available) = available_commands
            .iter()
            .find(|available| available.name == command)
        {
            let has_input = command_line
                .strip_prefix(&format!("/{}", available.name))
                .map(str::trim)
                .is_some_and(|input| !input.is_empty());
            if !has_input && let Some(input) = &available.input {
                println!("[command] /{} {}", available.name, input.hint);
            }
        } else if !available_commands.is_empty() {
            println!("[warn] slash command /{command} was not advertised; sending anyway");
        }
        self.run_turn(command_line)
    }

    fn run_turn(&mut self, prompt: String) -> Result<(), Box<dyn Error>> {
        let conversation_id = self.selected_conversation()?;
        let plan = self.engine.plan_command(EngineCommand::StartTurn {
            conversation_id: conversation_id.clone(),
            input: vec![UserInput::text(prompt)],
            overrides: TurnOverrides::default(),
        })?;
        let turn_id = plan.turn_id.clone();
        self.send_plan(plan)?;

        while !turn_id
            .as_ref()
            .and_then(|turn_id| {
                self.engine
                    .selected
                    .as_ref()
                    .and_then(|id| self.engine.conversations.get(id))
                    .and_then(|conversation| conversation.turns.get(turn_id))
            })
            .map(|turn| turn.is_terminal())
            .unwrap_or(false)
        {
            if self.resolve_open_elicitation()? {
                continue;
            }
            self.process_next_line(None)?;
        }
        if let Some(turn_id) = turn_id.as_ref() {
            self.record_plan_file_from_turn_output(&conversation_id, turn_id);
            self.record_plan_output_completion_hint(&conversation_id, turn_id);
            self.print_plan_ready_hint_if_interactive()?;
        }
        println!();
        Ok(())
    }

    pub(super) fn current_model(&self) -> Option<String> {
        self.engine
            .selected
            .as_ref()
            .and_then(|id| self.engine.conversations.get(id))
            .and_then(|conversation| conversation.context.model.effective())
            .and_then(|model| model.clone())
    }

    pub(super) fn codex_mode_needs_model_warning(&self, value: &str) -> bool {
        self.config.protocol == ProtocolFlavor::CodexAppServer
            && matches!(value, "plan" | "default")
            && self.current_model().is_none()
    }
}
