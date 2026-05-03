use std::env;
use std::error::Error;
use std::time::Duration;

use angel_engine_client::{
    AvailableCommandSnapshot, Client, ClientAnswer, ClientBuilder, ClientEvent, ClientLog,
    ClientOptions, ClientUpdate, ElicitationResponse, ElicitationSnapshot, QuestionSnapshot,
    RuntimeSnapshot, StartConversationRequest, ThreadEvent,
};
use test_cli::{
    AppLine, ApprovalChoice, CliAnswer, CliCommandInfo, CliQuestion, CliQuestionOption,
    InlinePrinter, RuntimeProcess, TaggedLog, TaggedLogKind, is_quit_command,
    print_available_commands, print_command_summary, prompt_answers, prompt_approval,
    read_prompt_line,
};

fn main() -> Result<(), Box<dyn Error>> {
    let runtime = RuntimeKind::from_arg(env::args().nth(1).as_deref())?;
    let mut cli = MultiRuntimeCli::spawn(runtime)?;
    cli.initialize_and_start()?;
    cli.run_repl()
}

struct MultiRuntimeCli {
    process: RuntimeProcess,
    printer: InlinePrinter,
    client: Client,
    runtime: RuntimeKind,
    conversation_id: Option<String>,
    auth_sent: bool,
}

impl MultiRuntimeCli {
    fn spawn(runtime: RuntimeKind) -> Result<Self, Box<dyn Error>> {
        let options = runtime.options();
        let process = RuntimeProcess::spawn(&options.command, &options.args)?;
        let client = ClientBuilder::new(options).build();
        Ok(Self {
            process,
            printer: Default::default(),
            client,
            runtime,
            conversation_id: None,
            auth_sent: false,
        })
    }

    fn initialize_and_start(&mut self) -> Result<(), Box<dyn Error>> {
        let init = self.client.initialize()?;
        self.handle_update(init.update)?;
        self.wait_for_runtime()?;

        let start = self.client.start_thread(
            StartConversationRequest::new().cwd(env::current_dir()?.display().to_string()),
        )?;
        let conversation_id = start
            .conversation_id
            .clone()
            .ok_or("start_thread did not return a conversation id")?;
        self.handle_update(start.update)?;
        self.wait_for_thread_idle(&conversation_id)?;
        self.conversation_id = Some(conversation_id);
        self.drain_startup_notifications()?;
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
            self.process_next_line(None)?;
        }
        println!();
        Ok(())
    }

    fn send_thread_event(
        &mut self,
        event: ThreadEvent,
    ) -> Result<angel_engine_client::ClientCommandResult, Box<dyn Error>> {
        let conversation_id = self.conversation_id()?;
        let result = {
            let mut thread = self.client.thread(conversation_id);
            thread.send_event(event)?
        };
        self.handle_update(result.update.clone())?;
        Ok(result)
    }

    fn handle_setting_command(&mut self, line: &str) -> Result<bool, Box<dyn Error>> {
        let Some((command, value)) = line.split_once(' ') else {
            return Ok(false);
        };
        let event = match command {
            "/model" => ThreadEvent::set_model(value.trim()),
            "/mode" => ThreadEvent::set_mode(value.trim()),
            "/effort" | "/reasoning" => ThreadEvent::set_reasoning_effort(value.trim()),
            _ => return Ok(false),
        };
        self.send_thread_event(event)?;
        self.pump_until_no_activity(Duration::from_millis(250))?;
        Ok(true)
    }

    fn wait_for_runtime(&mut self) -> Result<(), Box<dyn Error>> {
        loop {
            match self.client.snapshot().runtime {
                RuntimeSnapshot::Available { .. } => return Ok(()),
                RuntimeSnapshot::AwaitingAuth { methods }
                    if !self.auth_sent && self.runtime.auto_authenticate() =>
                {
                    let method = methods
                        .first()
                        .ok_or("runtime advertised no auth methods")?;
                    println!("[warn] runtime requires authentication: {}", method.label);
                    self.auth_sent = true;
                    let auth = self.client.authenticate(method.id.clone())?;
                    self.handle_update(auth.update)?;
                }
                RuntimeSnapshot::AwaitingAuth { .. }
                    if self.auth_sent && self.runtime.auto_authenticate() =>
                {
                    self.process_next_line(None)?;
                }
                RuntimeSnapshot::Faulted { code, message, .. } => {
                    return Err(format!("runtime faulted ({code}): {message}").into());
                }
                RuntimeSnapshot::AwaitingAuth { methods } => {
                    println!(
                        "[auth] available methods: {}",
                        methods
                            .iter()
                            .map(|method| method.label.as_str())
                            .collect::<Vec<_>>()
                            .join(", ")
                    );
                    return Err("runtime requires auth and auto auth is disabled".into());
                }
                _ => {
                    self.process_next_line(None)?;
                }
            }
        }
    }

    fn wait_for_thread_idle(&mut self, conversation_id: &str) -> Result<(), Box<dyn Error>> {
        loop {
            let idle = self
                .client
                .thread(conversation_id)
                .state()
                .map(|state| state.lifecycle == "idle")
                .unwrap_or(false);
            if idle {
                return Ok(());
            }
            self.process_next_line(None)?;
        }
    }

    fn drain_startup_notifications(&mut self) -> Result<(), Box<dyn Error>> {
        let mut timeout = Duration::from_millis(500);
        while self.process_next_line(Some(timeout))? {
            timeout = Duration::from_millis(50);
        }
        Ok(())
    }

    fn pump_until_no_activity(&mut self, timeout: Duration) -> Result<(), Box<dyn Error>> {
        while self.process_next_line(Some(timeout))? {}
        Ok(())
    }

    fn process_next_line(&mut self, timeout: Option<Duration>) -> Result<bool, Box<dyn Error>> {
        let line = match timeout {
            Some(timeout) => match self.process.recv_timeout(timeout)? {
                Some(line) => line,
                None => return Ok(false),
            },
            None => self.process.recv()?,
        };

        match line {
            AppLine::Stdout(line) => {
                let value = match serde_json::from_str(&line) {
                    Ok(value) => value,
                    Err(_) => {
                        self.printer
                            .print_process_line(self.runtime.label(), &line)?;
                        return Ok(true);
                    }
                };
                let update = self.client.receive_json_value(value)?;
                self.handle_update(update)?;
            }
            AppLine::Stderr(line) => {
                self.printer
                    .print_process_line(self.runtime.label(), &line)?;
            }
        }
        Ok(true)
    }

    fn handle_update(&mut self, update: ClientUpdate) -> Result<(), Box<dyn Error>> {
        for log in &update.logs {
            self.printer.print_log(&client_log(log))?;
        }
        for event in &update.events {
            if event_prints(event) {
                self.printer.before_tagged_output()?;
            }
            print_event(event);
        }
        for message in &update.outgoing {
            self.printer.before_tagged_output()?;
            self.process.write_line(&message.line)?;
        }
        Ok(())
    }

    fn resolve_open_elicitation(&mut self) -> Result<bool, Box<dyn Error>> {
        let conversation_id = self.conversation_id()?;
        let Some(elicitation) = self
            .client
            .thread(&conversation_id)
            .open_elicitations()
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
        let result = {
            let mut thread = self.client.thread(conversation_id);
            thread.send_event(ThreadEvent::resolve(elicitation.id, response))?
        };
        self.handle_update(result.update)?;
        Ok(true)
    }

    fn read_approval_response(
        &self,
        elicitation: &ElicitationSnapshot,
    ) -> Result<ElicitationResponse, Box<dyn Error>> {
        let response = match prompt_approval(
            elicitation.title.as_deref(),
            elicitation.body.as_deref(),
            &elicitation.choices,
        )? {
            ApprovalChoice::Allow => ElicitationResponse::Allow,
            ApprovalChoice::AllowForSession => ElicitationResponse::AllowForSession,
            ApprovalChoice::Deny => ElicitationResponse::Deny,
            ApprovalChoice::Cancel => ElicitationResponse::Cancel,
        };
        Ok(response)
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
        if let Some(commands) = self.current_commands() {
            print_command_summary(&commands);
        }
    }

    fn print_available_command_list(&self) {
        if let Some(commands) = self.current_commands() {
            print_available_commands(&commands);
        }
    }

    fn current_commands(&self) -> Option<Vec<CliCommandInfo>> {
        let Some(conversation_id) = &self.conversation_id else {
            return None;
        };
        let snapshot = self.client.snapshot();
        let Some(state) = snapshot
            .conversations
            .iter()
            .find(|conversation| &conversation.id == conversation_id)
        else {
            return None;
        };
        Some(cli_commands(&state.available_commands))
    }

    fn conversation_id(&self) -> Result<String, Box<dyn Error>> {
        self.conversation_id
            .clone()
            .ok_or_else(|| "conversation has not been started".into())
    }

    fn turn_is_terminal(&mut self, conversation_id: &str, turn_id: &str) -> bool {
        self.client
            .thread(conversation_id)
            .turn(turn_id)
            .map(|turn| turn.phase.contains("terminal"))
            .unwrap_or(false)
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

    fn label(self) -> &'static str {
        match self {
            Self::Kimi => "kimi",
            Self::Codex => "codex",
            Self::OpenCode => "opencode",
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

    fn auto_authenticate(self) -> bool {
        matches!(self, Self::Kimi)
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
    )
}
