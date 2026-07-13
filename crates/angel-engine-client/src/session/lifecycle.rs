use std::time::Duration;

use crate::error::{ClientError, ClientResult};
use crate::event::ClientUpdate;
use crate::{
    AngelClient, ClientProtocol, ConversationSnapshot, ResumeConversationRequest, RuntimeOptions,
    RuntimeOptionsOverrides, StartConversationRequest, ThreadEvent, create_runtime_options,
};

use super::AngelSession;
use super::helpers::{check_update_fault, invalid_input, request_completed, selected_config_value};
use super::types::{
    HydrateRequest, InspectRequest, RefreshSkillsRequest, SetModeRequest, SetPermissionModeRequest,
};

impl AngelSession {
    pub fn new(options: RuntimeOptions) -> ClientResult<Self> {
        let client = AngelClient::spawn(options.client_options())?;
        Ok(Self {
            client,
            options,
            conversation_id: None,
            active_turn: None,
        })
    }

    pub fn from_runtime(
        runtime_name: Option<&str>,
        overrides: RuntimeOptionsOverrides,
    ) -> ClientResult<Self> {
        Self::new(create_runtime_options(runtime_name, overrides)?)
    }

    pub fn has_conversation(&self) -> bool {
        self.conversation_id.is_some()
    }

    pub fn close(&mut self) {
        self.client.close();
    }

    pub fn hydrate(&mut self, request: HydrateRequest) -> ClientResult<ConversationSnapshot> {
        let conversation_was_started = self.conversation_id.is_some();
        self.ensure_started(false, request.cwd, request.remote_id)?;
        if conversation_was_started && self.active_turn.is_none() {
            let update = self.client.drain(Duration::from_millis(250))?;
            check_update_fault(&update)?;
        }
        self.thread_state()
            .ok_or_else(|| invalid_input("Runtime did not return a conversation snapshot."))
    }

    pub fn inspect(&mut self, request: InspectRequest) -> ClientResult<ConversationSnapshot> {
        self.ensure_started(true, request.cwd, None)?;
        self.thread_state()
            .ok_or_else(|| invalid_input("Runtime did not return a conversation snapshot."))
    }

    pub fn set_mode(&mut self, request: SetModeRequest) -> ClientResult<ConversationSnapshot> {
        let mode = selected_config_value(Some(&request.mode))
            .ok_or_else(|| invalid_input("Mode is required."))?;
        if self.active_turn.is_some() {
            return Err(invalid_input(
                "Cannot change mode while a chat turn is running.",
            ));
        }

        self.ensure_started(true, request.cwd, request.remote_id)?;
        let conversation_id = self.require_conversation_id()?.to_string();
        let result = self.client.set_mode(conversation_id, mode)?;
        self.drain_configuration_updates(result.update)?;
        self.thread_state()
            .ok_or_else(|| invalid_input("Runtime did not return a conversation snapshot."))
    }

    pub fn set_permission_mode(
        &mut self,
        request: SetPermissionModeRequest,
    ) -> ClientResult<ConversationSnapshot> {
        let mode = selected_config_value(Some(&request.mode))
            .ok_or_else(|| invalid_input("Permission mode is required."))?;
        if self.active_turn.is_some() {
            return Err(invalid_input(
                "Cannot change permission mode while a chat turn is running.",
            ));
        }

        self.ensure_started(true, request.cwd, request.remote_id)?;
        let conversation_id = self.require_conversation_id()?.to_string();
        let result = self.client.set_permission_mode(conversation_id, mode)?;
        self.drain_configuration_updates(result.update)?;
        self.thread_state()
            .ok_or_else(|| invalid_input("Runtime did not return a conversation snapshot."))
    }

    pub fn refresh_skills(
        &mut self,
        request: RefreshSkillsRequest,
    ) -> ClientResult<ConversationSnapshot> {
        if self.active_turn.is_some() {
            return Err(invalid_input(
                "Cannot refresh skills while a chat turn is running.",
            ));
        }

        self.ensure_started(true, request.cwd, request.remote_id)?;
        let conversation_id = self.require_conversation_id()?.to_string();
        let result = self.client.send_thread_event(
            conversation_id,
            ThreadEvent::refresh_skills(request.force_reload),
        )?;
        self.wait_for_request_completion(result.request_id.as_deref(), result.update)?;
        self.thread_state()
            .ok_or_else(|| invalid_input("Runtime did not return a conversation snapshot."))
    }

    pub(super) fn ensure_started(
        &mut self,
        allow_start: bool,
        cwd: Option<String>,
        remote_id: Option<String>,
    ) -> ClientResult<()> {
        if self.conversation_id.is_some() {
            return Ok(());
        }

        let initialize_update = self.client.initialize()?;
        check_update_fault(&initialize_update)?;
        let should_read_history = remote_id.is_some()
            && matches!(self.options.client.protocol, ClientProtocol::CodexAppServer);
        let result = if let Some(remote_id) = remote_id {
            self.client.resume_conversation(ResumeConversationRequest {
                additional_directories: Vec::new(),
                cwd,
                hydrate: true,
                remote_id,
            })?
        } else if allow_start {
            self.client.start_conversation(StartConversationRequest {
                additional_directories: Vec::new(),
                cwd: Some(cwd.ok_or_else(|| invalid_input("Conversation cwd is required."))?),
            })?
        } else {
            return Err(invalid_input(
                "Conversation has no remote thread to resume.",
            ));
        };
        check_update_fault(&result.update)?;

        self.conversation_id = result.conversation_id;
        if should_read_history {
            let conversation_id = self.require_conversation_id()?.to_string();
            let result = self.client.read_conversation(conversation_id)?;
            check_update_fault(&result.update)?;
        }
        Ok(())
    }

    pub(super) fn ensure_reasoning_effort(
        &mut self,
        conversation_id: &str,
        requested_effort: Option<&str>,
    ) -> ClientResult<()> {
        let env_effort = std::env::var("ANGEL_ENGINE_REASONING_EFFORT").ok();
        let effort = selected_config_value(requested_effort)
            .or_else(|| selected_config_value(self.options.default_reasoning_effort.as_deref()))
            .or_else(|| selected_config_value(env_effort.as_deref()));
        let Some(effort) = effort else {
            return Ok(());
        };

        let result = self.client.send_thread_event(
            conversation_id.to_string(),
            ThreadEvent::set_reasoning_effort(effort),
        )?;
        self.drain_configuration_updates(result.update)
    }

    pub(super) fn ensure_model(
        &mut self,
        conversation_id: &str,
        requested_model: Option<&str>,
    ) -> ClientResult<()> {
        let Some(model) = selected_config_value(requested_model) else {
            return Ok(());
        };
        let result = self
            .client
            .send_thread_event(conversation_id.to_string(), ThreadEvent::set_model(model))?;
        self.drain_configuration_updates(result.update)
    }

    pub(super) fn ensure_mode(
        &mut self,
        conversation_id: &str,
        requested_mode: Option<&str>,
    ) -> ClientResult<()> {
        let Some(mode) = selected_config_value(requested_mode) else {
            return Ok(());
        };
        let result = self
            .client
            .send_thread_event(conversation_id.to_string(), ThreadEvent::set_mode(mode))?;
        self.drain_configuration_updates(result.update)
    }

    pub(super) fn ensure_permission_mode(
        &mut self,
        conversation_id: &str,
        requested_mode: Option<&str>,
    ) -> ClientResult<()> {
        let Some(mode) = selected_config_value(requested_mode) else {
            return Ok(());
        };
        let result = self.client.send_thread_event(
            conversation_id.to_string(),
            ThreadEvent::set_permission_mode(mode),
        )?;
        self.drain_configuration_updates(result.update)
    }

    fn drain_configuration_updates(&mut self, initial: ClientUpdate) -> ClientResult<()> {
        check_update_fault(&initial)?;
        while let Some(update) = self.client.next_update(Some(Duration::from_millis(250)))? {
            check_update_fault(&update)?;
        }
        Ok(())
    }

    /// Blocks until `request_id` appears in a `ClientUpdate.completed_request_ids`,
    /// rather than a fixed idle window - a slow runtime scan (e.g. a large
    /// skills/list directory walk) can easily exceed a short poll timeout.
    fn wait_for_request_completion(
        &mut self,
        request_id: Option<&str>,
        initial: ClientUpdate,
    ) -> ClientResult<()> {
        check_update_fault(&initial)?;
        let Some(request_id) = request_id else {
            return Ok(());
        };
        if request_completed(&initial, request_id) {
            return Ok(());
        }
        loop {
            let update = self
                .client
                .next_update(None)?
                .ok_or(ClientError::ChannelClosed)?;
            check_update_fault(&update)?;
            if request_completed(&update, request_id) {
                return Ok(());
            }
        }
    }

    pub(super) fn thread_state(&self) -> Option<ConversationSnapshot> {
        let conversation_id = self.conversation_id.as_deref()?;
        self.thread_state_by_id(conversation_id)
    }

    pub(super) fn thread_state_by_id(&self, conversation_id: &str) -> Option<ConversationSnapshot> {
        self.client
            .snapshot()
            .conversations
            .into_iter()
            .find(|conversation| conversation.id == conversation_id)
    }

    pub(super) fn require_conversation_id(&self) -> ClientResult<&str> {
        self.conversation_id
            .as_deref()
            .ok_or_else(|| invalid_input("Runtime did not start a conversation."))
    }
}
