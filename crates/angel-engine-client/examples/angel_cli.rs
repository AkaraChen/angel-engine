use std::env;
use std::error::Error;
use std::io::{self, BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::thread;
use std::time::Duration;

use angel_engine_client::{
    Client, ClientAnswer, ClientBuilder, ClientEvent, ClientLog, ClientLogKind, ClientOptions,
    ClientUpdate, ElicitationResponse, ElicitationSnapshot, RuntimeSnapshot,
    StartConversationRequest, ThreadEvent,
};

fn main() -> Result<(), Box<dyn Error>> {
    let runtime = RuntimeKind::from_arg(env::args().nth(1).as_deref())?;
    let mut cli = MultiRuntimeCli::spawn(runtime)?;
    cli.initialize_and_start()?;
    cli.run_repl()
}

struct MultiRuntimeCli {
    child: Child,
    child_stdin: ChildStdin,
    lines: Receiver<AppLine>,
    client: Client,
    runtime: RuntimeKind,
    conversation_id: Option<String>,
    auth_sent: bool,
    inline_output: InlineOutput,
}

impl MultiRuntimeCli {
    fn spawn(runtime: RuntimeKind) -> Result<Self, Box<dyn Error>> {
        let options = runtime.options();
        let mut child = Command::new(&options.command)
            .args(&options.args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;

        let child_stdin = child.stdin.take().ok_or("missing runtime stdin")?;
        let stdout = child.stdout.take().ok_or("missing runtime stdout")?;
        let stderr = child.stderr.take().ok_or("missing runtime stderr")?;
        let (tx, rx) = mpsc::channel();
        spawn_line_reader(stdout, tx.clone(), AppLine::Stdout);
        spawn_line_reader(stderr, tx, AppLine::Stderr);

        let client = ClientBuilder::new(options).build();
        Ok(Self {
            child,
            child_stdin,
            lines: rx,
            client,
            runtime,
            conversation_id: None,
            auth_sent: false,
            inline_output: InlineOutput::None,
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
        let mut input = String::new();
        loop {
            print!("{}", self.runtime.prompt());
            io::stdout().flush()?;
            input.clear();
            if io::stdin().read_line(&mut input)? == 0 {
                break;
            }
            let line = input.trim();
            if line.is_empty() {
                continue;
            }
            if matches!(line, ":q" | ":quit" | "exit") {
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
            Some(timeout) => match self.lines.recv_timeout(timeout) {
                Ok(line) => line,
                Err(mpsc::RecvTimeoutError::Timeout) => return Ok(false),
                Err(error) => return Err(Box::new(error)),
            },
            None => self.lines.recv()?,
        };

        match line {
            AppLine::Stdout(line) => {
                let value = match serde_json::from_str(&line) {
                    Ok(value) => value,
                    Err(_) => {
                        println!("[{}] {line}", self.runtime.label());
                        return Ok(true);
                    }
                };
                let update = self.client.receive_json_value(value)?;
                self.handle_update(update)?;
            }
            AppLine::Stderr(line) => {
                self.finish_inline_output()?;
                println!("[{}] {line}", self.runtime.label());
            }
        }
        Ok(true)
    }

    fn handle_update(&mut self, update: ClientUpdate) -> Result<(), Box<dyn Error>> {
        for log in &update.logs {
            self.print_log(log)?;
        }
        for event in &update.events {
            if event_prints(event) {
                self.finish_inline_output()?;
            }
            print_event(event);
        }
        for message in &update.outgoing {
            self.finish_inline_output()?;
            writeln!(self.child_stdin, "{}", message.line)?;
        }
        if !update.outgoing.is_empty() {
            self.child_stdin.flush()?;
        }
        Ok(())
    }

    fn print_log(&mut self, log: &ClientLog) -> io::Result<()> {
        if log.kind != ClientLogKind::Output {
            self.finish_inline_output()?;
            return print_log_line(log);
        }

        if let Some(reasoning) = log.message.strip_prefix("[reasoning] ") {
            if self.inline_output != InlineOutput::Reasoning {
                self.finish_inline_output()?;
                print!("[reasoning] ");
                self.inline_output = InlineOutput::Reasoning;
            }
            print!("{reasoning}");
            return io::stdout().flush();
        }

        if self.inline_output == InlineOutput::Reasoning {
            self.finish_inline_output()?;
        }
        self.inline_output = InlineOutput::Assistant;
        print!("{}", log.message);
        io::stdout().flush()
    }

    fn finish_inline_output(&mut self) -> io::Result<()> {
        if self.inline_output != InlineOutput::None {
            println!();
            self.inline_output = InlineOutput::None;
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
        println!(
            "[approval] {}",
            elicitation
                .title
                .clone()
                .unwrap_or_else(|| "approval requested".to_string())
        );
        if let Some(body) = &elicitation.body
            && !body.is_empty()
        {
            println!("[approval] {body}");
        }
        if !elicitation.choices.is_empty() {
            println!("[approval] options: {}", elicitation.choices.join(", "));
        }
        print!("Allow? [y]es/[s]ession/[n]o/[c]ancel: ");
        io::stdout().flush()?;
        let input = read_stdin_line()?;
        let response = match input.trim().to_ascii_lowercase().as_str() {
            "y" | "yes" | "allow" => ElicitationResponse::Allow,
            "s" | "session" | "always" => ElicitationResponse::AllowForSession,
            "c" | "cancel" => ElicitationResponse::Cancel,
            _ => ElicitationResponse::Deny,
        };
        Ok(response)
    }

    fn read_user_input_response(
        &self,
        elicitation: &ElicitationSnapshot,
    ) -> Result<ElicitationResponse, Box<dyn Error>> {
        println!(
            "[input] {}",
            elicitation
                .title
                .clone()
                .unwrap_or_else(|| "input requested".to_string())
        );
        if elicitation.questions.is_empty() {
            if let Some(body) = &elicitation.body
                && !body.is_empty()
            {
                println!("[input] {body}");
            }
            print!("Type your answer, or :cancel to cancel: ");
            io::stdout().flush()?;
            let input = read_stdin_line()?;
            if input.trim() == ":cancel" {
                return Ok(ElicitationResponse::Cancel);
            }
            return Ok(ElicitationResponse::answers([ClientAnswer::new(
                "answer",
                input.trim(),
            )]));
        }

        let mut answers = Vec::new();
        for question in &elicitation.questions {
            println!("[input] {}", question.question);
            for (index, option) in question.options.iter().enumerate() {
                println!("[input] {}. {}", index + 1, option.label);
            }
            print!("Answer, or :cancel to cancel: ");
            io::stdout().flush()?;
            let input = read_stdin_line()?;
            if input.trim() == ":cancel" {
                return Ok(ElicitationResponse::Cancel);
            }
            answers.push(ClientAnswer::new(&question.id, input.trim()));
        }
        Ok(ElicitationResponse::answers(answers))
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
        let Some(conversation_id) = &self.conversation_id else {
            return;
        };
        let snapshot = self.client.snapshot();
        let Some(state) = snapshot
            .conversations
            .iter()
            .find(|conversation| &conversation.id == conversation_id)
        else {
            return;
        };
        if state.available_commands.is_empty() {
            return;
        }
        let names = state
            .available_commands
            .iter()
            .take(8)
            .map(|command| format!("/{}", command.name))
            .collect::<Vec<_>>();
        let suffix = if state.available_commands.len() > names.len() {
            ", ..."
        } else {
            ""
        };
        println!(
            "[commands] {} available: {}{}; type /commands to list",
            state.available_commands.len(),
            names.join(", "),
            suffix
        );
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

impl Drop for MultiRuntimeCli {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
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

enum AppLine {
    Stdout(String),
    Stderr(String),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum InlineOutput {
    None,
    Assistant,
    Reasoning,
}

fn spawn_line_reader<R, F>(reader: R, tx: mpsc::Sender<AppLine>, wrap: F)
where
    R: io::Read + Send + 'static,
    F: Fn(String) -> AppLine + Send + 'static + Copy,
{
    thread::spawn(move || {
        for line in BufReader::new(reader).lines().map_while(Result::ok) {
            if tx.send(wrap(line)).is_err() {
                break;
            }
        }
    });
}

fn print_log_line(log: &ClientLog) -> io::Result<()> {
    match log.kind {
        ClientLogKind::Output => Ok(()),
        ClientLogKind::Send => {
            println!("[send] {}", log.message);
            Ok(())
        }
        ClientLogKind::Receive => {
            println!("[recv] {}", log.message);
            Ok(())
        }
        ClientLogKind::State => {
            println!("[state] {}", log.message);
            Ok(())
        }
        ClientLogKind::Warning => {
            println!("[warn] {}", log.message);
            Ok(())
        }
        ClientLogKind::Error => {
            println!("[error] {}", log.message);
            Ok(())
        }
        ClientLogKind::ProcessStdout => {
            println!("[stdout] {}", log.message);
            Ok(())
        }
        ClientLogKind::ProcessStderr => {
            println!("[stderr] {}", log.message);
            Ok(())
        }
    }
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

fn read_stdin_line() -> io::Result<String> {
    let mut input = String::new();
    if io::stdin().read_line(&mut input)? == 0 {
        input.clear();
    }
    Ok(input)
}
