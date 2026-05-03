use std::error::Error;
use std::time::Duration;

use angel_engine::{
    AngelEngine, CommandPlan, ConversationCapabilities, ConversationId, ConversationLifecycle,
    EngineCommand, JsonRpcMessage, ProtocolTransport, RuntimeState, StartConversationParams,
    TransportClientInfo, TransportOptions, apply_transport_output,
};
use test_cli::{AppLine, RuntimeProcess, TaggedLog, TaggedLogKind};

use super::{ProtocolShell, ShellConfig};

impl<A> ProtocolShell<A>
where
    A: ProtocolTransport,
{
    pub fn start(
        adapter: A,
        capabilities: ConversationCapabilities,
        config: ShellConfig,
    ) -> Result<Self, Box<dyn Error>> {
        let engine = AngelEngine::new(config.protocol, capabilities);
        let options = TransportOptions {
            client_info: TransportClientInfo::new(config.client_name, env!("CARGO_PKG_VERSION"))
                .title(config.client_title),
            experimental_api: true,
        };

        Ok(Self {
            process: RuntimeProcess::spawn(config.binary, config.args)?,
            printer: Default::default(),
            engine,
            adapter,
            options,
            config,
            pending_plan_ready_hint: None,
            printed_plan_ready_hints: Default::default(),
        })
    }

    pub fn initialize(&mut self) -> Result<(), Box<dyn Error>> {
        let plan = self.engine.plan_command(EngineCommand::Initialize)?;
        self.send_plan(plan)?;
        self.wait_for_runtime()?;

        let plan = self.engine.plan_command(EngineCommand::StartConversation {
            params: StartConversationParams {
                cwd: Some(std::env::current_dir()?.display().to_string()),
                additional_directories: Vec::new(),
                context: Default::default(),
            },
        })?;
        let conversation_id = plan.conversation_id.clone();
        self.send_plan(plan)?;
        self.wait_for_conversation_idle(conversation_id)?;
        self.drain_startup_notifications()?;
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

    fn drain_startup_notifications(&mut self) -> Result<(), Box<dyn Error>> {
        let mut timeout = Duration::from_millis(500);
        while self.process_next_line(Some(timeout))? {
            timeout = Duration::from_millis(50);
        }
        Ok(())
    }

    pub(super) fn send_plan(&mut self, plan: CommandPlan) -> Result<(), Box<dyn Error>> {
        for effect in plan.effects {
            let output = self
                .adapter
                .encode_effect(&self.engine, &effect, &self.options)?;
            self.handle_transport_output(&output)?;
        }
        Ok(())
    }

    pub(super) fn process_next_line(
        &mut self,
        timeout: Option<Duration>,
    ) -> Result<bool, Box<dyn Error>> {
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
                            .print_process_line(self.config.process_label, &line)?;
                        return Ok(true);
                    }
                };
                let message = JsonRpcMessage::from_value(value)?;
                let output = self.adapter.decode_message(&self.engine, &message)?;
                self.handle_transport_output(&output)?;
            }
            AppLine::Stderr(line) => {
                self.printer
                    .print_process_line(self.config.process_label, &line)?;
            }
        }
        Ok(true)
    }

    fn handle_transport_output(
        &mut self,
        output: &angel_engine::TransportOutput,
    ) -> Result<(), Box<dyn Error>> {
        let plan_ready_hints = self.plan_ready_hints(output);
        for log in &output.logs {
            self.printer.print_log(&transport_log(log))?;
        }
        for message in &output.messages {
            self.printer.before_tagged_output()?;
            self.process.write_line(&message.to_json_line()?)?;
        }
        apply_transport_output(&mut self.engine, output)?;
        for hint in plan_ready_hints {
            self.queue_plan_ready_hint(hint);
        }
        self.print_plan_ready_hint_if_interactive()?;
        Ok(())
    }
}

fn transport_log(log: &angel_engine::TransportLog) -> TaggedLog {
    TaggedLog::new(
        match log.kind {
            angel_engine::TransportLogKind::Send => TaggedLogKind::Send,
            angel_engine::TransportLogKind::Receive => TaggedLogKind::Receive,
            angel_engine::TransportLogKind::State => TaggedLogKind::State,
            angel_engine::TransportLogKind::Output => TaggedLogKind::Output,
            angel_engine::TransportLogKind::Warning => TaggedLogKind::Warning,
            angel_engine::TransportLogKind::Error => TaggedLogKind::Error,
        },
        log.message.clone(),
    )
}
