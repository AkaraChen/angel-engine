use crate::ClientCommandResult;
use crate::config::{ClientOptions, ClientOptionsBuilder, StartConversationRequest};
use crate::core::{AngelClientCore, DiscoveryRequest, ResumeConversationRequest};
use crate::error::ClientResult;
use crate::event::ClientUpdate;
use crate::process::AngelClient;
use crate::snapshot::ClientSnapshot;
use crate::thread::Thread;

#[derive(Debug)]
pub struct Client {
    pub(crate) core: AngelClientCore,
}

impl Client {
    pub fn builder() -> ClientOptionsBuilder {
        ClientOptions::builder()
    }

    pub fn new(options: ClientOptions) -> Self {
        Self {
            core: AngelClientCore::new(options),
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

    pub fn get_thread(&mut self, conversation_id: impl Into<String>) -> Thread<'_> {
        Thread::new(self, conversation_id.into())
    }

    pub fn thread(&mut self, conversation_id: impl Into<String>) -> Thread<'_> {
        self.get_thread(conversation_id)
    }

    pub fn conversation(&mut self, conversation_id: impl Into<String>) -> Thread<'_> {
        self.get_thread(conversation_id)
    }

    pub fn selected_thread(&mut self) -> Option<Thread<'_>> {
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
