use std::error::Error;
use std::io::{self, BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::thread;
use std::time::Duration;

use angel_engine::{
    AngelEngine, CommandPlan, ConversationCapabilities, ConversationId, ConversationLifecycle,
    ElicitationDecision, ElicitationId, ElicitationPhase, EngineCommand, JsonRpcMessage,
    ProtocolFlavor, ProtocolTransport, RuntimeState, StartConversationParams, TransportClientInfo,
    TransportLog, TransportLogKind, TransportOptions, UserInput, apply_transport_output,
};

#[derive(Clone, Copy, Debug)]
pub struct ShellConfig {
    pub binary: &'static str,
    pub args: &'static [&'static str],
    pub protocol: ProtocolFlavor,
    pub client_name: &'static str,
    pub client_title: &'static str,
    pub service_name: &'static str,
    pub process_label: &'static str,
    pub banner: &'static str,
    pub prompt: &'static str,
    pub direct_shell: bool,
}

enum AppLine {
    Stdout(String),
    Stderr(String),
}

pub struct ProtocolShell<A> {
    child: Child,
    child_stdin: ChildStdin,
    lines: Receiver<AppLine>,
    engine: AngelEngine,
    adapter: A,
    options: TransportOptions,
    config: ShellConfig,
}

impl<A> ProtocolShell<A>
where
    A: ProtocolTransport,
{
    pub fn start(
        adapter: A,
        capabilities: ConversationCapabilities,
        config: ShellConfig,
    ) -> Result<Self, Box<dyn Error>> {
        let mut child = Command::new(config.binary)
            .args(config.args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;

        let child_stdin = child.stdin.take().ok_or("missing agent stdin")?;
        let stdout = child.stdout.take().ok_or("missing agent stdout")?;
        let stderr = child.stderr.take().ok_or("missing agent stderr")?;
        let (tx, rx) = mpsc::channel();

        spawn_line_reader(stdout, tx.clone(), AppLine::Stdout);
        spawn_line_reader(stderr, tx, AppLine::Stderr);

        let engine = AngelEngine::new(config.protocol, capabilities);
        let options = TransportOptions {
            client_info: TransportClientInfo::new(config.client_name, env!("CARGO_PKG_VERSION"))
                .title(config.client_title),
            experimental_api: true,
        };

        Ok(Self {
            child,
            child_stdin,
            lines: rx,
            engine,
            adapter,
            options,
            config,
        })
    }

    pub fn initialize(&mut self) -> Result<(), Box<dyn Error>> {
        let plan = self.engine.plan_command(EngineCommand::Initialize)?;
        self.send_plan(plan)?;
        self.wait_for_runtime()?;

        let plan = self.engine.plan_command(EngineCommand::StartConversation {
            params: StartConversationParams {
                cwd: Some(std::env::current_dir()?.display().to_string()),
                service_name: Some(self.config.service_name.to_string()),
                context: Default::default(),
                ephemeral: true,
            },
        })?;
        let conversation_id = plan.conversation_id.clone();
        self.send_plan(plan)?;
        self.wait_for_conversation_idle(conversation_id)?;
        Ok(())
    }

    pub fn run_repl(&mut self) -> Result<(), Box<dyn Error>> {
        println!("{}", self.config.banner);
        if self.config.direct_shell {
            println!("Type a message, /shell <command> for direct shell execution, or :quit.");
        } else {
            println!("Type a message, or :quit.");
        }

        let mut input = String::new();
        loop {
            print!("{}", self.config.prompt);
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

            if let Some(command) = line.strip_prefix("/shell ") {
                if self.config.direct_shell {
                    self.run_shell_command(command.to_string())?;
                } else {
                    println!("[warn] direct shell command is not available for this protocol");
                }
            } else {
                self.run_turn(line.to_string())?;
            }
        }
        Ok(())
    }

    fn wait_for_runtime(&mut self) -> Result<(), Box<dyn Error>> {
        let mut auth_sent = false;
        loop {
            match &self.engine.runtime {
                RuntimeState::Available { .. } => return Ok(()),
                RuntimeState::AwaitingAuth { methods } if !auth_sent => {
                    let Some(method) = methods.first().cloned() else {
                        return Err(
                            "runtime requires authentication but advertised no methods".into()
                        );
                    };
                    println!("[warn] runtime requires authentication: {}", method.label);
                    let plan = self
                        .engine
                        .plan_command(EngineCommand::Authenticate { method: method.id })?;
                    auth_sent = true;
                    self.send_plan(plan)?;
                }
                RuntimeState::Faulted(error) => {
                    return Err(format!("runtime faulted: {}", error.message).into());
                }
                _ => {
                    self.process_next_line(None)?;
                }
            }
        }
    }

    fn wait_for_conversation_idle(
        &mut self,
        conversation_id: Option<ConversationId>,
    ) -> Result<(), Box<dyn Error>> {
        while !conversation_id
            .as_ref()
            .and_then(|id| self.engine.conversations.get(id))
            .map(|conversation| matches!(conversation.lifecycle, ConversationLifecycle::Idle))
            .unwrap_or(false)
        {
            self.process_next_line(None)?;
        }
        Ok(())
    }

    fn run_shell_command(&mut self, command: String) -> Result<(), Box<dyn Error>> {
        let conversation_id = self.selected_conversation()?;
        let plan = self.engine.plan_command(EngineCommand::RunShellCommand {
            conversation_id,
            command,
        })?;
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

    fn run_turn(&mut self, prompt: String) -> Result<(), Box<dyn Error>> {
        let conversation_id = self.selected_conversation()?;
        let plan = self.engine.plan_command(EngineCommand::StartTurn {
            conversation_id,
            input: vec![UserInput::text(prompt)],
            overrides: Default::default(),
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
        println!();
        Ok(())
    }

    fn send_plan(&mut self, plan: CommandPlan) -> Result<(), Box<dyn Error>> {
        for effect in plan.effects {
            let output = self
                .adapter
                .encode_effect(&self.engine, &effect, &self.options)?;
            self.handle_transport_output(&output)?;
        }
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
                        println!("[{}] {line}", self.config.process_label);
                        return Ok(true);
                    }
                };
                let message = JsonRpcMessage::from_value(value)?;
                let output = self.adapter.decode_message(&self.engine, &message)?;
                self.handle_transport_output(&output)?;
            }
            AppLine::Stderr(line) => {
                println!("[{}] {line}", self.config.process_label);
            }
        }
        Ok(true)
    }

    fn handle_transport_output(
        &mut self,
        output: &angel_engine::TransportOutput,
    ) -> Result<(), Box<dyn Error>> {
        for log in &output.logs {
            print_log(log)?;
        }
        for message in &output.messages {
            writeln!(self.child_stdin, "{}", message.to_json_line()?)?;
            self.child_stdin.flush()?;
        }
        apply_transport_output(&mut self.engine, output)?;
        Ok(())
    }

    fn resolve_open_elicitation(&mut self) -> Result<bool, Box<dyn Error>> {
        let Some((conversation_id, elicitation_id, title, body, choices)) =
            self.next_open_elicitation()
        else {
            return Ok(false);
        };

        println!(
            "[approval] {}",
            title.unwrap_or_else(|| "approval requested".to_string())
        );
        if let Some(body) = body
            && !body.is_empty()
        {
            println!("[approval] {body}");
        }
        if !choices.is_empty() {
            println!("[approval] options: {}", choices.join(", "));
        }
        print!("Allow? [y]es/[s]ession/[n]o/[c]ancel: ");
        io::stdout().flush()?;

        let mut input = String::new();
        if io::stdin().read_line(&mut input)? == 0 {
            input.clear();
        }
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
                elicitation_id,
                decision,
            })?;
        self.send_plan(plan)?;
        Ok(true)
    }

    fn next_open_elicitation(
        &self,
    ) -> Option<(
        ConversationId,
        ElicitationId,
        Option<String>,
        Option<String>,
        Vec<String>,
    )> {
        let conversation_id = self.engine.selected.as_ref()?;
        let conversation = self.engine.conversations.get(conversation_id)?;
        conversation
            .elicitations
            .values()
            .find(|elicitation| matches!(elicitation.phase, ElicitationPhase::Open))
            .map(|elicitation| {
                (
                    conversation_id.clone(),
                    elicitation.id.clone(),
                    elicitation.options.title.clone(),
                    elicitation.options.body.clone(),
                    elicitation.options.choices.clone(),
                )
            })
    }

    fn selected_conversation(&self) -> Result<ConversationId, Box<dyn Error>> {
        self.engine
            .selected
            .clone()
            .ok_or_else(|| "no selected conversation".into())
    }

    fn selected_active_turn_count(&self) -> usize {
        self.engine
            .selected
            .as_ref()
            .and_then(|id| self.engine.conversations.get(id))
            .map(|conversation| conversation.active_turn_count())
            .unwrap_or(0)
    }
}

impl<A> Drop for ProtocolShell<A> {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
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

fn print_log(log: &TransportLog) -> io::Result<()> {
    match log.kind {
        TransportLogKind::Output => {
            print!("{}", log.message);
            io::stdout().flush()
        }
        TransportLogKind::Send => {
            println!("[send] {}", log.message);
            Ok(())
        }
        TransportLogKind::Receive => {
            println!("[recv] {}", log.message);
            Ok(())
        }
        TransportLogKind::State => {
            println!("[state] {}", log.message);
            Ok(())
        }
        TransportLogKind::Warning => {
            println!("[warn] {}", log.message);
            Ok(())
        }
        TransportLogKind::Error => {
            println!("[error] {}", log.message);
            Ok(())
        }
    }
}
