use std::error::Error;
use std::io::{self, BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::thread;
use std::time::Duration;

use angel_engine::{
    AgentMode, AngelEngine, ApprovalPolicy, AvailableCommand, CommandPlan, ContextPatch,
    ContextScope, ContextUpdate, ConversationCapabilities, ConversationId, ConversationLifecycle,
    ConversationState, ElicitationDecision, ElicitationKind, ElicitationPhase, ElicitationState,
    EngineCommand, JsonRpcMessage, PermissionProfile, ProtocolFlavor, ProtocolTransport,
    ReasoningProfile, RuntimeState, SandboxProfile, SessionConfigOption, StartConversationParams,
    TransportClientInfo, TransportLog, TransportLogKind, TransportOptions, UserAnswer, UserInput,
    UserQuestion, apply_transport_output,
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
        self.drain_startup_notifications()?;
        Ok(())
    }

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

    fn handle_setting_command(&mut self, line: &str) -> Result<bool, Box<dyn Error>> {
        let mut parts = line.splitn(2, char::is_whitespace);
        let command = parts.next().unwrap_or_default();
        let value = parts.next().unwrap_or_default().trim();
        match command {
            "/model" => {
                if value.is_empty() {
                    self.print_model_state()?;
                } else {
                    if self.update_context(ContextPatch::one(ContextUpdate::Model {
                        scope: ContextScope::TurnAndFuture,
                        model: Some(value.to_string()),
                    }))? {
                        println!("[state] model set to {value}");
                    }
                }
                Ok(true)
            }
            "/effort" | "/reasoning" => {
                if value.is_empty() {
                    self.print_effort_state()?;
                } else if self.config.protocol == ProtocolFlavor::CodexAppServer
                    && !is_codex_reasoning_effort(value)
                {
                    println!("[warn] use one of: none, minimal, low, medium, high, xhigh");
                } else {
                    let effort = if self.config.protocol == ProtocolFlavor::CodexAppServer {
                        value.to_ascii_lowercase()
                    } else {
                        value.to_string()
                    };
                    if self.update_context(ContextPatch::one(ContextUpdate::Reasoning {
                        scope: ContextScope::TurnAndFuture,
                        reasoning: Some(ReasoningProfile {
                            effort: Some(effort),
                            summary: None,
                        }),
                    }))? {
                        println!("[state] reasoning effort set to {value}");
                    }
                }
                Ok(true)
            }
            "/mode" => {
                if value.is_empty() {
                    self.print_mode_state()?;
                } else {
                    if self.update_context(ContextPatch::one(ContextUpdate::Mode {
                        scope: ContextScope::TurnAndFuture,
                        mode: Some(AgentMode {
                            id: value.to_string(),
                        }),
                    }))? {
                        println!("[state] mode set to {value}");
                        if self.config.protocol == ProtocolFlavor::CodexAppServer
                            && matches!(value, "plan" | "default")
                            && self.current_model().is_none()
                        {
                            println!(
                                "[warn] Codex collaborationMode requires a model in turn/start; set /model first if the next turn does not switch mode"
                            );
                        }
                    }
                }
                Ok(true)
            }
            "/permission" => {
                if value.is_empty() {
                    self.print_permission_state()?;
                } else {
                    if self.update_context(ContextPatch::one(ContextUpdate::Permissions {
                        scope: ContextScope::TurnAndFuture,
                        permissions: PermissionProfile {
                            name: value.to_string(),
                        },
                    }))? {
                        println!("[state] permission profile set to {value}");
                    }
                }
                Ok(true)
            }
            "/approval" => {
                if value.is_empty() {
                    self.print_permission_state()?;
                } else if let Some(policy) = parse_approval_policy(value) {
                    if self.update_context(ContextPatch::one(ContextUpdate::ApprovalPolicy {
                        scope: ContextScope::TurnAndFuture,
                        policy,
                    }))? {
                        println!("[state] approval policy set to {value}");
                    }
                } else {
                    println!("[warn] use one of: never, on-request, on-failure, untrusted");
                }
                Ok(true)
            }
            "/sandbox" => {
                if value.is_empty() {
                    self.print_permission_state()?;
                } else if let Some(sandbox) = parse_sandbox_profile(value) {
                    if self.update_context(ContextPatch::one(ContextUpdate::Sandbox {
                        scope: ContextScope::TurnAndFuture,
                        sandbox,
                    }))? {
                        println!("[state] sandbox set to {value}");
                    }
                } else {
                    println!("[warn] use one of: read-only, workspace-write, danger-full-access");
                }
                Ok(true)
            }
            _ => Ok(false),
        }
    }

    fn update_context(&mut self, patch: ContextPatch) -> Result<bool, Box<dyn Error>> {
        let conversation_id = self.selected_conversation()?;
        let before = self.context_snapshot(&conversation_id);
        let plan = self.engine.plan_command(EngineCommand::UpdateContext {
            conversation_id: conversation_id.clone(),
            patch,
        })?;
        let request_id = plan.request_id.clone();
        let has_effects = !plan.effects.is_empty();
        self.send_plan(plan)?;
        if let Some(request_id) = request_id {
            while self.engine.pending.requests.contains_key(&request_id) {
                self.process_next_line(None)?;
            }
        } else if !has_effects {
            if self.config.protocol == ProtocolFlavor::CodexAppServer {
                println!("[state] local setting will be sent with the next turn");
            } else {
                println!("[warn] no ACP config or mode endpoint was advertised for that setting");
            }
        }
        Ok(before != self.context_snapshot(&conversation_id))
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
        let Some((conversation_id, elicitation)) = self.next_open_elicitation() else {
            return Ok(false);
        };

        if matches!(elicitation.kind, ElicitationKind::UserInput) {
            self.resolve_user_input_elicitation(conversation_id, elicitation)?;
            return Ok(true);
        }

        println!(
            "[approval] {}",
            elicitation
                .options
                .title
                .clone()
                .unwrap_or_else(|| "approval requested".to_string())
        );
        if let Some(body) = elicitation.options.body.clone()
            && !body.is_empty()
        {
            println!("[approval] {body}");
        }
        if !elicitation.options.choices.is_empty() {
            println!(
                "[approval] options: {}",
                elicitation.options.choices.join(", ")
            );
        }
        print!("Allow? [y]es/[s]ession/[n]o/[c]ancel: ");
        io::stdout().flush()?;

        let input = read_stdin_line()?;
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
                elicitation_id: elicitation.id,
                decision,
            })?;
        self.send_plan(plan)?;
        Ok(true)
    }

    fn resolve_user_input_elicitation(
        &mut self,
        conversation_id: ConversationId,
        elicitation: ElicitationState,
    ) -> Result<(), Box<dyn Error>> {
        println!(
            "[input] {}",
            elicitation
                .options
                .title
                .clone()
                .unwrap_or_else(|| "input requested".to_string())
        );
        let decision = match self.read_user_answers(&elicitation)? {
            Some(answers) => ElicitationDecision::Answers(answers),
            None => ElicitationDecision::Cancel,
        };
        let plan = self
            .engine
            .plan_command(EngineCommand::ResolveElicitation {
                conversation_id,
                elicitation_id: elicitation.id,
                decision,
            })?;
        self.send_plan(plan)?;
        Ok(())
    }

    fn read_user_answers(
        &mut self,
        elicitation: &ElicitationState,
    ) -> Result<Option<Vec<UserAnswer>>, Box<dyn Error>> {
        if elicitation.options.questions.is_empty() {
            if let Some(body) = &elicitation.options.body
                && !body.is_empty()
            {
                println!("[input] {body}");
            }
            print!("Type your answer, or :cancel to cancel: ");
            io::stdout().flush()?;
            let input = read_stdin_line()?;
            if input.trim() == ":cancel" {
                return Ok(None);
            }
            return Ok(Some(vec![UserAnswer {
                id: "answer".to_string(),
                value: input.trim().to_string(),
            }]));
        }

        let mut answers = Vec::new();
        for question in &elicitation.options.questions {
            print_question(question);
            if question.options.is_empty() {
                print!("Type your answer, or :cancel to cancel: ");
            } else {
                print!(
                    "Choose 1-{} (or exact option text); use commas for multiple; :cancel to cancel: ",
                    question.options.len()
                );
            }
            io::stdout().flush()?;
            let input = read_stdin_line()?;
            if input.trim() == ":cancel" {
                return Ok(None);
            }
            let values = answer_values(question, input.trim());
            if values.is_empty() {
                answers.push(UserAnswer {
                    id: question.id.clone(),
                    value: String::new(),
                });
            } else {
                answers.extend(values.into_iter().map(|value| UserAnswer {
                    id: question.id.clone(),
                    value,
                }));
            }
        }
        Ok(Some(answers))
    }

    fn next_open_elicitation(&self) -> Option<(ConversationId, ElicitationState)> {
        let conversation_id = self.engine.selected.as_ref()?;
        let conversation = self.engine.conversations.get(conversation_id)?;
        conversation
            .elicitations
            .values()
            .find(|elicitation| matches!(elicitation.phase, ElicitationPhase::Open))
            .map(|elicitation| (conversation_id.clone(), elicitation.clone()))
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

    fn context_snapshot(&self, conversation_id: &ConversationId) -> String {
        self.engine
            .conversations
            .get(conversation_id)
            .map(|conversation| {
                format!(
                    "{:?}{:?}{:?}{:?}",
                    conversation.context,
                    conversation.config_options,
                    conversation.mode_state,
                    conversation.model_state
                )
            })
            .unwrap_or_default()
    }

    fn selected_available_commands(&self) -> &[AvailableCommand] {
        self.engine
            .selected
            .as_ref()
            .and_then(|id| self.engine.conversations.get(id))
            .map(|conversation| conversation.available_commands.as_slice())
            .unwrap_or(&[])
    }

    fn current_model(&self) -> Option<String> {
        self.engine
            .selected
            .as_ref()
            .and_then(|id| self.engine.conversations.get(id))
            .and_then(|conversation| conversation.context.model.effective())
            .and_then(|model| model.clone())
    }

    fn print_model_state(&self) -> Result<(), Box<dyn Error>> {
        let conversation_id = self.selected_conversation()?;
        let conversation = self
            .engine
            .conversations
            .get(&conversation_id)
            .ok_or("selected conversation missing")?;
        let current = self
            .current_model()
            .unwrap_or_else(|| "(default)".to_string());
        println!("[model] current: {current}");
        if let Some(option) = config_option(conversation, "model", &["model"]) {
            print_config_values("[model]", option);
        } else if let Some(models) = &conversation.model_state {
            let values = models
                .available_models
                .iter()
                .map(|model| model.id.as_str())
                .collect::<Vec<_>>();
            print_values("[model]", &values);
        }
        Ok(())
    }

    fn print_effort_state(&self) -> Result<(), Box<dyn Error>> {
        let conversation_id = self.selected_conversation()?;
        let conversation = self
            .engine
            .conversations
            .get(&conversation_id)
            .ok_or("selected conversation missing")?;
        let current = conversation
            .context
            .reasoning
            .effective()
            .and_then(|reasoning| reasoning.as_ref())
            .and_then(|reasoning| reasoning.effort.as_deref())
            .unwrap_or("(default)");
        println!("[effort] current: {current}");
        if let Some(option) = config_option(
            conversation,
            "thought_level",
            &[
                "thought_level",
                "reasoning",
                "reasoning_effort",
                "effort",
                "thinking",
                "thought",
            ],
        ) {
            print_config_values("[effort]", option);
        } else if self.config.protocol == ProtocolFlavor::CodexAppServer {
            println!("[effort] available: none, minimal, low, medium, high, xhigh");
        }
        Ok(())
    }

    fn print_mode_state(&self) -> Result<(), Box<dyn Error>> {
        let conversation_id = self.selected_conversation()?;
        let conversation = self
            .engine
            .conversations
            .get(&conversation_id)
            .ok_or("selected conversation missing")?;
        let current = conversation
            .context
            .mode
            .effective()
            .and_then(|mode| mode.as_ref())
            .map(|mode| mode.id.as_str())
            .unwrap_or("(default)");
        println!("[mode] current: {current}");
        if let Some(option) = config_option(conversation, "mode", &["mode"]) {
            print_config_values("[mode]", option);
        } else if let Some(modes) = &conversation.mode_state {
            let values = modes
                .available_modes
                .iter()
                .map(|mode| mode.id.as_str())
                .collect::<Vec<_>>();
            print_values("[mode]", &values);
        } else if self.config.protocol == ProtocolFlavor::CodexAppServer {
            println!("[mode] available: plan, default");
        }
        Ok(())
    }

    fn print_permission_state(&self) -> Result<(), Box<dyn Error>> {
        let conversation_id = self.selected_conversation()?;
        let conversation = self
            .engine
            .conversations
            .get(&conversation_id)
            .ok_or("selected conversation missing")?;
        let profile = conversation
            .context
            .permissions
            .effective()
            .map(|permissions| permissions.name.as_str())
            .unwrap_or("(default)");
        let approval = conversation
            .context
            .approvals
            .effective()
            .map(format_approval_policy)
            .unwrap_or("(default)");
        let sandbox = conversation
            .context
            .sandbox
            .effective()
            .map(format_sandbox_profile)
            .unwrap_or("(default)");
        println!("[permission] profile: {profile}; approval: {approval}; sandbox: {sandbox}");
        if let Some(option) = config_option(
            conversation,
            "permission",
            &[
                "permission",
                "permissions",
                "permission_profile",
                "approval",
                "approval_policy",
            ],
        )
        .or_else(|| config_option(conversation, "mode", &["mode"]))
        {
            print_config_values("[permission]", option);
        } else if self.config.protocol == ProtocolFlavor::CodexAppServer {
            println!(
                "[permission] commands: /permission <profile>, /approval <policy>, /sandbox <mode>"
            );
        }
        Ok(())
    }

    fn print_command_summary(&self) {
        let commands = self.selected_available_commands();
        if commands.is_empty() {
            return;
        }
        let names = commands
            .iter()
            .take(8)
            .map(|command| format!("/{}", command.name))
            .collect::<Vec<_>>()
            .join(", ");
        let suffix = if commands.len() > 8 { ", ..." } else { "" };
        println!(
            "[commands] {} available: {names}{suffix}; type /commands to list",
            commands.len()
        );
    }

    fn print_available_commands(&self) {
        let commands = self.selected_available_commands();
        if commands.is_empty() {
            println!("[commands] no slash commands advertised");
            return;
        }
        for command in commands {
            let input = command
                .input
                .as_ref()
                .map(|input| format!(" <{}>", compact_text(&input.hint, 40)))
                .unwrap_or_default();
            let description = compact_text(&command.description, 160);
            println!("[commands] /{}{} - {}", command.name, input, description);
        }
    }
}

fn print_question(question: &UserQuestion) {
    if !question.header.is_empty() {
        println!("[input] {}", question.header);
    }
    println!("[input] {}", question.question);
    for (index, option) in question.options.iter().enumerate() {
        if option.description.is_empty() {
            println!("[input] {}. {}", index + 1, option.label);
        } else {
            println!(
                "[input] {}. {} - {}",
                index + 1,
                option.label,
                option.description
            );
        }
    }
}

fn answer_values(question: &UserQuestion, input: &str) -> Vec<String> {
    if question.options.is_empty() {
        return if input.is_empty() {
            Vec::new()
        } else {
            vec![input.to_string()]
        };
    }

    input
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| {
            value
                .parse::<usize>()
                .ok()
                .and_then(|index| index.checked_sub(1))
                .and_then(|index| question.options.get(index))
                .map(|option| option.label.clone())
                .unwrap_or_else(|| value.to_string())
        })
        .collect()
}

fn read_stdin_line() -> io::Result<String> {
    let mut input = String::new();
    if io::stdin().read_line(&mut input)? == 0 {
        input.clear();
    }
    Ok(input)
}

fn compact_text(text: &str, max_chars: usize) -> String {
    let compact = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if compact.chars().count() <= max_chars {
        return compact;
    }
    let mut truncated = compact
        .chars()
        .take(max_chars.saturating_sub(3))
        .collect::<String>();
    truncated.push_str("...");
    truncated
}

fn config_option<'a>(
    conversation: &'a ConversationState,
    category: &str,
    ids: &[&str],
) -> Option<&'a SessionConfigOption> {
    conversation
        .config_options
        .iter()
        .find(|option| option.category.as_deref() == Some(category))
        .or_else(|| {
            conversation.config_options.iter().find(|option| {
                ids.iter().any(|id| {
                    option.id.eq_ignore_ascii_case(id) || normalize(&option.id) == normalize(id)
                })
            })
        })
        .or_else(|| {
            conversation.config_options.iter().find(|option| {
                let name = normalize(&option.name);
                ids.iter().any(|id| name == normalize(id))
            })
        })
}

fn print_config_values(prefix: &str, option: &SessionConfigOption) {
    if option.values.is_empty() {
        println!("{prefix} option: {}", option.id);
        return;
    }
    let values = option
        .values
        .iter()
        .map(|value| value.value.as_str())
        .collect::<Vec<_>>();
    print_values(prefix, &values);
}

fn print_values(prefix: &str, values: &[&str]) {
    if values.is_empty() {
        return;
    }
    let shown = values
        .iter()
        .take(16)
        .copied()
        .collect::<Vec<_>>()
        .join(", ");
    let suffix = if values.len() > 16 { ", ..." } else { "" };
    println!("{prefix} available: {shown}{suffix}");
}

fn normalize(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn parse_approval_policy(value: &str) -> Option<ApprovalPolicy> {
    match value.to_ascii_lowercase().as_str() {
        "never" => Some(ApprovalPolicy::Never),
        "on-request" | "on_request" | "request" => Some(ApprovalPolicy::OnRequest),
        "on-failure" | "on_failure" | "failure" => Some(ApprovalPolicy::OnFailure),
        "untrusted" | "unless-trusted" | "unless_trusted" => Some(ApprovalPolicy::UnlessTrusted),
        _ => None,
    }
}

fn is_codex_reasoning_effort(value: &str) -> bool {
    matches!(
        value.to_ascii_lowercase().as_str(),
        "none" | "minimal" | "low" | "medium" | "high" | "xhigh"
    )
}

fn parse_sandbox_profile(value: &str) -> Option<SandboxProfile> {
    match value.to_ascii_lowercase().as_str() {
        "read-only" | "read_only" | "readonly" => Some(SandboxProfile::ReadOnly),
        "workspace-write" | "workspace_write" | "workspace" => Some(SandboxProfile::WorkspaceWrite),
        "danger-full-access" | "danger_full_access" | "full-access" | "full" => {
            Some(SandboxProfile::FullAccess)
        }
        _ => None,
    }
}

fn format_approval_policy(policy: &ApprovalPolicy) -> &'static str {
    match policy {
        ApprovalPolicy::Never => "never",
        ApprovalPolicy::OnRequest => "on-request",
        ApprovalPolicy::OnFailure => "on-failure",
        ApprovalPolicy::UnlessTrusted => "untrusted",
    }
}

fn format_sandbox_profile(sandbox: &SandboxProfile) -> &str {
    match sandbox {
        SandboxProfile::ReadOnly => "read-only",
        SandboxProfile::WorkspaceWrite => "workspace-write",
        SandboxProfile::FullAccess => "danger-full-access",
        SandboxProfile::Custom(value) => value,
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
