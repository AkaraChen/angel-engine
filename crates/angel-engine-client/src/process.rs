use std::io::{self, BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::thread;
use std::time::Duration;

use crate::config::{ClientOptions, ClientProtocol, StartConversationRequest};
use crate::core::{AngelClientCore, process_log};
use crate::error::{ClientError, ClientResult};
use crate::event::{ClientLogKind, ClientUpdate};
use crate::settings::{
    AvailableModeSettingSnapshot, ModelListSettingSnapshot, ReasoningLevelSettingSnapshot,
    ThreadSettingsSnapshot,
};
use crate::snapshot::{RuntimeSnapshot, TurnSnapshot};
use crate::{ClientCommandResult, ElicitationSnapshot, ResumeConversationRequest, ThreadEvent};

pub struct AngelClient {
    child: Child,
    child_stdin: ChildStdin,
    lines: Receiver<ProcessLine>,
    core: AngelClientCore,
    default_cwd: Option<String>,
    default_additional_directories: Vec<String>,
    runtime_model_catalog_command: Option<String>,
    runtime_model_catalog: RuntimeModelCatalogCache,
}

impl AngelClient {
    pub fn spawn(options: ClientOptions) -> ClientResult<Self> {
        let runtime_model_catalog_command =
            (options.protocol == ClientProtocol::CodexAppServer).then(|| options.command.clone());
        let mut child = Command::new(&options.command)
            .args(&options.args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;

        let child_stdin = child
            .stdin
            .take()
            .ok_or_else(|| ClientError::InvalidInput {
                message: "runtime process did not expose stdin".to_string(),
            })?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| ClientError::InvalidInput {
                message: "runtime process did not expose stdout".to_string(),
            })?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| ClientError::InvalidInput {
                message: "runtime process did not expose stderr".to_string(),
            })?;
        let (tx, rx) = mpsc::channel();
        spawn_line_reader(stdout, tx.clone(), ProcessLine::Stdout);
        spawn_line_reader(stderr, tx, ProcessLine::Stderr);

        let default_cwd = options.cwd.clone();
        let default_additional_directories = options.additional_directories.clone();
        Ok(Self {
            child,
            child_stdin,
            lines: rx,
            core: AngelClientCore::new(options),
            default_cwd,
            default_additional_directories,
            runtime_model_catalog_command,
            runtime_model_catalog: RuntimeModelCatalogCache::NotLoaded,
        })
    }

    pub fn snapshot(&self) -> crate::ClientSnapshot {
        self.core.snapshot()
    }

    pub fn initialize(&mut self) -> ClientResult<ClientUpdate> {
        let result = self.core.initialize()?;
        let mut update = self.send_command_result(result)?;
        update.merge(self.wait_for_runtime()?);
        Ok(update)
    }

    pub fn initialize_and_start(
        &mut self,
        request: Option<StartConversationRequest>,
    ) -> ClientResult<ClientCommandResult> {
        let mut update = self.initialize()?;
        let mut result =
            self.start_conversation(request.unwrap_or_else(|| StartConversationRequest {
                cwd: self.default_cwd.clone().or_else(current_dir_string),
                additional_directories: self.default_additional_directories.clone(),
            }))?;
        update.merge(result.update);
        result.update = update;
        Ok(result)
    }

    pub fn start_conversation(
        &mut self,
        request: StartConversationRequest,
    ) -> ClientResult<ClientCommandResult> {
        let mut result = self.core.start_conversation(request)?;
        let sent = self.flush_update(&result.update)?;
        result.update.merge(sent);
        if let Some(conversation_id) = result.conversation_id.clone() {
            result
                .update
                .merge(self.wait_for_conversation_idle(&conversation_id)?);
            result.update.merge(self.drain(Duration::from_millis(150))?);
            self.hydrate_runtime_model_catalog(&conversation_id)?;
        }
        Ok(result)
    }

    pub fn resume_conversation(
        &mut self,
        request: ResumeConversationRequest,
    ) -> ClientResult<ClientCommandResult> {
        let mut result = self.core.resume_conversation(request)?;
        let sent = self.flush_update(&result.update)?;
        result.update.merge(sent);
        if let Some(conversation_id) = result.conversation_id.clone() {
            result
                .update
                .merge(self.wait_for_conversation_idle(&conversation_id)?);
            result.update.merge(self.drain(Duration::from_millis(150))?);
            self.hydrate_runtime_model_catalog(&conversation_id)?;
        }
        Ok(result)
    }

    pub fn send_text(
        &mut self,
        conversation_id: impl Into<String>,
        text: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        let mut result = self.core.send_text(conversation_id, text)?;
        let sent = self.flush_update(&result.update)?;
        result.update.merge(sent);
        Ok(result)
    }

    pub fn send_thread_event(
        &mut self,
        conversation_id: impl Into<String>,
        event: ThreadEvent,
    ) -> ClientResult<ClientCommandResult> {
        let conversation_id = conversation_id.into();
        let focused_turn_id = self.focused_turn_id(&conversation_id);
        let mut result = self
            .core
            .send_thread_event(conversation_id, event, focused_turn_id)?;
        let sent = self.flush_update(&result.update)?;
        result.update.merge(sent);
        Ok(result)
    }

    pub fn ask_text(
        &mut self,
        conversation_id: impl Into<String>,
        text: impl Into<String>,
    ) -> ClientResult<TurnSnapshot> {
        let conversation_id = conversation_id.into();
        let result = self.send_text(conversation_id.clone(), text)?;
        let turn_id = result.turn_id.ok_or_else(|| ClientError::InvalidInput {
            message: "turn command did not produce a turn id".to_string(),
        })?;
        let _ = self.wait_for_turn_terminal(&conversation_id, &turn_id)?;
        self.core
            .turn_snapshot(&conversation_id, &turn_id)
            .ok_or_else(|| ClientError::InvalidInput {
                message: format!("turn {turn_id} was not found after completion"),
            })
    }

    pub fn wait_for_turn_terminal(
        &mut self,
        conversation_id: &str,
        turn_id: &str,
    ) -> ClientResult<ClientUpdate> {
        let mut update = ClientUpdate::default();
        while !self.core.turn_is_terminal(conversation_id, turn_id) {
            update.merge(self.next_update(None)?.ok_or(ClientError::ChannelClosed)?);
        }
        Ok(update)
    }

    pub fn next_update(&mut self, timeout: Option<Duration>) -> ClientResult<Option<ClientUpdate>> {
        let line = match timeout {
            Some(timeout) => match self.lines.recv_timeout(timeout) {
                Ok(line) => line,
                Err(mpsc::RecvTimeoutError::Timeout) => return Ok(None),
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    return Err(ClientError::ChannelClosed);
                }
            },
            None => self.lines.recv().map_err(|_| ClientError::ChannelClosed)?,
        };

        let mut update = match line {
            ProcessLine::Stdout(line) => match self.core.receive_json_line(&line) {
                Ok(update) => update,
                Err(ClientError::Json(_)) => process_log(ClientLogKind::ProcessStdout, line),
                Err(error) => return Err(error),
            },
            ProcessLine::Stderr(line) => process_log(ClientLogKind::ProcessStderr, line),
        };
        let sent = self.flush_update(&update)?;
        update.merge(sent);
        Ok(Some(update))
    }

    pub fn drain(&mut self, timeout: Duration) -> ClientResult<ClientUpdate> {
        let mut update = ClientUpdate::default();
        while let Some(next) = self.next_update(Some(timeout))? {
            update.merge(next);
        }
        Ok(update)
    }

    pub fn open_elicitations(&self, conversation_id: &str) -> Vec<ElicitationSnapshot> {
        self.core.open_elicitations(conversation_id)
    }

    pub fn thread_settings(
        &self,
        conversation_id: impl Into<String>,
    ) -> ClientResult<ThreadSettingsSnapshot> {
        self.core.thread_settings(conversation_id)
    }

    pub fn reasoning_level(
        &self,
        conversation_id: impl Into<String>,
    ) -> ClientResult<ReasoningLevelSettingSnapshot> {
        self.core.reasoning_level(conversation_id)
    }

    pub fn model_list(
        &self,
        conversation_id: impl Into<String>,
    ) -> ClientResult<ModelListSettingSnapshot> {
        self.core.model_list(conversation_id)
    }

    pub fn available_modes(
        &self,
        conversation_id: impl Into<String>,
    ) -> ClientResult<AvailableModeSettingSnapshot> {
        self.core.available_modes(conversation_id)
    }

    pub fn set_model(
        &mut self,
        conversation_id: impl Into<String>,
        model: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        let mut result = self.core.set_model(conversation_id, model)?;
        let sent = self.flush_update(&result.update)?;
        result.update.merge(sent);
        Ok(result)
    }

    pub fn set_model_list(
        &mut self,
        conversation_id: impl Into<String>,
        model: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        self.set_model(conversation_id, model)
    }

    pub fn set_mode(
        &mut self,
        conversation_id: impl Into<String>,
        mode: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        let mut result = self.core.set_mode(conversation_id, mode)?;
        let sent = self.flush_update(&result.update)?;
        result.update.merge(sent);
        Ok(result)
    }

    pub fn set_reasoning_level(
        &mut self,
        conversation_id: impl Into<String>,
        level: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        let mut result = self.core.set_reasoning_level(conversation_id, level)?;
        let sent = self.flush_update(&result.update)?;
        result.update.merge(sent);
        Ok(result)
    }

    pub fn set_reasoning_effort(
        &mut self,
        conversation_id: impl Into<String>,
        effort: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        self.set_reasoning_level(conversation_id, effort)
    }

    pub fn close(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }

    fn focused_turn_id(&self, conversation_id: &str) -> Option<String> {
        self.snapshot()
            .conversations
            .into_iter()
            .find(|conversation| conversation.id == conversation_id)
            .and_then(|conversation| conversation.focused_turn_id)
    }

    fn hydrate_runtime_model_catalog(&mut self, conversation_id: &str) -> ClientResult<()> {
        if !self.core.needs_runtime_model_catalog(conversation_id)? {
            return Ok(());
        }

        let Some(catalog) = self.runtime_model_catalog().cloned() else {
            return Ok(());
        };

        self.core
            .hydrate_model_catalog_from_runtime_debug(conversation_id, &catalog)
    }

    fn runtime_model_catalog(&mut self) -> Option<&serde_json::Value> {
        if matches!(
            self.runtime_model_catalog,
            RuntimeModelCatalogCache::NotLoaded
        ) {
            self.runtime_model_catalog = self
                .runtime_model_catalog_command
                .as_deref()
                .and_then(load_runtime_model_catalog)
                .map(RuntimeModelCatalogCache::Loaded)
                .unwrap_or(RuntimeModelCatalogCache::Unavailable);
        }

        match &self.runtime_model_catalog {
            RuntimeModelCatalogCache::Loaded(catalog) => Some(catalog),
            RuntimeModelCatalogCache::NotLoaded | RuntimeModelCatalogCache::Unavailable => None,
        }
    }

    fn wait_for_runtime(&mut self) -> ClientResult<ClientUpdate> {
        let mut update = ClientUpdate::default();
        let mut auth_sent = false;
        loop {
            match self.snapshot().runtime {
                RuntimeSnapshot::Available { .. } => return Ok(update),
                RuntimeSnapshot::AwaitingAuth { methods }
                    if self.core.auto_authenticate() && !auth_sent =>
                {
                    let method = methods
                        .first()
                        .ok_or_else(|| ClientError::InvalidInput {
                            message: "runtime requested auth without advertising a method"
                                .to_string(),
                        })?
                        .id
                        .clone();
                    auth_sent = true;
                    let auth = self.core.authenticate(method)?;
                    update.merge(self.send_command_result(auth)?);
                }
                RuntimeSnapshot::Faulted { code, message, .. } => {
                    return Err(ClientError::RuntimeFaulted { code, message });
                }
                _ => update.merge(self.next_update(None)?.ok_or(ClientError::ChannelClosed)?),
            }
        }
    }

    fn wait_for_conversation_idle(&mut self, conversation_id: &str) -> ClientResult<ClientUpdate> {
        let mut update = ClientUpdate::default();
        while !self.core.conversation_is_idle(conversation_id) {
            update.merge(self.next_update(None)?.ok_or(ClientError::ChannelClosed)?);
        }
        Ok(update)
    }

    fn send_command_result(&mut self, result: ClientCommandResult) -> ClientResult<ClientUpdate> {
        let mut update = result.update;
        let sent = self.flush_update(&update)?;
        update.merge(sent);
        Ok(update)
    }

    fn flush_update(&mut self, update: &ClientUpdate) -> ClientResult<ClientUpdate> {
        for outbound in &update.outgoing {
            writeln!(self.child_stdin, "{}", outbound.line)?;
        }
        if !update.outgoing.is_empty() {
            self.child_stdin.flush()?;
        }
        Ok(ClientUpdate::default())
    }
}

fn load_runtime_model_catalog(command: &str) -> Option<serde_json::Value> {
    let output = Command::new(command)
        .args(["debug", "models"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    serde_json::from_slice(&output.stdout).ok()
}

enum RuntimeModelCatalogCache {
    NotLoaded,
    Unavailable,
    Loaded(serde_json::Value),
}

impl Drop for AngelClient {
    fn drop(&mut self) {
        self.close();
    }
}

enum ProcessLine {
    Stdout(String),
    Stderr(String),
}

fn spawn_line_reader<R, F>(reader: R, tx: mpsc::Sender<ProcessLine>, wrap: F)
where
    R: io::Read + Send + 'static,
    F: Fn(String) -> ProcessLine + Send + 'static + Copy,
{
    thread::spawn(move || {
        for line in BufReader::new(reader).lines().map_while(Result::ok) {
            if tx.send(wrap(line)).is_err() {
                break;
            }
        }
    });
}

fn current_dir_string() -> Option<String> {
    std::env::current_dir()
        .ok()
        .map(|path| path.display().to_string())
}
