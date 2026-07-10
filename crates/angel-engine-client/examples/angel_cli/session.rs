use std::env;
use std::error::Error;
use std::time::Duration;

use angel_engine_client::{
    AngelClient, ClientCommandResult, ConversationSnapshot, StartConversationRequest, ThreadEvent,
};
use test_cli::{is_quit_command, read_prompt_line};

use super::{MultiRuntimeCli, RuntimeKind};

impl MultiRuntimeCli {
    pub(super) fn spawn(runtime: RuntimeKind) -> Result<Self, Box<dyn Error>> {
        Ok(Self {
            printer: Default::default(),
            client: AngelClient::spawn(runtime.options())?,
            runtime,
            conversation_id: None,
        })
    }

    pub(super) fn initialize_and_start(&mut self) -> Result<(), Box<dyn Error>> {
        let request =
            StartConversationRequest::new().cwd(env::current_dir()?.display().to_string());
        let result = self.client.initialize_and_start(request)?;
        self.handle_update(result.update)?;
        self.conversation_id = result.conversation_id;
        if self.conversation_id.is_none() {
            return Err("start_thread did not return a conversation id".into());
        }
        self.print_banner()?;
        Ok(())
    }

    pub(super) fn run_repl(&mut self) -> Result<(), Box<dyn Error>> {
        while let Some(input) = read_prompt_line(self.runtime.prompt())? {
            let line = input.trim();
            if line.is_empty() {
                continue;
            }
            if is_quit_command(line) {
                break;
            }
            if line == "/commands" {
                self.print_available_command_list()?;
                continue;
            }
            if self.handle_setting_command(line)? {
                continue;
            }
            if let Some(command) = line.strip_prefix("/shell ") {
                if self.runtime.supports_shell() {
                    self.send_thread_event(ThreadEvent::shell(command.to_string()))?;
                    self.pump_until_no_activity(Duration::from_millis(250))?;
                    println!();
                } else {
                    println!("[warn] direct shell command is only available for codex");
                }
                continue;
            }

            self.run_turn(ThreadEvent::text(line.to_string()))?;
        }
        Ok(())
    }

    fn run_turn(&mut self, event: ThreadEvent) -> Result<(), Box<dyn Error>> {
        let result = self.send_thread_event(event)?;
        let request_id = result.request_id.clone();
        let message = result.message.clone();
        let request_completed = result.request_id.as_ref().is_some_and(|request_id| {
            result
                .update
                .completed_request_ids
                .iter()
                .any(|completed| completed == request_id)
        });
        let Some(turn_id) = result.turn_id else {
            if let Some(request_id) = request_id {
                self.wait_for_request(&request_id, request_completed)?;
                if let Some(message) = message {
                    println!("{message}");
                }
                println!();
            } else if let Some(message) = message {
                println!("{message}");
            }
            return Ok(());
        };
        let conversation_id = self.conversation_id()?;
        while !self.turn_is_terminal(&conversation_id, &turn_id) {
            if self.resolve_open_elicitation()? {
                continue;
            }
            self.process_next_update(None)?;
        }
        println!();
        Ok(())
    }

    fn wait_for_request(
        &mut self,
        request_id: &str,
        already_completed: bool,
    ) -> Result<(), Box<dyn Error>> {
        if already_completed {
            return Ok(());
        }
        loop {
            let Some(update) = self.client.next_update(None)? else {
                return Err("runtime channel closed before request completed".into());
            };
            let completed = update
                .completed_request_ids
                .iter()
                .any(|completed| completed == request_id);
            self.handle_update(update)?;
            if completed {
                return Ok(());
            }
        }
    }

    pub(super) fn send_thread_event(
        &mut self,
        event: ThreadEvent,
    ) -> Result<ClientCommandResult, Box<dyn Error>> {
        let conversation_id = self.conversation_id()?;
        let result = self.client.send_thread_event(conversation_id, event)?;
        self.handle_update(result.update.clone())?;
        Ok(result)
    }

    fn process_next_update(&mut self, timeout: Option<Duration>) -> Result<bool, Box<dyn Error>> {
        let Some(update) = self.client.next_update(timeout)? else {
            return Ok(false);
        };
        self.handle_update(update)?;
        Ok(true)
    }

    pub(super) fn pump_until_no_activity(
        &mut self,
        timeout: Duration,
    ) -> Result<(), Box<dyn Error>> {
        while self.process_next_update(Some(timeout))? {}
        Ok(())
    }

    pub(super) fn current_conversation(&self) -> Result<ConversationSnapshot, Box<dyn Error>> {
        let conversation_id = self.conversation_id()?;
        self.client
            .snapshot()
            .conversations
            .into_iter()
            .find(|conversation| conversation.id == conversation_id)
            .ok_or_else(|| "selected conversation missing".into())
    }

    pub(super) fn conversation_id(&self) -> Result<String, Box<dyn Error>> {
        self.conversation_id
            .clone()
            .ok_or_else(|| "conversation has not been started".into())
    }

    fn turn_is_terminal(&self, conversation_id: &str, turn_id: &str) -> bool {
        self.client
            .snapshot()
            .conversations
            .into_iter()
            .find(|conversation| conversation.id == conversation_id)
            .and_then(|conversation| {
                conversation
                    .turns
                    .into_iter()
                    .find(|turn| turn.id == turn_id)
            })
            .map(|turn| turn.is_terminal)
            .unwrap_or(false)
    }
}
