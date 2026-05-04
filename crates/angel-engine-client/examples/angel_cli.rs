use std::env;
use std::error::Error;
use std::time::Duration;

use angel_engine_client::{
    AngelClient, AvailableCommandSnapshot, ClientAnswer, ClientCommandResult, ClientEvent,
    ClientLog, ClientOptions, ClientStreamDelta, ClientUpdate, ConversationSnapshot,
    ElicitationResponse, ElicitationSnapshot, QuestionSnapshot, ReasoningOptionsSnapshot,
    SessionConfigOptionSnapshot, StartConversationRequest, ThreadEvent,
};
use test_cli::{
    ApprovalChoice, CliAnswer, CliCommandInfo, CliQuestion, CliQuestionOption, InlinePrinter,
    InlineStreamKind, TaggedLog, TaggedLogKind, is_quit_command, print_available_commands,
    print_command_summary, prompt_answers, prompt_approval, read_prompt_line,
};

fn main() -> Result<(), Box<dyn Error>> {
    let runtime = RuntimeKind::from_arg(env::args().nth(1).as_deref())?;
    let mut cli = MultiRuntimeCli::spawn(runtime)?;
    cli.initialize_and_start()?;
    cli.run_repl()
}

struct MultiRuntimeCli {
    printer: InlinePrinter,
    client: AngelClient,
    runtime: RuntimeKind,
    conversation_id: Option<String>,
}

impl MultiRuntimeCli {
    fn spawn(runtime: RuntimeKind) -> Result<Self, Box<dyn Error>> {
        Ok(Self {
            printer: Default::default(),
            client: AngelClient::spawn(runtime.options())?,
            runtime,
            conversation_id: None,
        })
    }

    fn initialize_and_start(&mut self) -> Result<(), Box<dyn Error>> {
        let request =
            StartConversationRequest::new().cwd(env::current_dir()?.display().to_string());
        let result = self.client.initialize_and_start(Some(request))?;
        self.handle_update(result.update)?;
        self.conversation_id = result.conversation_id;
        if self.conversation_id.is_none() {
            return Err("start_thread did not return a conversation id".into());
        }
        self.print_banner();
        Ok(())
    }

    fn run_repl(&mut self) -> Result<(), Box<dyn Error>> {
        loop {
            let Some(input) = read_prompt_line(self.runtime.prompt())? else {
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
                self.print_available_command_list();
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
        let Some(turn_id) = result.turn_id else {
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

    fn send_thread_event(
        &mut self,
        event: ThreadEvent,
    ) -> Result<ClientCommandResult, Box<dyn Error>> {
        let conversation_id = self.conversation_id()?;
        let result = self.client.send_thread_event(conversation_id, event)?;
        self.handle_update(result.update.clone())?;
        Ok(result)
    }

    fn handle_setting_command(&mut self, line: &str) -> Result<bool, Box<dyn Error>> {
        let mut parts = line.splitn(2, char::is_whitespace);
        let command = parts.next().unwrap_or_default();
        let value = parts.next().unwrap_or_default().trim();

        match command {
            "/model" => {
                if value.is_empty() {
                    self.print_model_state()?;
                } else {
                    self.send_thread_event(ThreadEvent::set_model(value))?;
                    self.pump_until_no_activity(Duration::from_millis(250))?;
                    println!("[state] model set to {value}");
                }
            }
            "/mode" => {
                if value.is_empty() {
                    self.print_mode_state()?;
                } else {
                    self.send_thread_event(ThreadEvent::set_mode(value))?;
                    self.pump_until_no_activity(Duration::from_millis(250))?;
                    println!("[state] mode set to {value}");
                    if self.codex_mode_needs_model_warning(value) {
                        println!(
                            "[warn] Codex collaborationMode requires a model in turn/start; set /model first if the next turn does not switch mode"
                        );
                    }
                }
            }
            "/effort" | "/reasoning" => {
                if value.is_empty() {
                    self.print_effort_state()?;
                } else {
                    let reasoning = self.current_conversation()?.reasoning;
                    let Some(effort) = reasoning.normalize_effort(value) else {
                        if reasoning.available_efforts.is_empty() {
                            println!("[warn] reasoning effort is unavailable for this runtime");
                        } else {
                            println!(
                                "[warn] use one of: {}",
                                reasoning.available_efforts.join(", ")
                            );
                        }
                        return Ok(true);
                    };
                    self.send_thread_event(ThreadEvent::set_reasoning_effort(effort))?;
                    self.pump_until_no_activity(Duration::from_millis(250))?;
                    println!("[state] reasoning effort set to {value}");
                }
            }
            _ => return Ok(false),
        }
        Ok(true)
    }

    fn process_next_update(&mut self, timeout: Option<Duration>) -> Result<bool, Box<dyn Error>> {
        let Some(update) = self.client.next_update(timeout)? else {
            return Ok(false);
        };
        self.handle_update(update)?;
        Ok(true)
    }

    fn pump_until_no_activity(&mut self, timeout: Duration) -> Result<(), Box<dyn Error>> {
        while self.process_next_update(Some(timeout))? {}
        Ok(())
    }

    fn handle_update(&mut self, update: ClientUpdate) -> Result<(), Box<dyn Error>> {
        for delta in &update.stream_deltas {
            self.print_stream_delta(delta)?;
        }
        for log in &update.logs {
            if log.kind == angel_engine_client::ClientLogKind::Output
                && !update.stream_deltas.is_empty()
            {
                continue;
            }
            self.printer.print_log(&client_log(log))?;
        }
        for event in &update.events {
            if event_prints(event) {
                self.printer.before_tagged_output()?;
            }
            print_event(event);
        }
        Ok(())
    }

    fn print_stream_delta(&mut self, delta: &ClientStreamDelta) -> Result<(), Box<dyn Error>> {
        match delta {
            ClientStreamDelta::AssistantDelta { content, .. } => self
                .printer
                .print_inline_text(InlineStreamKind::Assistant, &content.text)?,
            ClientStreamDelta::ActionOutputDelta { content, .. } => self
                .printer
                .print_inline_text(InlineStreamKind::Assistant, &content.text)?,
            ClientStreamDelta::ReasoningDelta { content, .. }
            | ClientStreamDelta::PlanDelta { content, .. } => self
                .printer
                .print_inline_text(InlineStreamKind::Reasoning, &content.text)?,
        }
        Ok(())
    }

    fn resolve_open_elicitation(&mut self) -> Result<bool, Box<dyn Error>> {
        let conversation_id = self.conversation_id()?;
        let Some(elicitation) = self
            .client
            .open_elicitations(&conversation_id)
            .first()
            .cloned()
        else {
            return Ok(false);
        };
        let response = if elicitation.kind == "userInput" {
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

    fn print_banner(&self) {
        println!("{}", self.runtime.banner());
        if self.runtime.supports_shell() {
            println!("Type a message, /shell <command>, /model, /mode, /effort, or :quit.");
        } else {
            println!("Type a message, /model, /mode, /effort, or :quit.");
        }
        self.print_available_commands();
    }

    fn print_available_commands(&self) {
        let commands = self.current_commands();
        print_command_summary(&commands);
    }

    fn print_available_command_list(&self) {
        let commands = self.current_commands();
        print_available_commands(&commands);
    }

    fn current_conversation(&self) -> Result<ConversationSnapshot, Box<dyn Error>> {
        let conversation_id = self.conversation_id()?;
        self.client
            .snapshot()
            .conversations
            .into_iter()
            .find(|conversation| conversation.id == conversation_id)
            .ok_or_else(|| "selected conversation missing".into())
    }

    fn current_commands(&self) -> Vec<CliCommandInfo> {
        self.current_conversation()
            .map(|conversation| cli_commands(&conversation.available_commands))
            .unwrap_or_default()
    }

    fn print_model_state(&self) -> Result<(), Box<dyn Error>> {
        let conversation = self.current_conversation()?;
        let current = conversation
            .context
            .model
            .as_deref()
            .or_else(|| {
                conversation
                    .models
                    .as_ref()
                    .map(|models| models.current_model_id.as_str())
            })
            .unwrap_or("(default)");
        println!("[model] current: {current}");
        if let Some(option) = config_option(&conversation, "model", &["model"]) {
            print_config_values("[model]", option);
        } else if let Some(models) = &conversation.models {
            let values = models
                .available_models
                .iter()
                .map(|model| model.id.as_str())
                .collect::<Vec<_>>();
            print_values("[model]", &values);
        }
        Ok(())
    }

    fn print_mode_state(&self) -> Result<(), Box<dyn Error>> {
        let conversation = self.current_conversation()?;
        let current = conversation
            .context
            .mode
            .as_deref()
            .or_else(|| {
                conversation
                    .modes
                    .as_ref()
                    .map(|modes| modes.current_mode_id.as_str())
            })
            .unwrap_or("(default)");
        println!("[mode] current: {current}");
        if let Some(option) = config_option(&conversation, "mode", &["mode"]) {
            print_config_values("[mode]", option);
        } else if let Some(modes) = &conversation.modes {
            let values = modes
                .available_modes
                .iter()
                .map(|mode| mode.id.as_str())
                .collect::<Vec<_>>();
            print_values("[mode]", &values);
        } else if self.runtime.is_codex() {
            println!("[mode] available: plan, default");
        }
        Ok(())
    }

    fn print_effort_state(&self) -> Result<(), Box<dyn Error>> {
        let conversation = self.current_conversation()?;
        let reasoning = conversation.reasoning;
        let current = reasoning.current_effort.as_deref().unwrap_or("(default)");
        println!("[effort] current: {current}");
        if !reasoning.available_efforts.is_empty() {
            let values = reasoning
                .available_efforts
                .iter()
                .map(String::as_str)
                .collect::<Vec<_>>();
            print_values("[effort]", &values);
        } else if !reasoning.can_set {
            println!("[effort] unavailable for this runtime");
        }
        Ok(())
    }

    fn codex_mode_needs_model_warning(&self, value: &str) -> bool {
        self.runtime.is_codex()
            && matches!(value, "plan" | "default")
            && self
                .current_conversation()
                .map(|conversation| conversation.context.model)
                .unwrap_or_default()
                .is_none()
    }

    fn conversation_id(&self) -> Result<String, Box<dyn Error>> {
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
            .map(|turn| turn.phase.contains("terminal"))
            .unwrap_or(false)
    }
}

trait ReasoningOptionsExt {
    fn normalize_effort(&self, value: &str) -> Option<String>;
}

impl ReasoningOptionsExt for ReasoningOptionsSnapshot {
    fn normalize_effort(&self, value: &str) -> Option<String> {
        if !self.can_set {
            return None;
        }
        if self.available_efforts.is_empty() {
            return Some(value.to_string());
        }
        self.available_efforts
            .iter()
            .find(|effort| effort.eq_ignore_ascii_case(value))
            .cloned()
    }
}

#[derive(Clone, Copy, Debug)]
enum RuntimeKind {
    Kimi,
    Codex,
    OpenCode,
}

impl RuntimeKind {
    fn from_arg(value: Option<&str>) -> Result<Self, Box<dyn Error>> {
        match value.unwrap_or("kimi") {
            "kimi" => Ok(Self::Kimi),
            "codex" => Ok(Self::Codex),
            "opencode" | "open-code" => Ok(Self::OpenCode),
            other => Err(format!("unknown runtime {other}; use kimi, codex, or opencode").into()),
        }
    }

    fn options(self) -> ClientOptions {
        match self {
            Self::Kimi => ClientOptions::builder()
                .acp("kimi")
                .arg("acp")
                .need_auth(true)
                .auto_authenticate(true)
                .client_name("angel-client-cli")
                .client_title("Angel Client CLI")
                .build(),
            Self::Codex => ClientOptions::builder()
                .codex_app_server("codex")
                .arg("app-server")
                .client_name("angel-client-cli")
                .client_title("Angel Client CLI")
                .build(),
            Self::OpenCode => ClientOptions::builder()
                .acp("opencode")
                .arg("acp")
                .need_auth(false)
                .client_name("angel-client-cli")
                .client_title("Angel Client CLI")
                .build(),
        }
    }

    fn banner(self) -> &'static str {
        match self {
            Self::Kimi => "angel-client kimi cli",
            Self::Codex => "angel-client codex cli",
            Self::OpenCode => "angel-client opencode cli",
        }
    }

    fn prompt(self) -> &'static str {
        match self {
            Self::Kimi => "kimi> ",
            Self::Codex => "codex> ",
            Self::OpenCode => "opencode> ",
        }
    }

    fn supports_shell(self) -> bool {
        matches!(self, Self::Codex)
    }

    fn is_codex(self) -> bool {
        matches!(self, Self::Codex)
    }
}

fn client_log(log: &ClientLog) -> TaggedLog {
    TaggedLog::new(
        match log.kind {
            angel_engine_client::ClientLogKind::Send => TaggedLogKind::Send,
            angel_engine_client::ClientLogKind::Receive => TaggedLogKind::Receive,
            angel_engine_client::ClientLogKind::State => TaggedLogKind::State,
            angel_engine_client::ClientLogKind::Output => TaggedLogKind::Output,
            angel_engine_client::ClientLogKind::Warning => TaggedLogKind::Warning,
            angel_engine_client::ClientLogKind::Error => TaggedLogKind::Error,
            angel_engine_client::ClientLogKind::ProcessStdout => TaggedLogKind::ProcessStdout,
            angel_engine_client::ClientLogKind::ProcessStderr => TaggedLogKind::ProcessStderr,
        },
        log.message.clone(),
    )
}

fn cli_commands(commands: &[AvailableCommandSnapshot]) -> Vec<CliCommandInfo> {
    commands
        .iter()
        .map(|command| CliCommandInfo {
            name: command.name.clone(),
            description: command.description.clone(),
            input_hint: command.input_hint.clone(),
        })
        .collect()
}

fn config_option<'a>(
    conversation: &'a ConversationSnapshot,
    preferred_id: &str,
    categories: &[&str],
) -> Option<&'a SessionConfigOptionSnapshot> {
    conversation
        .config_options
        .iter()
        .find(|option| option.id == preferred_id)
        .or_else(|| {
            conversation.config_options.iter().find(|option| {
                option
                    .category
                    .as_deref()
                    .is_some_and(|category| categories.contains(&category))
            })
        })
}

fn print_config_values(prefix: &str, option: &SessionConfigOptionSnapshot) {
    if option.values.is_empty() {
        println!("{prefix} current option: {}", option.current_value);
        return;
    }
    let values = option
        .values
        .iter()
        .map(|value| {
            if value.value == option.current_value {
                format!("{}*", value.value)
            } else {
                value.value.clone()
            }
        })
        .collect::<Vec<_>>();
    print_values(
        prefix,
        &values.iter().map(String::as_str).collect::<Vec<_>>(),
    );
}

fn print_values(prefix: &str, values: &[&str]) {
    if !values.is_empty() {
        println!("{prefix} available: {}", values.join(", "));
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

fn print_event(event: &ClientEvent) {
    match event {
        ClientEvent::RuntimeAuthRequired { methods } => {
            println!(
                "[auth] runtime requested auth: {}",
                methods
                    .iter()
                    .map(|method| method.label.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            );
        }
        ClientEvent::RuntimeReady { name, version } => {
            println!(
                "[runtime] {name}{} ready",
                version
                    .as_ref()
                    .map(|version| format!(" {version}"))
                    .unwrap_or_default()
            );
        }
        ClientEvent::ConversationReady { conversation } => {
            println!(
                "[thread] {} ready ({})",
                conversation.id,
                conversation.remote_id.as_deref().unwrap_or("local")
            );
        }
        ClientEvent::AvailableCommandsUpdated {
            conversation_id,
            count,
        } => {
            println!("[thread] {conversation_id} commands updated: {count}");
        }
        ClientEvent::SessionUsageUpdated {
            conversation_id,
            usage,
        } => {
            println!("[usage] {conversation_id}: {}/{}", usage.used, usage.size);
        }
        ClientEvent::ActionObserved { action, .. } => {
            println!(
                "[tool call] {}",
                action.title.as_deref().unwrap_or(action.kind.as_str())
            );
        }
        _ => {}
    }
}

fn event_prints(event: &ClientEvent) -> bool {
    matches!(
        event,
        ClientEvent::RuntimeAuthRequired { .. }
            | ClientEvent::RuntimeReady { .. }
            | ClientEvent::ConversationReady { .. }
            | ClientEvent::AvailableCommandsUpdated { .. }
            | ClientEvent::SessionUsageUpdated { .. }
            | ClientEvent::ActionObserved { .. }
    )
}
