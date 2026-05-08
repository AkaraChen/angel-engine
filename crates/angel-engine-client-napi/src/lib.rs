use std::sync::{Arc, Mutex};
use std::time::Duration;

use angel_engine_client::{
    AgentRuntime as EngineAgentRuntime, AngelClient as ProcessAngelClient,
    AngelSession as EngineAngelSession, Client as EngineClient, ClientAnswer as EngineClientAnswer,
    ClientCommandResult as EngineClientCommandResult, ClientOptions as EngineClientOptions,
    ElicitationResponse as EngineElicitationResponse, HydrateRequest as EngineHydrateRequest,
    InspectRequest as EngineInspectRequest,
    ResumeConversationRequest as EngineResumeConversationRequest,
    RuntimeOptions as EngineRuntimeOptions,
    RuntimeOptionsOverrides as EngineRuntimeOptionsOverrides,
    SendTextRequest as EngineSendTextRequest, SetModeRequest as EngineSetModeRequest,
    StartConversationRequest as EngineStartConversationRequest, ThreadEvent as EngineThreadEvent,
    create_runtime_options as engine_create_runtime_options,
    normalize_runtime_name as engine_normalize_runtime_name,
};
use napi::ScopedTask;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde::Serialize;
use serde::de::DeserializeOwned;

mod adapter;
mod types;

use adapter::NapiRuntimeAdapter;

#[napi]
pub struct AngelClient {
    client: SharedProcessClient,
}

#[napi]
impl AngelClient {
    #[napi(constructor, ts_args_type = "options: ClientOptions")]
    pub fn new(options: serde_json::Value) -> Result<Self> {
        Ok(Self {
            client: Arc::new(Mutex::new(client_result(ProcessAngelClient::spawn(
                from_json(options)?,
            ))?)),
        })
    }

    #[napi(ts_return_type = "Promise<ClientUpdate>")]
    pub fn initialize(&self) -> AsyncTask<ClientJsonTask> {
        self.task(|client| client.initialize())
    }

    #[napi(
        js_name = "initializeAndStart",
        ts_args_type = "request?: StartConversationRequest | null",
        ts_return_type = "Promise<ClientCommandResult>"
    )]
    pub fn initialize_and_start(
        &self,
        request: Option<serde_json::Value>,
    ) -> Result<AsyncTask<ClientJsonTask>> {
        let request = optional_json::<EngineStartConversationRequest>(request)?;
        Ok(self.task(move |client| client.initialize_and_start(request)))
    }

    #[napi(
        js_name = "startThread",
        ts_args_type = "request?: StartConversationRequest | null",
        ts_return_type = "Promise<ClientCommandResult>"
    )]
    pub fn start_thread(
        &self,
        request: Option<serde_json::Value>,
    ) -> Result<AsyncTask<ClientJsonTask>> {
        let request = optional_json::<EngineStartConversationRequest>(request)?.unwrap_or_default();
        Ok(self.task(move |client| client.start_conversation(request)))
    }

    #[napi(
        js_name = "resumeThread",
        ts_args_type = "request: ResumeConversationRequest",
        ts_return_type = "Promise<ClientCommandResult>"
    )]
    pub fn resume_thread(&self, request: serde_json::Value) -> Result<AsyncTask<ClientJsonTask>> {
        let request = from_json::<EngineResumeConversationRequest>(request)?;
        Ok(self.task(move |client| client.resume_conversation(request)))
    }

    #[napi(js_name = "sendText", ts_return_type = "ClientCommandResult")]
    pub fn send_text(&self, conversation_id: String, text: String) -> Result<serde_json::Value> {
        self.with_client_json(move |client| client.send_text(conversation_id, text))
    }

    #[napi(
        js_name = "sendThreadEvent",
        ts_args_type = "conversationId: string, event: ThreadEvent",
        ts_return_type = "ClientCommandResult"
    )]
    pub fn send_thread_event(
        &self,
        conversation_id: String,
        event: serde_json::Value,
    ) -> Result<serde_json::Value> {
        let event = from_json(event)?;
        self.with_client_json(move |client| client.send_thread_event(conversation_id, event))
    }

    #[napi(
        js_name = "nextUpdate",
        ts_args_type = "timeoutMs?: number | null",
        ts_return_type = "Promise<ClientUpdate | null>"
    )]
    pub fn next_update(&self, timeout_ms: Option<u32>) -> AsyncTask<ClientJsonTask> {
        self.task(move |client| {
            client.next_update(timeout_ms.map(|ms| Duration::from_millis(ms as u64)))
        })
    }

    #[napi(ts_return_type = "Promise<ClientUpdate>")]
    pub fn drain(&self, timeout_ms: u32) -> AsyncTask<ClientJsonTask> {
        self.task(move |client| client.drain(Duration::from_millis(timeout_ms as u64)))
    }

    #[napi(ts_return_type = "ClientSnapshot")]
    pub fn snapshot(&self) -> Result<serde_json::Value> {
        self.with_client_json(|client| Ok(client.snapshot()))
    }

    #[napi(
        js_name = "threadState",
        ts_return_type = "ConversationSnapshot | null"
    )]
    pub fn thread_state(&self, conversation_id: String) -> Result<Option<serde_json::Value>> {
        let state = self.with_client(|client| {
            conversation_state_from_snapshot(client.snapshot(), &conversation_id)
        })?;
        optional_to_json(state)
    }

    #[napi(js_name = "threadSettings", ts_return_type = "ThreadSettingsSnapshot")]
    pub fn thread_settings(&self, conversation_id: String) -> Result<serde_json::Value> {
        self.with_client_json(move |client| client.thread_settings(conversation_id))
    }

    #[napi(
        js_name = "reasoningLevel",
        ts_return_type = "ReasoningLevelSettingSnapshot"
    )]
    pub fn reasoning_level(&self, conversation_id: String) -> Result<serde_json::Value> {
        self.with_client_json(move |client| client.reasoning_level(conversation_id))
    }

    #[napi(js_name = "modelList", ts_return_type = "ModelListSettingSnapshot")]
    pub fn model_list(&self, conversation_id: String) -> Result<serde_json::Value> {
        self.with_client_json(move |client| client.model_list(conversation_id))
    }

    #[napi(
        js_name = "availableModes",
        ts_return_type = "AvailableModeSettingSnapshot"
    )]
    pub fn available_modes(&self, conversation_id: String) -> Result<serde_json::Value> {
        self.with_client_json(move |client| client.available_modes(conversation_id))
    }

    #[napi(js_name = "turnState", ts_return_type = "TurnSnapshot | null")]
    pub fn turn_state(
        &self,
        conversation_id: String,
        turn_id: String,
    ) -> Result<Option<serde_json::Value>> {
        let turn = self.with_client(|client| {
            conversation_state_from_snapshot(client.snapshot(), &conversation_id).and_then(
                |conversation| {
                    conversation
                        .turns
                        .into_iter()
                        .find(|turn| turn.id == turn_id)
                },
            )
        })?;
        optional_to_json(turn)
    }

    #[napi(js_name = "openElicitations", ts_return_type = "ElicitationSnapshot[]")]
    pub fn open_elicitations(&self, conversation_id: String) -> Result<serde_json::Value> {
        self.with_client_json(move |client| Ok(client.open_elicitations(&conversation_id)))
    }

    #[napi(js_name = "threadIsIdle")]
    pub fn thread_is_idle(&self, conversation_id: String) -> Result<bool> {
        self.with_client(|client| {
            conversation_state_from_snapshot(client.snapshot(), &conversation_id)
                .map(|conversation| conversation.lifecycle == "idle")
                .unwrap_or(false)
        })
    }

    #[napi(js_name = "turnIsTerminal")]
    pub fn turn_is_terminal(&self, conversation_id: String, turn_id: String) -> Result<bool> {
        self.with_client(|client| {
            conversation_state_from_snapshot(client.snapshot(), &conversation_id)
                .and_then(|conversation| {
                    conversation
                        .turns
                        .into_iter()
                        .find(|turn| turn.id == turn_id)
                })
                .map(|turn| turn.phase.contains("terminal"))
                .unwrap_or(false)
        })
    }

    #[napi(js_name = "setModel", ts_return_type = "ClientCommandResult")]
    pub fn set_model(&self, conversation_id: String, model: String) -> Result<serde_json::Value> {
        self.with_client_json(move |client| {
            client.send_thread_event(conversation_id, EngineThreadEvent::set_model(model))
        })
    }

    #[napi(js_name = "setMode", ts_return_type = "ClientCommandResult")]
    pub fn set_mode(&self, conversation_id: String, mode: String) -> Result<serde_json::Value> {
        self.with_client_json(move |client| {
            client.send_thread_event(conversation_id, EngineThreadEvent::set_mode(mode))
        })
    }

    #[napi(js_name = "setReasoningEffort", ts_return_type = "ClientCommandResult")]
    pub fn set_reasoning_effort(
        &self,
        conversation_id: String,
        effort: String,
    ) -> Result<serde_json::Value> {
        self.with_client_json(move |client| {
            client.send_thread_event(
                conversation_id,
                EngineThreadEvent::set_reasoning_effort(effort),
            )
        })
    }

    #[napi(js_name = "setReasoningLevel", ts_return_type = "ClientCommandResult")]
    pub fn set_reasoning_level(
        &self,
        conversation_id: String,
        level: String,
    ) -> Result<serde_json::Value> {
        self.with_client_json(move |client| client.set_reasoning_level(conversation_id, level))
    }

    #[napi(js_name = "runShellCommand", ts_return_type = "ClientCommandResult")]
    pub fn run_shell_command(
        &self,
        conversation_id: String,
        command: String,
    ) -> Result<serde_json::Value> {
        self.with_client_json(move |client| {
            client.send_thread_event(conversation_id, EngineThreadEvent::shell(command))
        })
    }

    #[napi(
        js_name = "resolveElicitation",
        ts_args_type = "conversationId: string, elicitationId: string, response: ElicitationResponse",
        ts_return_type = "ClientCommandResult"
    )]
    pub fn resolve_elicitation(
        &self,
        conversation_id: String,
        elicitation_id: String,
        response: serde_json::Value,
    ) -> Result<serde_json::Value> {
        let response = from_json::<EngineElicitationResponse>(response)?;
        self.with_client_json(move |client| {
            client.send_thread_event(
                conversation_id,
                EngineThreadEvent::resolve(elicitation_id, response),
            )
        })
    }

    #[napi(
        js_name = "resolveFirstElicitation",
        ts_args_type = "conversationId: string, response: ElicitationResponse",
        ts_return_type = "ClientCommandResult"
    )]
    pub fn resolve_first_elicitation(
        &self,
        conversation_id: String,
        response: serde_json::Value,
    ) -> Result<serde_json::Value> {
        let response = from_json::<EngineElicitationResponse>(response)?;
        self.with_client_json(move |client| {
            client.send_thread_event(conversation_id, EngineThreadEvent::resolve_first(response))
        })
    }

    #[napi]
    pub fn close(&self) -> Result<()> {
        self.with_client(|client| client.close())
    }
}

impl AngelClient {
    fn task<F, T>(&self, action: F) -> AsyncTask<ClientJsonTask>
    where
        F: FnOnce(&mut ProcessAngelClient) -> angel_engine_client::ClientResult<T> + Send + 'static,
        T: Serialize + Send + 'static,
    {
        ClientJsonTask::new(self.client.clone(), action)
    }

    fn with_client<T, F>(&self, action: F) -> Result<T>
    where
        F: FnOnce(&mut ProcessAngelClient) -> T,
    {
        let mut client = self.client.lock().map_err(lock_error)?;
        Ok(action(&mut client))
    }

    fn with_client_json<T, F>(&self, action: F) -> Result<serde_json::Value>
    where
        F: FnOnce(&mut ProcessAngelClient) -> angel_engine_client::ClientResult<T>,
        T: Serialize,
    {
        let mut client = self.client.lock().map_err(lock_error)?;
        to_json(client_result(action(&mut client))?)
    }
}

type SharedProcessClient = Arc<Mutex<ProcessAngelClient>>;
type ClientAction =
    Box<dyn FnOnce(&mut ProcessAngelClient) -> Result<serde_json::Value> + Send + 'static>;

pub struct ClientJsonTask {
    client: SharedProcessClient,
    action: Option<ClientAction>,
}

impl ClientJsonTask {
    fn new<F, T>(client: SharedProcessClient, action: F) -> AsyncTask<Self>
    where
        F: FnOnce(&mut ProcessAngelClient) -> angel_engine_client::ClientResult<T> + Send + 'static,
        T: Serialize + Send + 'static,
    {
        AsyncTask::new(Self {
            client,
            action: Some(Box::new(move |client| {
                to_json(client_result(action(client))?)
            })),
        })
    }
}

impl<'task> ScopedTask<'task> for ClientJsonTask {
    type Output = serde_json::Value;
    type JsValue = Unknown<'task>;

    fn compute(&mut self) -> Result<Self::Output> {
        let action = self
            .action
            .take()
            .ok_or_else(|| Error::from_reason("client task was already consumed".to_string()))?;
        let mut client = self.client.lock().map_err(lock_error)?;
        action(&mut client)
    }

    fn resolve(&mut self, env: &'task Env, output: Self::Output) -> Result<Self::JsValue> {
        env.to_js_value(&output)
    }
}

#[napi]
pub struct AngelSession {
    session: SharedSession,
}

#[napi]
impl AngelSession {
    #[napi(constructor, ts_args_type = "options: RuntimeOptions")]
    pub fn new(options: serde_json::Value) -> Result<Self> {
        Ok(Self {
            session: Arc::new(Mutex::new(client_result(EngineAngelSession::new(
                from_json::<EngineRuntimeOptions>(options)?,
            ))?)),
        })
    }

    #[napi(js_name = "hasConversation")]
    pub fn has_conversation(&self) -> Result<bool> {
        let session = self.session.lock().map_err(lock_error)?;
        Ok(session.has_conversation())
    }

    #[napi(
        js_name = "hydrate",
        ts_args_type = "request?: HydrateRequest | null",
        ts_return_type = "Promise<ConversationSnapshot>"
    )]
    pub fn hydrate(
        &self,
        request: Option<serde_json::Value>,
    ) -> Result<AsyncTask<SessionJsonTask>> {
        let request = optional_json::<EngineHydrateRequest>(request)?.unwrap_or_default();
        Ok(self.task(move |session| session.hydrate(request)))
    }

    #[napi(
        js_name = "inspect",
        ts_args_type = "request?: InspectRequest | null",
        ts_return_type = "Promise<ConversationSnapshot>"
    )]
    pub fn inspect(
        &self,
        request: Option<serde_json::Value>,
    ) -> Result<AsyncTask<SessionJsonTask>> {
        let request = optional_json::<EngineInspectRequest>(request)?.unwrap_or_default();
        Ok(self.task(move |session| session.inspect(request)))
    }

    #[napi(
        js_name = "setMode",
        ts_args_type = "request: SetModeRequest",
        ts_return_type = "Promise<ConversationSnapshot>"
    )]
    pub fn set_mode(&self, request: serde_json::Value) -> Result<AsyncTask<SessionJsonTask>> {
        let request = from_json::<EngineSetModeRequest>(request)?;
        Ok(self.task(move |session| session.set_mode(request)))
    }

    #[napi(
        js_name = "startTextTurn",
        ts_args_type = "request: SendTextRequest",
        ts_return_type = "Promise<TurnRunEvent[]>"
    )]
    pub fn start_text_turn(
        &self,
        request: serde_json::Value,
    ) -> Result<AsyncTask<SessionJsonTask>> {
        let request = from_json::<EngineSendTextRequest>(request)?;
        Ok(self.task(move |session| session.start_text_turn(request)))
    }

    #[napi(
        js_name = "nextTurnEvent",
        ts_args_type = "timeoutMs?: number | null",
        ts_return_type = "Promise<TurnRunEvent | null>"
    )]
    pub fn next_turn_event(&self, timeout_ms: Option<u32>) -> AsyncTask<SessionJsonTask> {
        self.task(move |session| {
            session.next_turn_event(Duration::from_millis(timeout_ms.unwrap_or(50) as u64))
        })
    }

    #[napi(
        js_name = "resolveElicitation",
        ts_args_type = "elicitationId: string, response: ElicitationResponse",
        ts_return_type = "Promise<TurnRunEvent[]>"
    )]
    pub fn resolve_elicitation(
        &self,
        elicitation_id: String,
        response: serde_json::Value,
    ) -> Result<AsyncTask<SessionJsonTask>> {
        let response = from_json::<EngineElicitationResponse>(response)?;
        Ok(self.task(move |session| session.resolve_elicitation(elicitation_id, response)))
    }

    #[napi(js_name = "cancelTurn", ts_return_type = "Promise<TurnRunEvent[]>")]
    pub fn cancel_turn(&self) -> AsyncTask<SessionJsonTask> {
        self.task(|session| session.cancel_turn())
    }

    #[napi]
    pub fn close(&self) -> Result<()> {
        let mut session = self.session.lock().map_err(lock_error)?;
        session.close();
        Ok(())
    }
}

impl AngelSession {
    fn task<F, T>(&self, action: F) -> AsyncTask<SessionJsonTask>
    where
        F: FnOnce(&mut EngineAngelSession) -> angel_engine_client::ClientResult<T> + Send + 'static,
        T: Serialize + Send + 'static,
    {
        SessionJsonTask::new(self.session.clone(), action)
    }
}

type SharedSession = Arc<Mutex<EngineAngelSession>>;
type SessionAction =
    Box<dyn FnOnce(&mut EngineAngelSession) -> Result<serde_json::Value> + Send + 'static>;

pub struct SessionJsonTask {
    session: SharedSession,
    action: Option<SessionAction>,
}

impl SessionJsonTask {
    fn new<F, T>(session: SharedSession, action: F) -> AsyncTask<Self>
    where
        F: FnOnce(&mut EngineAngelSession) -> angel_engine_client::ClientResult<T> + Send + 'static,
        T: Serialize + Send + 'static,
    {
        AsyncTask::new(Self {
            session,
            action: Some(Box::new(move |session| {
                to_json(client_result(action(session))?)
            })),
        })
    }
}

impl<'task> ScopedTask<'task> for SessionJsonTask {
    type Output = serde_json::Value;
    type JsValue = Unknown<'task>;

    fn compute(&mut self) -> Result<Self::Output> {
        let action = self
            .action
            .take()
            .ok_or_else(|| Error::from_reason("session task was already consumed".to_string()))?;
        let mut session = self.session.lock().map_err(lock_error)?;
        action(&mut session)
    }

    fn resolve(&mut self, env: &'task Env, output: Self::Output) -> Result<Self::JsValue> {
        env.to_js_value(&output)
    }
}

#[napi]
pub struct AngelEngineClient {
    client: EngineClient<NapiRuntimeAdapter>,
}

#[napi]
impl AngelEngineClient {
    #[napi(
        constructor,
        ts_args_type = "options: ClientOptions, adapter?: AcpAdapter | { protocolFlavor?: () => `${ClientProtocol}`; capabilities?: () => unknown; encodeEffect: (input: AdapterEncodeInput) => TransportOutput; decodeMessage: (input: AdapterDecodeInput) => TransportOutput; modelCatalogFromRuntimeDebug?: (result: unknown, currentModelId?: string | null) => unknown | null } | null"
    )]
    pub fn new(options: serde_json::Value, adapter: Option<Object<'_>>) -> Result<Self> {
        let options = from_json::<EngineClientOptions>(options)?;
        let adapter = NapiRuntimeAdapter::new(&options, adapter)?;
        Ok(Self {
            client: EngineClient::new_with_adapter(options, adapter),
        })
    }

    #[napi(ts_return_type = "ClientCommandResult")]
    pub fn initialize(&mut self) -> Result<serde_json::Value> {
        to_json(client_result(self.client.initialize())?)
    }

    #[napi(ts_return_type = "ClientCommandResult")]
    pub fn authenticate(&mut self, method_id: String) -> Result<serde_json::Value> {
        to_json(client_result(self.client.authenticate(method_id))?)
    }

    #[napi(
        js_name = "discoverThreads",
        ts_args_type = "request?: { cwd?: string | null; additionalDirectories?: string[]; cursor?: string | null } | null",
        ts_return_type = "ClientCommandResult"
    )]
    pub fn discover_threads(
        &mut self,
        request: Option<serde_json::Value>,
    ) -> Result<serde_json::Value> {
        let request = optional_json(request)?.unwrap_or_default();
        to_json(client_result(self.client.discover_threads(request))?)
    }

    #[napi(
        js_name = "startThread",
        ts_args_type = "request?: StartConversationRequest | null",
        ts_return_type = "ClientCommandResult"
    )]
    pub fn start_thread(
        &mut self,
        request: Option<serde_json::Value>,
    ) -> Result<serde_json::Value> {
        let request = optional_json(request)?.unwrap_or_default();
        to_json(client_result(self.client.start_thread(request))?)
    }

    #[napi(
        js_name = "resumeThread",
        ts_args_type = "request: ResumeConversationRequest",
        ts_return_type = "ClientCommandResult"
    )]
    pub fn resume_thread(&mut self, request: serde_json::Value) -> Result<serde_json::Value> {
        let request = from_json::<EngineResumeConversationRequest>(request)?;
        to_json(client_result(self.client.resume_thread(request))?)
    }

    #[napi(js_name = "receiveJsonLine", ts_return_type = "ClientUpdate")]
    pub fn receive_json_line(&mut self, line: String) -> Result<serde_json::Value> {
        to_json(client_result(self.client.receive_json_line(&line))?)
    }

    #[napi(
        js_name = "receiveJson",
        ts_args_type = "value: unknown",
        ts_return_type = "ClientUpdate"
    )]
    pub fn receive_json(&mut self, value: serde_json::Value) -> Result<serde_json::Value> {
        to_json(client_result(self.client.receive_json_value(value))?)
    }

    #[napi(ts_return_type = "ClientSnapshot")]
    pub fn snapshot(&self) -> Result<serde_json::Value> {
        to_json(self.client.snapshot())
    }

    #[napi(js_name = "selectedThreadId")]
    pub fn selected_thread_id(&self) -> Option<String> {
        self.client.selected_thread_id()
    }

    #[napi(
        js_name = "threadState",
        ts_return_type = "ConversationSnapshot | null"
    )]
    pub fn thread_state(&self, conversation_id: String) -> Result<Option<serde_json::Value>> {
        optional_to_json(conversation_state(&self.client, &conversation_id))
    }

    #[napi(js_name = "threadSettings", ts_return_type = "ThreadSettingsSnapshot")]
    pub fn thread_settings(&self, conversation_id: String) -> Result<serde_json::Value> {
        to_json(client_result(self.client.thread_settings(conversation_id))?)
    }

    #[napi(
        js_name = "reasoningLevel",
        ts_return_type = "ReasoningLevelSettingSnapshot"
    )]
    pub fn reasoning_level(&self, conversation_id: String) -> Result<serde_json::Value> {
        to_json(client_result(self.client.reasoning_level(conversation_id))?)
    }

    #[napi(js_name = "modelList", ts_return_type = "ModelListSettingSnapshot")]
    pub fn model_list(&self, conversation_id: String) -> Result<serde_json::Value> {
        to_json(client_result(self.client.model_list(conversation_id))?)
    }

    #[napi(
        js_name = "availableModes",
        ts_return_type = "AvailableModeSettingSnapshot"
    )]
    pub fn available_modes(&self, conversation_id: String) -> Result<serde_json::Value> {
        to_json(client_result(self.client.available_modes(conversation_id))?)
    }

    #[napi(js_name = "turnState", ts_return_type = "TurnSnapshot | null")]
    pub fn turn_state(
        &self,
        conversation_id: String,
        turn_id: String,
    ) -> Result<Option<serde_json::Value>> {
        optional_to_json(conversation_state(&self.client, &conversation_id).and_then(
            |conversation| {
                conversation
                    .turns
                    .into_iter()
                    .find(|turn| turn.id == turn_id)
            },
        ))
    }

    #[napi(js_name = "openElicitations", ts_return_type = "ElicitationSnapshot[]")]
    pub fn open_elicitations(&mut self, conversation_id: String) -> Result<serde_json::Value> {
        to_json(self.client.thread(conversation_id).open_elicitations())
    }

    #[napi(js_name = "threadIsIdle")]
    pub fn thread_is_idle(&self, conversation_id: String) -> bool {
        conversation_state(&self.client, &conversation_id)
            .map(|conversation| conversation.lifecycle == "idle")
            .unwrap_or(false)
    }

    #[napi(js_name = "turnIsTerminal")]
    pub fn turn_is_terminal(&self, conversation_id: String, turn_id: String) -> bool {
        conversation_state(&self.client, &conversation_id)
            .and_then(|conversation| {
                conversation
                    .turns
                    .into_iter()
                    .find(|turn| turn.id == turn_id)
            })
            .map(|turn| turn.phase.contains("terminal"))
            .unwrap_or(false)
    }

    #[napi(
        js_name = "sendThreadEvent",
        ts_args_type = "conversationId: string, event: ThreadEvent",
        ts_return_type = "ClientCommandResult"
    )]
    pub fn send_thread_event(
        &mut self,
        conversation_id: String,
        event: serde_json::Value,
    ) -> Result<serde_json::Value> {
        let event = from_json(event)?;
        self.with_thread(conversation_id, event)
    }

    #[napi(js_name = "sendText", ts_return_type = "ClientCommandResult")]
    pub fn send_text(
        &mut self,
        conversation_id: String,
        text: String,
    ) -> Result<serde_json::Value> {
        self.with_thread(conversation_id, EngineThreadEvent::text(text))
    }

    #[napi(js_name = "setModel", ts_return_type = "ClientCommandResult")]
    pub fn set_model(
        &mut self,
        conversation_id: String,
        model: String,
    ) -> Result<serde_json::Value> {
        to_json(client_result(
            self.client.set_model(conversation_id, model),
        )?)
    }

    #[napi(js_name = "setMode", ts_return_type = "ClientCommandResult")]
    pub fn set_mode(&mut self, conversation_id: String, mode: String) -> Result<serde_json::Value> {
        to_json(client_result(self.client.set_mode(conversation_id, mode))?)
    }

    #[napi(js_name = "setReasoningEffort", ts_return_type = "ClientCommandResult")]
    pub fn set_reasoning_effort(
        &mut self,
        conversation_id: String,
        effort: String,
    ) -> Result<serde_json::Value> {
        to_json(client_result(
            self.client.set_reasoning_effort(conversation_id, effort),
        )?)
    }

    #[napi(js_name = "setReasoningLevel", ts_return_type = "ClientCommandResult")]
    pub fn set_reasoning_level(
        &mut self,
        conversation_id: String,
        level: String,
    ) -> Result<serde_json::Value> {
        to_json(client_result(
            self.client.set_reasoning_level(conversation_id, level),
        )?)
    }

    #[napi(js_name = "runShellCommand", ts_return_type = "ClientCommandResult")]
    pub fn run_shell_command(
        &mut self,
        conversation_id: String,
        command: String,
    ) -> Result<serde_json::Value> {
        self.with_thread(conversation_id, EngineThreadEvent::shell(command))
    }

    #[napi(
        js_name = "resolveElicitation",
        ts_args_type = "conversationId: string, elicitationId: string, response: ElicitationResponse",
        ts_return_type = "ClientCommandResult"
    )]
    pub fn resolve_elicitation(
        &mut self,
        conversation_id: String,
        elicitation_id: String,
        response: serde_json::Value,
    ) -> Result<serde_json::Value> {
        self.with_thread(
            conversation_id,
            EngineThreadEvent::resolve(
                elicitation_id,
                from_json::<EngineElicitationResponse>(response)?,
            ),
        )
    }

    #[napi(
        js_name = "resolveFirstElicitation",
        ts_args_type = "conversationId: string, response: ElicitationResponse",
        ts_return_type = "ClientCommandResult"
    )]
    pub fn resolve_first_elicitation(
        &mut self,
        conversation_id: String,
        response: serde_json::Value,
    ) -> Result<serde_json::Value> {
        self.with_thread(
            conversation_id,
            EngineThreadEvent::resolve_first(from_json::<EngineElicitationResponse>(response)?),
        )
    }
}

impl AngelEngineClient {
    fn with_thread(
        &mut self,
        conversation_id: String,
        event: EngineThreadEvent,
    ) -> Result<serde_json::Value> {
        let result: EngineClientCommandResult = {
            let mut thread = self.client.thread(conversation_id);
            client_result(thread.send_event(event))?
        };
        to_json(result)
    }
}

#[napi(
    js_name = "normalizeClientOptions",
    ts_args_type = "options: ClientOptions",
    ts_return_type = "ClientOptions"
)]
pub fn normalize_client_options(options: serde_json::Value) -> Result<serde_json::Value> {
    to_json(from_json::<EngineClientOptions>(options)?)
}

#[napi(js_name = "textThreadEvent", ts_return_type = "ThreadEvent")]
pub fn text_thread_event(text: String) -> Result<serde_json::Value> {
    to_json(EngineThreadEvent::text(text))
}

#[napi(
    js_name = "answersResponse",
    ts_args_type = "answers: ElicitationAnswer[]",
    ts_return_type = "ElicitationResponse"
)]
pub fn answers_response(answers: serde_json::Value) -> Result<serde_json::Value> {
    let answers = from_json::<Vec<EngineClientAnswer>>(answers)?;
    to_json(EngineElicitationResponse::answers(answers))
}

#[napi(
    js_name = "createRuntimeOptions",
    ts_args_type = "runtimeName?: string | null, overrides?: RuntimeOptionsOverrides | null",
    ts_return_type = "RuntimeOptions"
)]
pub fn create_runtime_options(
    runtime_name: Option<String>,
    overrides: Option<serde_json::Value>,
) -> Result<serde_json::Value> {
    let env_runtime = std::env::var("ANGEL_ENGINE_RUNTIME").ok();
    let runtime_name = runtime_name.as_deref().or(env_runtime.as_deref());
    let overrides = optional_json::<EngineRuntimeOptionsOverrides>(overrides)?.unwrap_or_default();
    to_json(engine_create_runtime_options(runtime_name, overrides))
}

#[napi(js_name = "normalizeRuntimeName", ts_return_type = "`${AgentRuntime}`")]
pub fn normalize_runtime_name(runtime: Option<String>) -> String {
    agent_runtime_name(engine_normalize_runtime_name(runtime.as_deref()))
}

fn conversation_state(
    client: &EngineClient<NapiRuntimeAdapter>,
    conversation_id: &str,
) -> Option<angel_engine_client::ConversationSnapshot> {
    conversation_state_from_snapshot(client.snapshot(), conversation_id)
}

fn conversation_state_from_snapshot(
    snapshot: angel_engine_client::ClientSnapshot,
    conversation_id: &str,
) -> Option<angel_engine_client::ConversationSnapshot> {
    snapshot
        .conversations
        .into_iter()
        .find(|conversation| conversation.id == conversation_id)
}

fn optional_json<T>(value: Option<serde_json::Value>) -> Result<Option<T>>
where
    T: DeserializeOwned,
{
    value.map(from_json).transpose()
}

fn to_json<T>(value: T) -> Result<serde_json::Value>
where
    T: Serialize,
{
    serde_json::to_value(value).map_err(to_napi_error)
}

fn optional_to_json<T>(value: Option<T>) -> Result<Option<serde_json::Value>>
where
    T: Serialize,
{
    value.map(to_json).transpose()
}

fn from_json<T>(value: serde_json::Value) -> Result<T>
where
    T: DeserializeOwned,
{
    serde_json::from_value(value).map_err(to_napi_error)
}

fn client_result<T>(result: angel_engine_client::ClientResult<T>) -> Result<T> {
    result.map_err(to_napi_error)
}

fn agent_runtime_name(runtime: EngineAgentRuntime) -> String {
    match runtime {
        EngineAgentRuntime::Codex => "codex".to_string(),
        EngineAgentRuntime::Kimi => "kimi".to_string(),
        EngineAgentRuntime::Opencode => "opencode".to_string(),
    }
}

fn lock_error<T>(_: std::sync::PoisonError<T>) -> Error {
    Error::from_reason("angel client lock was poisoned".to_string())
}

fn to_napi_error(error: impl std::fmt::Display) -> Error {
    Error::from_reason(error.to_string())
}
