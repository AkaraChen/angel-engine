use angel_provider::ProtocolAdapter;

use crate::ClientCommandResult;
use crate::adapter::RuntimeAdapter;
use crate::config::{ClientOptions, ClientOptionsBuilder, StartConversationRequest};
use crate::core::{AngelClientCore, DiscoveryRequest, ResumeConversationRequest};
use crate::error::ClientResult;
use crate::event::ClientUpdate;
use crate::process::AngelClient;
use crate::settings::{
    AvailableModeSettingSnapshot, AvailablePermissionModeSettingSnapshot, ModelListSettingSnapshot,
    ReasoningLevelSettingSnapshot, ThreadSettingsSnapshot,
};
use crate::snapshot::ClientSnapshot;
use crate::thread::Thread;

#[derive(Debug)]
pub struct Client<A = RuntimeAdapter> {
    pub(crate) core: AngelClientCore<A>,
}

impl Client<RuntimeAdapter> {
    pub fn builder() -> ClientOptionsBuilder {
        ClientOptions::builder()
    }

    pub fn new(options: ClientOptions) -> Self {
        Self {
            core: AngelClientCore::new(options),
        }
    }
}

impl<A> Client<A>
where
    A: ProtocolAdapter,
{
    pub fn new_with_adapter(options: ClientOptions, adapter: A) -> Self {
        Self {
            core: AngelClientCore::new_with_adapter(options, adapter),
        }
    }

    pub fn initialize(&mut self) -> ClientResult<ClientCommandResult> {
        self.core.initialize()
    }

    pub fn authenticate(
        &mut self,
        method_id: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        self.core.authenticate(method_id)
    }

    pub fn discover_threads(
        &mut self,
        request: DiscoveryRequest,
    ) -> ClientResult<ClientCommandResult> {
        self.core.discover_conversations(request)
    }

    pub fn start_thread(
        &mut self,
        request: StartConversationRequest,
    ) -> ClientResult<ClientCommandResult> {
        self.core.start_conversation(request)
    }

    pub fn resume_thread(
        &mut self,
        request: ResumeConversationRequest,
    ) -> ClientResult<ClientCommandResult> {
        self.core.resume_conversation(request)
    }

    pub fn receive_json_line(&mut self, line: &str) -> ClientResult<ClientUpdate> {
        self.core.receive_json_line(line)
    }

    pub fn receive_json_value(&mut self, value: serde_json::Value) -> ClientResult<ClientUpdate> {
        self.core.receive_json_value(value)
    }

    pub fn snapshot(&self) -> ClientSnapshot {
        self.core.snapshot()
    }

    pub fn selected_thread_id(&self) -> Option<String> {
        self.core.selected_conversation_id()
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

    pub fn permission_modes(
        &self,
        conversation_id: impl Into<String>,
    ) -> ClientResult<AvailablePermissionModeSettingSnapshot> {
        self.core.permission_modes(conversation_id)
    }

    pub fn set_model(
        &mut self,
        conversation_id: impl Into<String>,
        model: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        self.core.set_model(conversation_id, model)
    }

    pub fn set_mode(
        &mut self,
        conversation_id: impl Into<String>,
        mode: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        self.core.set_mode(conversation_id, mode)
    }

    pub fn set_permission_mode(
        &mut self,
        conversation_id: impl Into<String>,
        mode: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        self.core.set_permission_mode(conversation_id, mode)
    }

    pub fn set_reasoning_level(
        &mut self,
        conversation_id: impl Into<String>,
        level: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        self.core.set_reasoning_level(conversation_id, level)
    }

    pub fn set_reasoning_effort(
        &mut self,
        conversation_id: impl Into<String>,
        effort: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        self.core.set_reasoning_effort(conversation_id, effort)
    }

    pub fn get_thread(&mut self, conversation_id: impl Into<String>) -> Thread<'_, A> {
        Thread::new(self, conversation_id.into())
    }

    pub fn thread(&mut self, conversation_id: impl Into<String>) -> Thread<'_, A> {
        self.get_thread(conversation_id)
    }

    pub fn conversation(&mut self, conversation_id: impl Into<String>) -> Thread<'_, A> {
        self.get_thread(conversation_id)
    }

    pub fn selected_thread(&mut self) -> Option<Thread<'_, A>> {
        let conversation_id = self.selected_thread_id()?;
        Some(Thread::new(self, conversation_id))
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ClientBuilder {
    options: ClientOptions,
}

impl ClientBuilder {
    pub fn new(options: ClientOptions) -> Self {
        Self { options }
    }

    pub fn options(&self) -> &ClientOptions {
        &self.options
    }

    pub fn options_mut(&mut self) -> &mut ClientOptions {
        &mut self.options
    }

    pub fn build(self) -> Client {
        Client::new(self.options)
    }

    pub fn spawn(self) -> ClientResult<AngelClient> {
        AngelClient::spawn(self.options)
    }
}

impl ClientOptionsBuilder {
    pub fn build_client(self) -> Client {
        ClientBuilder::new(self.build()).build()
    }

    pub fn spawn(self) -> ClientResult<AngelClient> {
        ClientBuilder::new(self.build()).spawn()
    }
}
