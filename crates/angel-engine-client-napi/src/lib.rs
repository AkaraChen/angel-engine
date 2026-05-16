use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use angel_engine_client::{
    AgentRuntime as EngineAgentRuntime, AngelClient as ProcessAngelClient,
    AngelSession as EngineAngelSession, Client as EngineClient, ClientAnswer as EngineClientAnswer,
    ClientCommandResult as EngineClientCommandResult, ClientOptions as EngineClientOptions,
    DiscoveryRequest as EngineDiscoveryRequest, ElicitationResponse as EngineElicitationResponse,
    HydrateRequest as EngineHydrateRequest, InspectRequest as EngineInspectRequest,
    ResumeConversationRequest as EngineResumeConversationRequest,
    RuntimeOptions as EngineRuntimeOptions,
    RuntimeOptionsOverrides as EngineRuntimeOptionsOverrides,
    SendTextRequest as EngineSendTextRequest, SetModeRequest as EngineSetModeRequest,
    SetPermissionModeRequest as EngineSetPermissionModeRequest,
    StartConversationRequest as EngineStartConversationRequest, ThreadEvent as EngineThreadEvent,
    create_runtime_options as engine_create_runtime_options,
};
use garde::Validate;
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
        let options = from_json::<EngineClientOptions>(options)?;
        let detail = client_options_trace(&options);
        trace_napi_sync_result("AngelClient.new", detail, || {
            Ok(Self {
                client: Arc::new(Mutex::new(client_result(ProcessAngelClient::spawn(
                    options,
                ))?)),
            })
        })
    }

    #[napi(ts_return_type = "Promise<ClientUpdate>")]
    pub fn initialize(&self) -> AsyncTask<ClientJsonTask> {
        self.task("AngelClient.initialize", "no_args", |client| {
            client.initialize()
        })
    }

    #[napi(
        js_name = "initializeAndStart",
        ts_args_type = "request: StartConversationRequest",
        ts_return_type = "Promise<ClientCommandResult>"
    )]
    pub fn initialize_and_start(
        &self,
        request: Option<serde_json::Value>,
    ) -> Result<AsyncTask<ClientJsonTask>> {
        let request = match optional_json::<EngineStartConversationRequest>(request)? {
            Some(request) => request,
            None => return Err(to_napi_error("initializeAndStart request is required")),
        };
        Ok(self.task(
            "AngelClient.initializeAndStart",
            format!(
                "cwd={} additional_directories={}",
                request.cwd.as_deref().unwrap_or("<none>"),
                request.additional_directories.len(),
            ),
            move |client| client.initialize_and_start(request),
        ))
    }

    #[napi(
        js_name = "startThread",
        ts_args_type = "request: StartConversationRequest",
        ts_return_type = "Promise<ClientCommandResult>"
    )]
    pub fn start_thread(
        &self,
        request: Option<serde_json::Value>,
    ) -> Result<AsyncTask<ClientJsonTask>> {
        let request = match optional_json::<EngineStartConversationRequest>(request)? {
            Some(request) => request,
            None => return Err(to_napi_error("startThread request is required")),
        };
        Ok(self.task(
            "AngelClient.startThread",
            format!(
                "cwd={} additional_directories={}",
                request.cwd.as_deref().unwrap_or("<none>"),
                request.additional_directories.len()
            ),
            move |client| client.start_conversation(request),
        ))
    }

    #[napi(
        js_name = "resumeThread",
        ts_args_type = "request: ResumeConversationRequest",
        ts_return_type = "Promise<ClientCommandResult>"
    )]
    pub fn resume_thread(&self, request: serde_json::Value) -> Result<AsyncTask<ClientJsonTask>> {
        let request = from_json::<EngineResumeConversationRequest>(request)?;
        Ok(self.task(
            "AngelClient.resumeThread",
            format!(
                "remote_id={} hydrate={} cwd={} additional_directories={}",
                request.remote_id,
                request.hydrate,
                request.cwd.as_deref().unwrap_or("<none>"),
                request.additional_directories.len()
            ),
            move |client| client.resume_conversation(request),
        ))
    }

    #[napi(js_name = "sendText", ts_return_type = "ClientCommandResult")]
    pub fn send_text(&self, conversation_id: String, text: String) -> Result<serde_json::Value> {
        self.with_client_json(
            "AngelClient.sendText",
            format!(
                "conversation_id={} text_len={}",
                conversation_id,
                text.chars().count()
            ),
            move |client| client.send_text(conversation_id, text),
        )
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
        self.with_client_json(
            "AngelClient.sendThreadEvent",
            format!(
                "conversation_id={} event_kind={}",
                conversation_id,
                thread_event_kind(&event)
            ),
            move |client| client.send_thread_event(conversation_id, event),
        )
    }

    #[napi(
        js_name = "nextUpdate",
        ts_args_type = "timeoutMs?: number | null",
        ts_return_type = "Promise<ClientUpdate | null>"
    )]
    pub fn next_update(&self, timeout_ms: Option<u32>) -> AsyncTask<ClientJsonTask> {
        self.task(
            "AngelClient.nextUpdate",
            format!("timeout_ms={}", option_u32(timeout_ms)),
            move |client| client.next_update(timeout_ms.map(|ms| Duration::from_millis(ms as u64))),
        )
    }

    #[napi(ts_return_type = "Promise<ClientUpdate>")]
    pub fn drain(&self, timeout_ms: u32) -> AsyncTask<ClientJsonTask> {
        self.task(
            "AngelClient.drain",
            format!("timeout_ms={timeout_ms}"),
            move |client| client.drain(Duration::from_millis(timeout_ms as u64)),
        )
    }

    #[napi(ts_return_type = "ClientSnapshot")]
    pub fn snapshot(&self) -> Result<serde_json::Value> {
        self.with_client_json("AngelClient.snapshot", "no_args", |client| {
            Ok(client.snapshot())
        })
    }

    #[napi(
        js_name = "threadState",
        ts_return_type = "ConversationSnapshot | null"
    )]
    pub fn thread_state(&self, conversation_id: String) -> Result<Option<serde_json::Value>> {
        let state = self.with_client(
            "AngelClient.threadState",
            format!("conversation_id={conversation_id}"),
            |client| conversation_state_from_snapshot(client.snapshot(), &conversation_id),
        )?;
        optional_to_json(state)
    }

    #[napi(js_name = "threadSettings", ts_return_type = "ThreadSettingsSnapshot")]
    pub fn thread_settings(&self, conversation_id: String) -> Result<serde_json::Value> {
        self.with_client_json(
            "AngelClient.threadSettings",
            format!("conversation_id={conversation_id}"),
            move |client| client.thread_settings(conversation_id),
        )
    }

    #[napi(
        js_name = "reasoningLevel",
        ts_return_type = "ReasoningLevelSettingSnapshot"
    )]
    pub fn reasoning_level(&self, conversation_id: String) -> Result<serde_json::Value> {
        self.with_client_json(
            "AngelClient.reasoningLevel",
            format!("conversation_id={conversation_id}"),
            move |client| client.reasoning_level(conversation_id),
        )
    }

    #[napi(js_name = "modelList", ts_return_type = "ModelListSettingSnapshot")]
    pub fn model_list(&self, conversation_id: String) -> Result<serde_json::Value> {
        self.with_client_json(
            "AngelClient.modelList",
            format!("conversation_id={conversation_id}"),
            move |client| client.model_list(conversation_id),
        )
    }

    #[napi(
        js_name = "availableModes",
        ts_return_type = "AvailableModeSettingSnapshot"
    )]
    pub fn available_modes(&self, conversation_id: String) -> Result<serde_json::Value> {
        self.with_client_json(
            "AngelClient.availableModes",
            format!("conversation_id={conversation_id}"),
            move |client| client.available_modes(conversation_id),
        )
    }

    #[napi(
        js_name = "permissionModes",
        ts_return_type = "AvailablePermissionModeSettingSnapshot"
    )]
    pub fn permission_modes(&self, conversation_id: String) -> Result<serde_json::Value> {
        self.with_client_json(
            "AngelClient.permissionModes",
            format!("conversation_id={conversation_id}"),
            move |client| client.permission_modes(conversation_id),
        )
    }

    #[napi(js_name = "turnState", ts_return_type = "TurnSnapshot | null")]
    pub fn turn_state(
        &self,
        conversation_id: String,
        turn_id: String,
    ) -> Result<Option<serde_json::Value>> {
        let detail = format!("conversation_id={conversation_id} turn_id={turn_id}");
        let turn = self.with_client("AngelClient.turnState", detail, |client| {
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
        self.with_client_json(
            "AngelClient.openElicitations",
            format!("conversation_id={conversation_id}"),
            move |client| Ok(client.open_elicitations(&conversation_id)),
        )
    }

    #[napi(js_name = "threadIsIdle")]
    pub fn thread_is_idle(&self, conversation_id: String) -> Result<bool> {
        self.with_client(
            "AngelClient.threadIsIdle",
            format!("conversation_id={conversation_id}"),
            |client| {
                conversation_state_from_snapshot(client.snapshot(), &conversation_id)
                    .map(|conversation| conversation.lifecycle == "idle")
                    .unwrap_or(false)
            },
        )
    }

    #[napi(js_name = "turnIsTerminal")]
    pub fn turn_is_terminal(&self, conversation_id: String, turn_id: String) -> Result<bool> {
        let detail = format!("conversation_id={conversation_id} turn_id={turn_id}");
        self.with_client("AngelClient.turnIsTerminal", detail, |client| {
            conversation_state_from_snapshot(client.snapshot(), &conversation_id)
                .and_then(|conversation| {
                    conversation
                        .turns
                        .into_iter()
                        .find(|turn| turn.id == turn_id)
                })
                .map(|turn| turn.is_terminal)
                .unwrap_or(false)
        })
    }

    #[napi(js_name = "setModel", ts_return_type = "ClientCommandResult")]
    pub fn set_model(&self, conversation_id: String, model: String) -> Result<serde_json::Value> {
        self.with_client_json(
            "AngelClient.setModel",
            format!("conversation_id={conversation_id} model={model}"),
            move |client| {
                client.send_thread_event(conversation_id, EngineThreadEvent::set_model(model))
            },
        )
    }

    #[napi(js_name = "setMode", ts_return_type = "ClientCommandResult")]
    pub fn set_mode(&self, conversation_id: String, mode: String) -> Result<serde_json::Value> {
        self.with_client_json(
            "AngelClient.setMode",
            format!("conversation_id={conversation_id} mode={mode}"),
            move |client| {
                client.send_thread_event(conversation_id, EngineThreadEvent::set_mode(mode))
            },
        )
    }

    #[napi(js_name = "setPermissionMode", ts_return_type = "ClientCommandResult")]
    pub fn set_permission_mode(
        &self,
        conversation_id: String,
        mode: String,
    ) -> Result<serde_json::Value> {
        self.with_client_json(
            "AngelClient.setPermissionMode",
            format!("conversation_id={conversation_id} mode={mode}"),
            move |client| {
                client.send_thread_event(
                    conversation_id,
                    EngineThreadEvent::set_permission_mode(mode),
                )
            },
        )
    }

    #[napi(js_name = "setReasoningEffort", ts_return_type = "ClientCommandResult")]
    pub fn set_reasoning_effort(
        &self,
        conversation_id: String,
        effort: String,
    ) -> Result<serde_json::Value> {
        self.with_client_json(
            "AngelClient.setReasoningEffort",
            format!("conversation_id={conversation_id} effort={effort}"),
            move |client| {
                client.send_thread_event(
                    conversation_id,
                    EngineThreadEvent::set_reasoning_effort(effort),
                )
            },
        )
    }

    #[napi(js_name = "setReasoningLevel", ts_return_type = "ClientCommandResult")]
    pub fn set_reasoning_level(
        &self,
        conversation_id: String,
        level: String,
    ) -> Result<serde_json::Value> {
        self.with_client_json(
            "AngelClient.setReasoningLevel",
            format!("conversation_id={conversation_id} level={level}"),
            move |client| client.set_reasoning_level(conversation_id, level),
        )
    }

    #[napi(js_name = "runShellCommand", ts_return_type = "ClientCommandResult")]
    pub fn run_shell_command(
        &self,
        conversation_id: String,
        command: String,
    ) -> Result<serde_json::Value> {
        self.with_client_json(
            "AngelClient.runShellCommand",
            format!(
                "conversation_id={} command_len={}",
                conversation_id,
                command.chars().count()
            ),
            move |client| {
                client.send_thread_event(conversation_id, EngineThreadEvent::shell(command))
            },
        )
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
        self.with_client_json(
            "AngelClient.resolveElicitation",
            format!("conversation_id={conversation_id} elicitation_id={elicitation_id}"),
            move |client| {
                client.send_thread_event(
                    conversation_id,
                    EngineThreadEvent::resolve(elicitation_id, response),
                )
            },
        )
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
        self.with_client_json(
            "AngelClient.resolveFirstElicitation",
            format!("conversation_id={conversation_id}"),
            move |client| {
                client
                    .send_thread_event(conversation_id, EngineThreadEvent::resolve_first(response))
            },
        )
    }

    #[napi]
    pub fn close(&self) -> Result<()> {
        self.with_client("AngelClient.close", "no_args", |client| client.close())
    }
}

impl AngelClient {
    fn task<F, T>(
        &self,
        operation: &'static str,
        detail: impl Into<String>,
        action: F,
    ) -> AsyncTask<ClientJsonTask>
    where
        F: FnOnce(&mut ProcessAngelClient) -> angel_engine_client::ClientResult<T> + Send + 'static,
        T: Serialize + Send + 'static,
    {
        ClientJsonTask::new(self.client.clone(), operation, detail.into(), action)
    }

    fn with_client<T, F>(
        &self,
        operation: &'static str,
        detail: impl Into<String>,
        action: F,
    ) -> Result<T>
    where
        F: FnOnce(&mut ProcessAngelClient) -> T,
    {
        trace_napi_sync_result(operation, detail, || {
            let mut client = self.client.lock().map_err(lock_error)?;
            Ok(action(&mut client))
        })
    }

    fn with_client_json<T, F>(
        &self,
        operation: &'static str,
        detail: impl Into<String>,
        action: F,
    ) -> Result<serde_json::Value>
    where
        F: FnOnce(&mut ProcessAngelClient) -> angel_engine_client::ClientResult<T>,
        T: Serialize,
    {
        trace_napi_sync_result(operation, detail, || {
            let mut client = self.client.lock().map_err(lock_error)?;
            to_json(client_result(action(&mut client))?)
        })
    }
}

type SharedProcessClient = Arc<Mutex<ProcessAngelClient>>;
type ClientAction =
    Box<dyn FnOnce(&mut ProcessAngelClient) -> Result<serde_json::Value> + Send + 'static>;

pub struct ClientJsonTask {
    client: SharedProcessClient,
    operation: &'static str,
    detail: String,
    action: Option<ClientAction>,
}

impl ClientJsonTask {
    fn new<F, T>(
        client: SharedProcessClient,
        operation: &'static str,
        detail: String,
        action: F,
    ) -> AsyncTask<Self>
    where
        F: FnOnce(&mut ProcessAngelClient) -> angel_engine_client::ClientResult<T> + Send + 'static,
        T: Serialize + Send + 'static,
    {
        napi_trace(format!("{operation} scheduled {detail}"));
        AsyncTask::new(Self {
            client,
            operation,
            detail,
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
        let started = Instant::now();
        napi_trace(format!("{} compute_start {}", self.operation, self.detail));
        let result = (|| {
            let action = self.action.take().ok_or_else(|| {
                Error::from_reason("client task was already consumed".to_string())
            })?;
            let mut client = self.client.lock().map_err(lock_error)?;
            action(&mut client)
        })();
        trace_napi_result(self.operation, started, &result);
        result
    }

    fn resolve(&mut self, env: &'task Env, output: Self::Output) -> Result<Self::JsValue> {
        trace_napi_sync_result(
            self.operation,
            format!("resolve output={}", json_shape(&output)),
            || env.to_js_value(&output),
        )
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
        let options = from_json::<EngineRuntimeOptions>(options)?;
        let detail = runtime_options_trace(&options);
        trace_napi_sync_result("AngelSession.new", detail, || {
            Ok(Self {
                session: Arc::new(Mutex::new(client_result(EngineAngelSession::new(options))?)),
            })
        })
    }

    #[napi(js_name = "hasConversation")]
    pub fn has_conversation(&self) -> Result<bool> {
        trace_napi_sync_result("AngelSession.hasConversation", "no_args", || {
            let session = self.session.lock().map_err(lock_error)?;
            Ok(session.has_conversation())
        })
    }

    #[napi(
        js_name = "hydrate",
        ts_args_type = "request: HydrateRequest",
        ts_return_type = "Promise<ConversationSnapshot>"
    )]
    pub fn hydrate(
        &self,
        request: Option<serde_json::Value>,
    ) -> Result<AsyncTask<SessionJsonTask>> {
        let request = match optional_json::<EngineHydrateRequest>(request)? {
            Some(request) => request,
            None => return Err(to_napi_error("hydrate request is required")),
        };
        Ok(self.task(
            "AngelSession.hydrate",
            format!(
                "cwd={} remote_id={}",
                request.cwd.as_deref().unwrap_or("<none>"),
                request.remote_id.as_deref().unwrap_or("<none>")
            ),
            move |session| session.hydrate(request),
        ))
    }

    #[napi(
        js_name = "inspect",
        ts_args_type = "request: InspectRequest",
        ts_return_type = "Promise<ConversationSnapshot>"
    )]
    pub fn inspect(
        &self,
        request: Option<serde_json::Value>,
    ) -> Result<AsyncTask<SessionJsonTask>> {
        let request = match optional_json::<EngineInspectRequest>(request)? {
            Some(request) => request,
            None => return Err(to_napi_error("inspect request is required")),
        };
        Ok(self.task(
            "AngelSession.inspect",
            format!("cwd={}", request.cwd.as_deref().unwrap_or("<none>")),
            move |session| session.inspect(request),
        ))
    }

    #[napi(
        js_name = "setMode",
        ts_args_type = "request: SetModeRequest",
        ts_return_type = "Promise<ConversationSnapshot>"
    )]
    pub fn set_mode(&self, request: serde_json::Value) -> Result<AsyncTask<SessionJsonTask>> {
        let request = from_json::<EngineSetModeRequest>(request)?;
        Ok(self.task(
            "AngelSession.setMode",
            format!(
                "mode={} cwd={} remote_id={}",
                request.mode,
                request.cwd.as_deref().unwrap_or("<none>"),
                request.remote_id.as_deref().unwrap_or("<none>")
            ),
            move |session| session.set_mode(request),
        ))
    }

    #[napi(
        js_name = "setPermissionMode",
        ts_args_type = "request: SetPermissionModeRequest",
        ts_return_type = "Promise<ConversationSnapshot>"
    )]
    pub fn set_permission_mode(
        &self,
        request: serde_json::Value,
    ) -> Result<AsyncTask<SessionJsonTask>> {
        let request = from_json::<EngineSetPermissionModeRequest>(request)?;
        Ok(self.task(
            "AngelSession.setPermissionMode",
            format!(
                "mode={} cwd={} remote_id={}",
                request.mode,
                request.cwd.as_deref().unwrap_or("<none>"),
                request.remote_id.as_deref().unwrap_or("<none>")
            ),
            move |session| session.set_permission_mode(request),
        ))
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
        Ok(self.task(
            "AngelSession.startTextTurn",
            format!(
                "text_len={} input_len={} cwd={} remote_id={} model={} mode={} permission_mode={} reasoning_effort={}",
                request.text.chars().count(),
                request.input.len(),
                request.cwd.as_deref().unwrap_or("<none>"),
                request.remote_id.as_deref().unwrap_or("<none>"),
                request.model.as_deref().unwrap_or("<none>"),
                request.mode.as_deref().unwrap_or("<none>"),
                request.permission_mode.as_deref().unwrap_or("<none>"),
                request.reasoning_effort.as_deref().unwrap_or("<none>")
            ),
            move |session| session.start_text_turn(request),
        ))
    }

    #[napi(
        js_name = "nextTurnEvent",
        ts_args_type = "timeoutMs?: number | null",
        ts_return_type = "Promise<TurnRunEvent | null>"
    )]
    pub fn next_turn_event(&self, timeout_ms: Option<u32>) -> AsyncTask<SessionJsonTask> {
        self.task(
            "AngelSession.nextTurnEvent",
            format!("timeout_ms={}", option_u32(timeout_ms)),
            move |session| {
                session.next_turn_event(Duration::from_millis(timeout_ms.unwrap_or(50) as u64))
            },
        )
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
        Ok(self.task(
            "AngelSession.resolveElicitation",
            format!("elicitation_id={elicitation_id}"),
            move |session| session.resolve_elicitation(elicitation_id, response),
        ))
    }

    #[napi(js_name = "cancelTurn", ts_return_type = "Promise<TurnRunEvent[]>")]
    pub fn cancel_turn(&self) -> AsyncTask<SessionJsonTask> {
        self.task("AngelSession.cancelTurn", "no_args", |session| {
            session.cancel_turn()
        })
    }

    #[napi]
    pub fn close(&self) -> Result<()> {
        trace_napi_sync_result("AngelSession.close", "no_args", || {
            let mut session = self.session.lock().map_err(lock_error)?;
            session.close();
            Ok(())
        })
    }
}

impl AngelSession {
    fn task<F, T>(
        &self,
        operation: &'static str,
        detail: impl Into<String>,
        action: F,
    ) -> AsyncTask<SessionJsonTask>
    where
        F: FnOnce(&mut EngineAngelSession) -> angel_engine_client::ClientResult<T> + Send + 'static,
        T: Serialize + Send + 'static,
    {
        SessionJsonTask::new(self.session.clone(), operation, detail.into(), action)
    }
}

type SharedSession = Arc<Mutex<EngineAngelSession>>;
type SessionAction =
    Box<dyn FnOnce(&mut EngineAngelSession) -> Result<serde_json::Value> + Send + 'static>;

pub struct SessionJsonTask {
    session: SharedSession,
    operation: &'static str,
    detail: String,
    action: Option<SessionAction>,
}

impl SessionJsonTask {
    fn new<F, T>(
        session: SharedSession,
        operation: &'static str,
        detail: String,
        action: F,
    ) -> AsyncTask<Self>
    where
        F: FnOnce(&mut EngineAngelSession) -> angel_engine_client::ClientResult<T> + Send + 'static,
        T: Serialize + Send + 'static,
    {
        napi_trace(format!("{operation} scheduled {detail}"));
        AsyncTask::new(Self {
            session,
            operation,
            detail,
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
        let started = Instant::now();
        napi_trace(format!("{} compute_start {}", self.operation, self.detail));
        let result = (|| {
            let action = self.action.take().ok_or_else(|| {
                Error::from_reason("session task was already consumed".to_string())
            })?;
            let mut session = self.session.lock().map_err(lock_error)?;
            action(&mut session)
        })();
        trace_napi_result(self.operation, started, &result);
        result
    }

    fn resolve(&mut self, env: &'task Env, output: Self::Output) -> Result<Self::JsValue> {
        trace_napi_sync_result(
            self.operation,
            format!("resolve output={}", json_shape(&output)),
            || env.to_js_value(&output),
        )
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
        let detail = format!(
            "{} adapter_present={}",
            client_options_trace(&options),
            adapter.is_some()
        );
        trace_napi_sync_result("AngelEngineClient.new", detail, || {
            let adapter = NapiRuntimeAdapter::new(&options, adapter)?;
            Ok(Self {
                client: EngineClient::new_with_adapter(options, adapter),
            })
        })
    }

    #[napi(ts_return_type = "ClientCommandResult")]
    pub fn initialize(&mut self) -> Result<serde_json::Value> {
        trace_napi_sync_result("AngelEngineClient.initialize", "no_args", || {
            to_json(client_result(self.client.initialize())?)
        })
    }

    #[napi(ts_return_type = "ClientCommandResult")]
    pub fn authenticate(&mut self, method_id: String) -> Result<serde_json::Value> {
        trace_napi_sync_result(
            "AngelEngineClient.authenticate",
            format!("method_id={method_id}"),
            || to_json(client_result(self.client.authenticate(method_id))?),
        )
    }

    #[napi(
        js_name = "discoverThreads",
        ts_args_type = "request: { cwd?: string | null; additionalDirectories?: string[]; cursor?: string | null }",
        ts_return_type = "ClientCommandResult"
    )]
    pub fn discover_threads(
        &mut self,
        request: Option<serde_json::Value>,
    ) -> Result<serde_json::Value> {
        let request = match optional_json::<EngineDiscoveryRequest>(request)? {
            Some(request) => request,
            None => return Err(to_napi_error("discoverThreads request is required")),
        };
        trace_napi_sync_result(
            "AngelEngineClient.discoverThreads",
            format!(
                "cwd={} additional_directories={} cursor={}",
                request.cwd.as_deref().unwrap_or("<none>"),
                request.additional_directories.len(),
                request.cursor.as_deref().unwrap_or("<none>")
            ),
            || to_json(client_result(self.client.discover_threads(request))?),
        )
    }

    #[napi(
        js_name = "startThread",
        ts_args_type = "request: StartConversationRequest",
        ts_return_type = "ClientCommandResult"
    )]
    pub fn start_thread(
        &mut self,
        request: Option<serde_json::Value>,
    ) -> Result<serde_json::Value> {
        let request = match optional_json::<EngineStartConversationRequest>(request)? {
            Some(request) => request,
            None => return Err(to_napi_error("startThread request is required")),
        };
        trace_napi_sync_result(
            "AngelEngineClient.startThread",
            format!(
                "cwd={} additional_directories={}",
                request.cwd.as_deref().unwrap_or("<none>"),
                request.additional_directories.len()
            ),
            || to_json(client_result(self.client.start_thread(request))?),
        )
    }

    #[napi(
        js_name = "resumeThread",
        ts_args_type = "request: ResumeConversationRequest",
        ts_return_type = "ClientCommandResult"
    )]
    pub fn resume_thread(&mut self, request: serde_json::Value) -> Result<serde_json::Value> {
        let request = from_json::<EngineResumeConversationRequest>(request)?;
        trace_napi_sync_result(
            "AngelEngineClient.resumeThread",
            format!(
                "remote_id={} hydrate={} cwd={} additional_directories={}",
                request.remote_id,
                request.hydrate,
                request.cwd.as_deref().unwrap_or("<none>"),
                request.additional_directories.len()
            ),
            || to_json(client_result(self.client.resume_thread(request))?),
        )
    }

    #[napi(js_name = "receiveJsonLine", ts_return_type = "ClientUpdate")]
    pub fn receive_json_line(&mut self, line: String) -> Result<serde_json::Value> {
        trace_napi_sync_result(
            "AngelEngineClient.receiveJsonLine",
            format!("line_len={}", line.len()),
            || to_json(client_result(self.client.receive_json_line(&line))?),
        )
    }

    #[napi(
        js_name = "receiveJson",
        ts_args_type = "value: unknown",
        ts_return_type = "ClientUpdate"
    )]
    pub fn receive_json(&mut self, value: serde_json::Value) -> Result<serde_json::Value> {
        trace_napi_sync_result(
            "AngelEngineClient.receiveJson",
            format!("value={}", json_shape(&value)),
            || to_json(client_result(self.client.receive_json_value(value))?),
        )
    }

    #[napi(ts_return_type = "ClientSnapshot")]
    pub fn snapshot(&self) -> Result<serde_json::Value> {
        trace_napi_sync_result("AngelEngineClient.snapshot", "no_args", || {
            to_json(self.client.snapshot())
        })
    }

    #[napi(js_name = "selectedThreadId")]
    pub fn selected_thread_id(&self) -> Option<String> {
        trace_napi_value("AngelEngineClient.selectedThreadId", "no_args", || {
            self.client.selected_thread_id()
        })
    }

    #[napi(
        js_name = "threadState",
        ts_return_type = "ConversationSnapshot | null"
    )]
    pub fn thread_state(&self, conversation_id: String) -> Result<Option<serde_json::Value>> {
        trace_napi_sync_result(
            "AngelEngineClient.threadState",
            format!("conversation_id={conversation_id}"),
            || optional_to_json(conversation_state(&self.client, &conversation_id)),
        )
    }

    #[napi(js_name = "threadSettings", ts_return_type = "ThreadSettingsSnapshot")]
    pub fn thread_settings(&self, conversation_id: String) -> Result<serde_json::Value> {
        trace_napi_sync_result(
            "AngelEngineClient.threadSettings",
            format!("conversation_id={conversation_id}"),
            || to_json(client_result(self.client.thread_settings(conversation_id))?),
        )
    }

    #[napi(
        js_name = "reasoningLevel",
        ts_return_type = "ReasoningLevelSettingSnapshot"
    )]
    pub fn reasoning_level(&self, conversation_id: String) -> Result<serde_json::Value> {
        trace_napi_sync_result(
            "AngelEngineClient.reasoningLevel",
            format!("conversation_id={conversation_id}"),
            || to_json(client_result(self.client.reasoning_level(conversation_id))?),
        )
    }

    #[napi(js_name = "modelList", ts_return_type = "ModelListSettingSnapshot")]
    pub fn model_list(&self, conversation_id: String) -> Result<serde_json::Value> {
        trace_napi_sync_result(
            "AngelEngineClient.modelList",
            format!("conversation_id={conversation_id}"),
            || to_json(client_result(self.client.model_list(conversation_id))?),
        )
    }

    #[napi(
        js_name = "availableModes",
        ts_return_type = "AvailableModeSettingSnapshot"
    )]
    pub fn available_modes(&self, conversation_id: String) -> Result<serde_json::Value> {
        trace_napi_sync_result(
            "AngelEngineClient.availableModes",
            format!("conversation_id={conversation_id}"),
            || to_json(client_result(self.client.available_modes(conversation_id))?),
        )
    }

    #[napi(
        js_name = "permissionModes",
        ts_return_type = "AvailablePermissionModeSettingSnapshot"
    )]
    pub fn permission_modes(&self, conversation_id: String) -> Result<serde_json::Value> {
        trace_napi_sync_result(
            "AngelEngineClient.permissionModes",
            format!("conversation_id={conversation_id}"),
            || {
                to_json(client_result(
                    self.client.permission_modes(conversation_id),
                )?)
            },
        )
    }

    #[napi(js_name = "turnState", ts_return_type = "TurnSnapshot | null")]
    pub fn turn_state(
        &self,
        conversation_id: String,
        turn_id: String,
    ) -> Result<Option<serde_json::Value>> {
        trace_napi_sync_result(
            "AngelEngineClient.turnState",
            format!("conversation_id={conversation_id} turn_id={turn_id}"),
            || {
                optional_to_json(conversation_state(&self.client, &conversation_id).and_then(
                    |conversation| {
                        conversation
                            .turns
                            .into_iter()
                            .find(|turn| turn.id == turn_id)
                    },
                ))
            },
        )
    }

    #[napi(js_name = "openElicitations", ts_return_type = "ElicitationSnapshot[]")]
    pub fn open_elicitations(&mut self, conversation_id: String) -> Result<serde_json::Value> {
        trace_napi_sync_result(
            "AngelEngineClient.openElicitations",
            format!("conversation_id={conversation_id}"),
            || to_json(self.client.thread(conversation_id).open_elicitations()),
        )
    }

    #[napi(js_name = "threadIsIdle")]
    pub fn thread_is_idle(&self, conversation_id: String) -> bool {
        trace_napi_value(
            "AngelEngineClient.threadIsIdle",
            format!("conversation_id={conversation_id}"),
            || {
                conversation_state(&self.client, &conversation_id)
                    .map(|conversation| conversation.lifecycle == "idle")
                    .unwrap_or(false)
            },
        )
    }

    #[napi(js_name = "turnIsTerminal")]
    pub fn turn_is_terminal(&self, conversation_id: String, turn_id: String) -> bool {
        trace_napi_value(
            "AngelEngineClient.turnIsTerminal",
            format!("conversation_id={conversation_id} turn_id={turn_id}"),
            || {
                conversation_state(&self.client, &conversation_id)
                    .and_then(|conversation| {
                        conversation
                            .turns
                            .into_iter()
                            .find(|turn| turn.id == turn_id)
                    })
                    .map(|turn| turn.is_terminal)
                    .unwrap_or(false)
            },
        )
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
        self.with_thread("AngelEngineClient.sendThreadEvent", conversation_id, event)
    }

    #[napi(js_name = "sendText", ts_return_type = "ClientCommandResult")]
    pub fn send_text(
        &mut self,
        conversation_id: String,
        text: String,
    ) -> Result<serde_json::Value> {
        trace_napi_sync_result(
            "AngelEngineClient.sendText",
            format!(
                "conversation_id={} text_len={}",
                conversation_id,
                text.chars().count()
            ),
            || self.with_thread_raw(conversation_id, EngineThreadEvent::text(text)),
        )
    }

    #[napi(js_name = "setModel", ts_return_type = "ClientCommandResult")]
    pub fn set_model(
        &mut self,
        conversation_id: String,
        model: String,
    ) -> Result<serde_json::Value> {
        trace_napi_sync_result(
            "AngelEngineClient.setModel",
            format!("conversation_id={conversation_id} model={model}"),
            || {
                to_json(client_result(
                    self.client.set_model(conversation_id, model),
                )?)
            },
        )
    }

    #[napi(js_name = "setMode", ts_return_type = "ClientCommandResult")]
    pub fn set_mode(&mut self, conversation_id: String, mode: String) -> Result<serde_json::Value> {
        trace_napi_sync_result(
            "AngelEngineClient.setMode",
            format!("conversation_id={conversation_id} mode={mode}"),
            || to_json(client_result(self.client.set_mode(conversation_id, mode))?),
        )
    }

    #[napi(js_name = "setPermissionMode", ts_return_type = "ClientCommandResult")]
    pub fn set_permission_mode(
        &mut self,
        conversation_id: String,
        mode: String,
    ) -> Result<serde_json::Value> {
        trace_napi_sync_result(
            "AngelEngineClient.setPermissionMode",
            format!("conversation_id={conversation_id} mode={mode}"),
            || {
                to_json(client_result(
                    self.client.set_permission_mode(conversation_id, mode),
                )?)
            },
        )
    }

    #[napi(js_name = "setReasoningEffort", ts_return_type = "ClientCommandResult")]
    pub fn set_reasoning_effort(
        &mut self,
        conversation_id: String,
        effort: String,
    ) -> Result<serde_json::Value> {
        trace_napi_sync_result(
            "AngelEngineClient.setReasoningEffort",
            format!("conversation_id={conversation_id} effort={effort}"),
            || {
                to_json(client_result(
                    self.client.set_reasoning_effort(conversation_id, effort),
                )?)
            },
        )
    }

    #[napi(js_name = "setReasoningLevel", ts_return_type = "ClientCommandResult")]
    pub fn set_reasoning_level(
        &mut self,
        conversation_id: String,
        level: String,
    ) -> Result<serde_json::Value> {
        trace_napi_sync_result(
            "AngelEngineClient.setReasoningLevel",
            format!("conversation_id={conversation_id} level={level}"),
            || {
                to_json(client_result(
                    self.client.set_reasoning_level(conversation_id, level),
                )?)
            },
        )
    }

    #[napi(js_name = "runShellCommand", ts_return_type = "ClientCommandResult")]
    pub fn run_shell_command(
        &mut self,
        conversation_id: String,
        command: String,
    ) -> Result<serde_json::Value> {
        trace_napi_sync_result(
            "AngelEngineClient.runShellCommand",
            format!(
                "conversation_id={} command_len={}",
                conversation_id,
                command.chars().count()
            ),
            || self.with_thread_raw(conversation_id, EngineThreadEvent::shell(command)),
        )
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
        let response = from_json::<EngineElicitationResponse>(response)?;
        trace_napi_sync_result(
            "AngelEngineClient.resolveElicitation",
            format!("conversation_id={conversation_id} elicitation_id={elicitation_id}"),
            || {
                self.with_thread_raw(
                    conversation_id,
                    EngineThreadEvent::resolve(elicitation_id, response),
                )
            },
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
        let response = from_json::<EngineElicitationResponse>(response)?;
        trace_napi_sync_result(
            "AngelEngineClient.resolveFirstElicitation",
            format!("conversation_id={conversation_id}"),
            || self.with_thread_raw(conversation_id, EngineThreadEvent::resolve_first(response)),
        )
    }
}

impl AngelEngineClient {
    fn with_thread(
        &mut self,
        operation: &'static str,
        conversation_id: String,
        event: EngineThreadEvent,
    ) -> Result<serde_json::Value> {
        trace_napi_sync_result(
            operation,
            format!(
                "conversation_id={} event_kind={}",
                conversation_id,
                thread_event_kind(&event)
            ),
            || self.with_thread_raw(conversation_id, event),
        )
    }

    fn with_thread_raw(
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
    trace_napi_sync_result(
        "normalizeClientOptions",
        format!("input={}", json_shape(&options)),
        || {
            let options = from_json::<EngineClientOptions>(options)?;
            options
                .validate()
                .map_err(|e| Error::from_reason(format!("Validation failed: {e}")))?;
            to_json(options)
        },
    )
}

#[napi(js_name = "textThreadEvent", ts_return_type = "ThreadEvent")]
pub fn text_thread_event(text: String) -> Result<serde_json::Value> {
    trace_napi_sync_result(
        "textThreadEvent",
        format!("text_len={}", text.chars().count()),
        || to_json(EngineThreadEvent::text(text)),
    )
}

#[napi(
    js_name = "answersResponse",
    ts_args_type = "answers: ElicitationAnswer[]",
    ts_return_type = "ElicitationResponse"
)]
pub fn answers_response(answers: serde_json::Value) -> Result<serde_json::Value> {
    trace_napi_sync_result(
        "answersResponse",
        format!("answers={}", json_shape(&answers)),
        || {
            let answers = from_json::<Vec<EngineClientAnswer>>(answers)?;
            to_json(EngineElicitationResponse::answers(answers))
        },
    )
}

#[napi(
    js_name = "createRuntimeOptions",
    ts_args_type = "runtimeName: string | null, overrides: RuntimeOptionsOverrides",
    ts_return_type = "RuntimeOptions"
)]
pub fn create_runtime_options(
    runtime_name: Option<String>,
    overrides: Option<serde_json::Value>,
) -> Result<serde_json::Value> {
    let env_runtime = std::env::var("ANGEL_ENGINE_RUNTIME").ok();
    let runtime_name = runtime_name.as_deref().or(env_runtime.as_deref());
    trace_napi_sync_result(
        "createRuntimeOptions",
        format!(
            "runtime_name={} env_runtime_present={} overrides_present={}",
            runtime_name.unwrap_or("<none>"),
            env_runtime.is_some(),
            overrides.is_some()
        ),
        || {
            let overrides = match optional_json::<EngineRuntimeOptionsOverrides>(overrides)? {
                Some(overrides) => overrides,
                None => return Err(to_napi_error("createRuntimeOptions overrides are required")),
            };
            to_json(engine_create_runtime_options(runtime_name, overrides))
        },
    )
}

#[napi(js_name = "normalizeRuntimeName", ts_return_type = "`${AgentRuntime}`")]
pub fn normalize_runtime_name(runtime: Option<String>) -> String {
    trace_napi_value(
        "normalizeRuntimeName",
        format!("runtime={}", runtime.as_deref().unwrap_or("<none>")),
        || {
            let runtime = match runtime
                .as_deref()
                .map(|s| s.trim().to_ascii_lowercase())
                .as_deref()
            {
                Some("kimi") => EngineAgentRuntime::Kimi,
                Some("opencode") => EngineAgentRuntime::Opencode,
                Some("qoder") => EngineAgentRuntime::Qoder,
                Some("copilot") => EngineAgentRuntime::Copilot,
                Some("gemini") => EngineAgentRuntime::Gemini,
                Some("cursor") => EngineAgentRuntime::Cursor,
                Some("cline") => EngineAgentRuntime::Cline,
                _ => EngineAgentRuntime::Codex,
            };
            runtime.to_string()
        },
    )
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

fn trace_napi_sync_result<T, F>(operation: &str, detail: impl Into<String>, action: F) -> Result<T>
where
    F: FnOnce() -> Result<T>,
{
    let detail = detail.into();
    let started = Instant::now();
    napi_trace(format!("{operation} start {detail}"));
    let result = action();
    trace_napi_result(operation, started, &result);
    result
}

fn trace_napi_value<T, F>(operation: &str, detail: impl Into<String>, action: F) -> T
where
    F: FnOnce() -> T,
{
    let detail = detail.into();
    let started = Instant::now();
    napi_trace(format!("{operation} start {detail}"));
    let value = action();
    napi_trace(format!(
        "{operation} ok elapsed_ms={}",
        started.elapsed().as_millis()
    ));
    value
}

pub(crate) fn trace_napi_result<T>(operation: &str, started: Instant, result: &Result<T>) {
    match result {
        Ok(_) => napi_trace(format!(
            "{operation} ok elapsed_ms={}",
            started.elapsed().as_millis()
        )),
        Err(error) => napi_trace(format!(
            "{operation} error elapsed_ms={} error={}",
            started.elapsed().as_millis(),
            error
        )),
    }
}

pub(crate) fn napi_trace(message: impl AsRef<str>) {
    if napi_trace_enabled() {
        eprintln!("[angel-engine:napi] {}", message.as_ref());
    }
}

fn napi_trace_enabled() -> bool {
    static ENABLED: OnceLock<bool> = OnceLock::new();
    *ENABLED.get_or_init(|| {
        std::env::var("ANGEL_ENGINE_NAPI_TRACE")
            .map(|value| trace_env_enabled(&value))
            .unwrap_or(false)
    })
}

fn trace_env_enabled(value: &str) -> bool {
    let value = value.trim();
    !value.is_empty()
        && !matches!(
            value.to_ascii_lowercase().as_str(),
            "0" | "false" | "off" | "no"
        )
}

fn client_options_trace(options: &EngineClientOptions) -> String {
    format!(
        "command={} args_len={} protocol={:?} need_auth={} auto_authenticate={} cwd={} additional_directories={} experimental_api={} process_label={}",
        options.command,
        options.args.len(),
        options.protocol,
        options.auth.need_auth,
        options.auth.auto_authenticate,
        options.cwd.as_deref().unwrap_or("<none>"),
        options.additional_directories.len(),
        options.experimental_api,
        options.process_label.as_deref().unwrap_or("<none>")
    )
}

fn runtime_options_trace(options: &EngineRuntimeOptions) -> String {
    format!(
        "{} runtime={} default_reasoning_effort={}",
        client_options_trace(&options.client),
        options.runtime.to_string(),
        options
            .default_reasoning_effort
            .as_deref()
            .unwrap_or("<none>")
    )
}

pub(crate) fn json_shape(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::Null => "null".to_string(),
        serde_json::Value::Bool(_) => "bool".to_string(),
        serde_json::Value::Number(_) => "number".to_string(),
        serde_json::Value::String(value) => format!("string(len={})", value.chars().count()),
        serde_json::Value::Array(values) => format!("array(len={})", values.len()),
        serde_json::Value::Object(fields) => format!("object(keys={})", fields.len()),
    }
}

fn option_u32(value: Option<u32>) -> String {
    value
        .map(|value| value.to_string())
        .unwrap_or_else(|| "<none>".to_string())
}

fn thread_event_kind(event: &EngineThreadEvent) -> &'static str {
    match event {
        EngineThreadEvent::UserMessage { .. } => "userMessage",
        EngineThreadEvent::Inputs { .. } => "inputs",
        EngineThreadEvent::Steer { .. } => "steer",
        EngineThreadEvent::Cancel { .. } => "cancel",
        EngineThreadEvent::SetModel { .. } => "setModel",
        EngineThreadEvent::SetMode { .. } => "setMode",
        EngineThreadEvent::SetPermissionMode { .. } => "setPermissionMode",
        EngineThreadEvent::SetReasoningEffort { .. } => "setReasoningEffort",
        EngineThreadEvent::ResolveElicitation { .. } => "resolveElicitation",
        EngineThreadEvent::ResolveFirstElicitation { .. } => "resolveFirstElicitation",
        EngineThreadEvent::Fork { .. } => "fork",
        EngineThreadEvent::Close => "close",
        EngineThreadEvent::Unsubscribe => "unsubscribe",
        EngineThreadEvent::Archive => "archive",
        EngineThreadEvent::Unarchive => "unarchive",
        EngineThreadEvent::CompactHistory => "compactHistory",
        EngineThreadEvent::RollbackHistory { .. } => "rollbackHistory",
        EngineThreadEvent::RunShellCommand { .. } => "runShellCommand",
    }
}

fn lock_error<T>(_: std::sync::PoisonError<T>) -> Error {
    Error::from_reason("angel client lock was poisoned".to_string())
}

fn to_napi_error(error: impl std::fmt::Display) -> Error {
    Error::from_reason(error.to_string())
}
