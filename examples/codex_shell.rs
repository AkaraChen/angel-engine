use std::error::Error;
use std::io::{self, BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::thread;
use std::time::Duration;

use agent_runner::angel_engine::adapters::codex::CodexAdapter;
use agent_runner::angel_engine::{
    AngelEngine, CommandPlan, ConversationLifecycle, EngineCommand, JsonRpcMessage, ProtocolFlavor,
    ProtocolTransport, RuntimeState, StartConversationParams, TransportClientInfo, TransportLog,
    TransportLogKind, TransportOptions, apply_transport_output,
};

enum AppLine {
    Stdout(String),
    Stderr(String),
}

struct CodexShell {
    child: Child,
    child_stdin: ChildStdin,
    lines: Receiver<AppLine>,
    engine: AngelEngine,
    adapter: CodexAdapter,
    options: TransportOptions,
}

impl CodexShell {
    fn start() -> Result<Self, Box<dyn Error>> {
        let adapter = CodexAdapter::app_server();
        let mut child = Command::new("codex")
            .arg("app-server")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;

        let child_stdin = child.stdin.take().ok_or("missing codex stdin")?;
        let stdout = child.stdout.take().ok_or("missing codex stdout")?;
        let stderr = child.stderr.take().ok_or("missing codex stderr")?;
        let (tx, rx) = mpsc::channel();

        spawn_line_reader(stdout, tx.clone(), AppLine::Stdout);
        spawn_line_reader(stderr, tx, AppLine::Stderr);

        let engine = AngelEngine::new(ProtocolFlavor::CodexAppServer, adapter.capabilities());
        let options = TransportOptions {
            client_info: TransportClientInfo::new("codex-shell-demo", env!("CARGO_PKG_VERSION"))
                .title("Codex Shell Demo"),
            experimental_api: true,
        };

        Ok(Self {
            child,
            child_stdin,
            lines: rx,
            engine,
            adapter,
            options,
        })
    }

    fn initialize(&mut self) -> Result<(), Box<dyn Error>> {
        let plan = self.engine.plan_command(EngineCommand::Initialize)?;
        self.send_plan(plan)?;
        while !matches!(self.engine.runtime, RuntimeState::Available { .. }) {
            self.process_next_line(None)?;
        }

        let plan = self.engine.plan_command(EngineCommand::StartConversation {
            params: StartConversationParams {
                cwd: Some(std::env::current_dir()?.display().to_string()),
                service_name: Some("codex-shell-demo".to_string()),
                context: Default::default(),
                ephemeral: true,
            },
        })?;
        let conversation_id = plan.conversation_id.clone();
        self.send_plan(plan)?;
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

    fn run_repl(&mut self) -> Result<(), Box<dyn Error>> {
        println!("codex-shell demo");
        println!("Type a message, /shell <command> for direct shell execution, or :quit.");

        let mut input = String::new();
        loop {
            print!("codex-shell> ");
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
                self.run_shell_command(command.to_string())?;
            } else {
                self.run_codex_turn(line.to_string())?;
            }
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
            let request_done = request_id
                .as_ref()
                .map(|id| !self.engine.pending.requests.contains_key(id))
                .unwrap_or(true);
            let active_turns = self
                .engine
                .selected
                .as_ref()
                .and_then(|id| self.engine.conversations.get(id))
                .map(|conversation| conversation.active_turn_count())
                .unwrap_or(0);
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

    fn run_codex_turn(&mut self, prompt: String) -> Result<(), Box<dyn Error>> {
        let conversation_id = self.selected_conversation()?;
        let plan = self.engine.plan_command(EngineCommand::StartTurn {
            conversation_id,
            input: vec![agent_runner::angel_engine::UserInput::text(prompt)],
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
                        println!("[codex] {line}");
                        return Ok(true);
                    }
                };
                let message = JsonRpcMessage::from_value(value)?;
                let output = self.adapter.decode_message(&self.engine, &message)?;
                self.handle_transport_output(&output)?;
            }
            AppLine::Stderr(line) => {
                println!("[codex] {line}");
            }
        }
        Ok(true)
    }

    fn handle_transport_output(
        &mut self,
        output: &agent_runner::angel_engine::TransportOutput,
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

    fn selected_conversation(
        &self,
    ) -> Result<agent_runner::angel_engine::ConversationId, Box<dyn Error>> {
        self.engine
            .selected
            .clone()
            .ok_or_else(|| "no selected conversation".into())
    }
}

impl Drop for CodexShell {
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

fn main() -> Result<(), Box<dyn Error>> {
    let mut shell = CodexShell::start()?;
    shell.initialize()?;
    shell.run_repl()
}
