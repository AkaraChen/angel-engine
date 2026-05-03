use std::error::Error;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::thread;
use std::time::{Duration, Instant};

use angel_engine::adapters::acp::AcpAdapter;
use angel_engine::adapters::codex::CodexAdapter;
use angel_engine::*;

type TestResult = Result<(), Box<dyn Error>>;

struct AgentProcess<A> {
    child: Child,
    stdin: ChildStdin,
    stdout: Receiver<String>,
    stderr: Receiver<String>,
    adapter: A,
    engine: AngelEngine,
    options: TransportOptions,
}

impl<A> AgentProcess<A>
where
    A: ProtocolTransport,
{
    fn spawn(
        binary: &str,
        args: &[&str],
        adapter: A,
        protocol: ProtocolFlavor,
        capabilities: ConversationCapabilities,
    ) -> Result<Self, Box<dyn Error>> {
        let mut child = Command::new(binary)
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;
        let stdin = child.stdin.take().ok_or("missing child stdin")?;
        let stdout = child.stdout.take().ok_or("missing child stdout")?;
        let stderr = child.stderr.take().ok_or("missing child stderr")?;
        let (stdout_tx, stdout_rx) = mpsc::channel();
        let (stderr_tx, stderr_rx) = mpsc::channel();
        spawn_line_reader(stdout, stdout_tx);
        spawn_line_reader(stderr, stderr_tx);

        Ok(Self {
            child,
            stdin,
            stdout: stdout_rx,
            stderr: stderr_rx,
            adapter,
            engine: AngelEngine::new(protocol, capabilities),
            options: TransportOptions {
                client_info: TransportClientInfo::new(
                    "angel-engine-process-smoke",
                    env!("CARGO_PKG_VERSION"),
                ),
                experimental_api: true,
            },
        })
    }

    fn send_engine_plan(&mut self, plan: CommandPlan) -> Result<(), Box<dyn Error>> {
        for effect in plan.effects {
            let output = self
                .adapter
                .encode_effect(&self.engine, &effect, &self.options)?;
            self.apply_output(output)?;
        }
        Ok(())
    }

    fn apply_output(&mut self, output: TransportOutput) -> Result<(), Box<dyn Error>> {
        for message in &output.messages {
            self.write_message(message)?;
        }
        apply_transport_output(&mut self.engine, &output)?;
        Ok(())
    }

    fn write_message(&mut self, message: &JsonRpcMessage) -> Result<(), Box<dyn Error>> {
        writeln!(self.stdin, "{}", message.to_json_line()?)?;
        self.stdin.flush()?;
        Ok(())
    }

    fn process_one(&mut self, timeout: Duration) -> Result<bool, Box<dyn Error>> {
        let line = match self.stdout.recv_timeout(timeout) {
            Ok(line) => line,
            Err(mpsc::RecvTimeoutError::Timeout) => return Ok(false),
            Err(error) => return Err(Box::new(error)),
        };
        let value = serde_json::from_str(&line)
            .map_err(|error| format!("failed to parse agent JSON line `{line}`: {error}"))?;
        let message = JsonRpcMessage::from_value(value)?;
        let output = self.adapter.decode_message(&self.engine, &message)?;
        self.apply_output(output)?;
        Ok(true)
    }

    fn process_until(
        &mut self,
        label: &str,
        timeout: Duration,
        condition: impl Fn(&AngelEngine) -> bool,
    ) -> Result<(), Box<dyn Error>> {
        let deadline = Instant::now() + timeout;
        while !condition(&self.engine) {
            let Some(remaining) = deadline.checked_duration_since(Instant::now()) else {
                return Err(self.timeout_error(label, timeout));
            };
            self.process_one(remaining.min(Duration::from_secs(1)))?;
        }
        Ok(())
    }

    fn drain(&mut self, duration: Duration) -> Result<(), Box<dyn Error>> {
        let deadline = Instant::now() + duration;
        while let Some(remaining) = deadline.checked_duration_since(Instant::now()) {
            if !self.process_one(remaining.min(Duration::from_millis(100)))? {
                break;
            }
        }
        Ok(())
    }

    fn timeout_error(&mut self, label: &str, timeout: Duration) -> Box<dyn Error> {
        let stderr = self.stderr.try_iter().collect::<Vec<_>>().join("\n");
        format!(
            "agent process timed out during {label} after {timeout:?}; runtime={:?}; selected={:?}; pending={:?}; stderr:\n{stderr}",
            self.engine.runtime,
            self.engine.selected,
            self.engine.pending.requests,
        )
        .into()
    }

    fn initialize_runtime(&mut self) -> Result<(), Box<dyn Error>> {
        let plan = self.engine.plan_command(EngineCommand::Initialize)?;
        self.send_engine_plan(plan)?;
        let mut auth_sent = false;
        self.process_until("initialize", Duration::from_secs(20), |engine| {
            matches!(
                engine.runtime,
                RuntimeState::Available { .. } | RuntimeState::AwaitingAuth { .. }
            )
        })?;
        loop {
            match &self.engine.runtime {
                RuntimeState::Available { .. } => return Ok(()),
                RuntimeState::AwaitingAuth { methods } if !auth_sent => {
                    let method = methods
                        .first()
                        .cloned()
                        .ok_or("runtime requested auth without methods")?;
                    let plan = self
                        .engine
                        .plan_command(EngineCommand::Authenticate { method: method.id })?;
                    auth_sent = true;
                    self.send_engine_plan(plan)?;
                    self.process_until("authenticate", Duration::from_secs(20), |engine| {
                        matches!(engine.runtime, RuntimeState::Available { .. })
                    })?;
                }
                RuntimeState::Faulted(error) => {
                    return Err(format!("runtime faulted: {}", error.message).into());
                }
                other => return Err(format!("unexpected runtime state: {other:?}").into()),
            }
        }
    }

    fn start_conversation(&mut self) -> Result<ConversationId, Box<dyn Error>> {
        let plan = self.engine.plan_command(EngineCommand::StartConversation {
            params: StartConversationParams {
                cwd: Some(std::env::current_dir()?.display().to_string()),
                additional_directories: Vec::new(),
                context: ContextPatch::empty(),
            },
        })?;
        let conversation_id = plan
            .conversation_id
            .clone()
            .ok_or("start conversation produced no conversation id")?;
        self.send_engine_plan(plan)?;
        self.process_until("start conversation", Duration::from_secs(30), |engine| {
            engine
                .conversations
                .get(&conversation_id)
                .map(|conversation| matches!(conversation.lifecycle, ConversationLifecycle::Idle))
                .unwrap_or(false)
        })?;
        self.drain(Duration::from_millis(500))?;
        Ok(conversation_id)
    }

    fn run_turn(
        &mut self,
        conversation_id: ConversationId,
        prompt: &str,
    ) -> Result<TurnId, Box<dyn Error>> {
        let plan = self.engine.plan_command(EngineCommand::StartTurn {
            conversation_id: conversation_id.clone(),
            input: vec![UserInput::text(prompt)],
            overrides: TurnOverrides::default(),
        })?;
        let turn_id = plan
            .turn_id
            .clone()
            .ok_or("start turn produced no turn id")?;
        self.send_engine_plan(plan)?;
        self.process_until("run turn", Duration::from_secs(120), |engine| {
            engine
                .conversations
                .get(&conversation_id)
                .and_then(|conversation| conversation.turns.get(&turn_id))
                .map(TurnState::is_terminal)
                .unwrap_or(false)
        })?;
        Ok(turn_id)
    }

    fn start_turn_and_interrupt(
        &mut self,
        conversation_id: ConversationId,
        prompt: &str,
    ) -> Result<TurnId, Box<dyn Error>> {
        let plan = self.engine.plan_command(EngineCommand::StartTurn {
            conversation_id: conversation_id.clone(),
            input: vec![UserInput::text(prompt)],
            overrides: TurnOverrides::default(),
        })?;
        let turn_id = plan
            .turn_id
            .clone()
            .ok_or("start turn produced no turn id")?;
        let request_id = plan.request_id.clone().ok_or("start turn request id")?;
        self.send_engine_plan(plan)?;
        self.process_until("start turn accepted", Duration::from_secs(30), |engine| {
            !engine.pending.requests.contains_key(&request_id)
                && engine
                    .conversations
                    .get(&conversation_id)
                    .and_then(|conversation| conversation.turns.get(&turn_id))
                    .is_some_and(|turn| matches!(turn.remote, RemoteTurnId::Known(_)))
        })?;
        let cancel = self.engine.plan_command(EngineCommand::CancelTurn {
            conversation_id: conversation_id.clone(),
            turn_id: Some(turn_id.clone()),
        })?;
        let cancel_request_id = cancel.request_id.clone().ok_or("cancel request id")?;
        self.send_engine_plan(cancel)?;
        self.process_until("interrupt turn", Duration::from_secs(30), |engine| {
            !engine.pending.requests.contains_key(&cancel_request_id)
        })?;
        Ok(turn_id)
    }
}

impl<A> Drop for AgentProcess<A> {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[test]
fn codex_app_server_process_smoke_enters_and_exits_plan_mode() -> TestResult {
    let adapter = CodexAdapter::app_server();
    let capabilities = adapter.capabilities();
    let mut process = AgentProcess::spawn(
        "codex",
        &["app-server"],
        adapter,
        ProtocolFlavor::CodexAppServer,
        capabilities,
    )?;
    process.initialize_runtime()?;
    let conversation_id = process.start_conversation()?;
    let model =
        codex_model(&process.engine, &conversation_id).unwrap_or_else(|| "gpt-5.5".to_string());

    let enter_plan = process.engine.plan_command(EngineCommand::UpdateContext {
        conversation_id: conversation_id.clone(),
        patch: ContextPatch {
            updates: vec![
                ContextUpdate::Model {
                    scope: ContextScope::TurnAndFuture,
                    model: Some(model),
                },
                ContextUpdate::Mode {
                    scope: ContextScope::TurnAndFuture,
                    mode: Some(AgentMode {
                        id: "plan".to_string(),
                    }),
                },
            ],
        },
    })?;
    assert!(enter_plan.effects.is_empty());
    let plan_turn =
        process.start_turn_and_interrupt(conversation_id.clone(), "codex process smoke: plan")?;
    assert!(matches!(
        process.engine.conversations[&conversation_id].turns[&plan_turn].remote,
        RemoteTurnId::Known(_)
    ));

    let exit_plan = process.engine.plan_command(EngineCommand::UpdateContext {
        conversation_id: conversation_id.clone(),
        patch: ContextPatch::one(ContextUpdate::Mode {
            scope: ContextScope::TurnAndFuture,
            mode: Some(AgentMode {
                id: "default".to_string(),
            }),
        }),
    })?;
    assert!(exit_plan.effects.is_empty());
    assert_eq!(
        process.engine.conversations[&conversation_id]
            .context
            .mode
            .effective()
            .and_then(|mode| mode.as_ref())
            .map(|mode| mode.id.as_str()),
        Some("default")
    );

    Ok(())
}

#[test]
fn kimi_acp_process_smoke_enters_and_exits_plan_mode() -> TestResult {
    let adapter = AcpAdapter::standard();
    let capabilities = adapter.capabilities();
    let mut process =
        AgentProcess::spawn("kimi", &["acp"], adapter, ProtocolFlavor::Acp, capabilities)?;
    process.initialize_runtime()?;
    let conversation_id = process.start_conversation()?;
    assert!(
        process.engine.conversations[&conversation_id]
            .available_commands
            .iter()
            .any(|command| command.name == "plan"),
        "Kimi ACP did not advertise /plan command"
    );

    let plan_on = process.run_turn(conversation_id.clone(), "/plan on")?;
    let plan_on_output = turn_output_text(&process.engine, &conversation_id, &plan_on);
    assert!(
        plan_on_output.contains("Plan mode ON"),
        "unexpected /plan on output: {plan_on_output}"
    );
    assert!(
        plan_on_output.contains("Plan file:"),
        "missing plan file path in /plan on output: {plan_on_output}"
    );

    let plan_off = process.run_turn(conversation_id.clone(), "/plan off")?;
    let plan_off_output = turn_output_text(&process.engine, &conversation_id, &plan_off);
    assert!(
        plan_off_output.contains("Plan mode OFF"),
        "unexpected /plan off output: {plan_off_output}"
    );

    Ok(())
}

fn spawn_line_reader<R>(reader: R, tx: mpsc::Sender<String>)
where
    R: std::io::Read + Send + 'static,
{
    thread::spawn(move || {
        for line in BufReader::new(reader).lines().map_while(Result::ok) {
            if tx.send(line).is_err() {
                break;
            }
        }
    });
}

fn codex_model(engine: &AngelEngine, conversation_id: &ConversationId) -> Option<String> {
    engine
        .conversations
        .get(conversation_id)?
        .context
        .model
        .effective()
        .and_then(Clone::clone)
}

fn turn_output_text(
    engine: &AngelEngine,
    conversation_id: &ConversationId,
    turn_id: &TurnId,
) -> String {
    engine.conversations[conversation_id].turns[turn_id]
        .output
        .chunks
        .iter()
        .filter_map(|delta| match delta {
            ContentDelta::Text(text) => Some(text.as_str()),
            _ => None,
        })
        .collect::<String>()
}
