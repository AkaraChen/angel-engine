use std::sync::{Arc, Mutex};
use std::time::Duration;

use angel_engine_client::{
    AngelClient as ProcessAngelClient, Client as EngineClient, ClientAnswer, ClientCommandResult,
    ClientOptions, ElicitationResponse, ResumeConversationRequest, StartConversationRequest,
    ThreadEvent,
};
use napi::ScopedTask;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde::Serialize;
use serde::de::DeserializeOwned;

#[napi]
pub struct AngelClient {
    client: SharedProcessClient,
}

#[napi]
impl AngelClient {
    #[napi(constructor)]
    pub fn new(options: serde_json::Value) -> Result<Self> {
        Ok(Self {
            client: Arc::new(Mutex::new(client_result(ProcessAngelClient::spawn(
                from_json(options)?,
            ))?)),
        })
    }

    #[napi]
    pub fn initialize(&self) -> AsyncTask<ClientJsonTask> {
        self.task(|client| client.initialize())
    }

    #[napi(js_name = "initializeAndStart")]
    pub fn initialize_and_start(
        &self,
        request: Option<serde_json::Value>,
    ) -> Result<AsyncTask<ClientJsonTask>> {
        let request = optional_json::<StartConversationRequest>(request)?;
        Ok(self.task(move |client| client.initialize_and_start(request)))
    }

    #[napi(js_name = "startThread")]
    pub fn start_thread(
        &self,
        request: Option<serde_json::Value>,
    ) -> Result<AsyncTask<ClientJsonTask>> {
        let request = optional_json::<StartConversationRequest>(request)?.unwrap_or_default();
        Ok(self.task(move |client| client.start_conversation(request)))
    }

    #[napi(js_name = "resumeThread")]
    pub fn resume_thread(&self, request: serde_json::Value) -> Result<AsyncTask<ClientJsonTask>> {
        let request = from_json::<ResumeConversationRequest>(request)?;
        Ok(self.task(move |client| client.resume_conversation(request)))
    }

    #[napi(js_name = "sendText")]
    pub fn send_text(&self, conversation_id: String, text: String) -> Result<serde_json::Value> {
        self.with_client_json(move |client| client.send_text(conversation_id, text))
    }

    #[napi(js_name = "sendThreadEvent")]
    pub fn send_thread_event(
        &self,
        conversation_id: String,
        event: serde_json::Value,
    ) -> Result<serde_json::Value> {
        let event = from_json(event)?;
        self.with_client_json(move |client| client.send_thread_event(conversation_id, event))
    }

    #[napi(js_name = "nextUpdate")]
    pub fn next_update(&self, timeout_ms: Option<u32>) -> AsyncTask<ClientJsonTask> {
        self.task(move |client| {
            client.next_update(timeout_ms.map(|ms| Duration::from_millis(ms as u64)))
        })
    }

    #[napi]
    pub fn drain(&self, timeout_ms: u32) -> AsyncTask<ClientJsonTask> {
        self.task(move |client| client.drain(Duration::from_millis(timeout_ms as u64)))
    }

    #[napi]
    pub fn snapshot(&self) -> Result<serde_json::Value> {
        self.with_client_json(|client| Ok(client.snapshot()))
    }

    #[napi(js_name = "threadState")]
    pub fn thread_state(&self, conversation_id: String) -> Result<Option<serde_json::Value>> {
        let state = self.with_client(|client| {
            conversation_state_from_snapshot(client.snapshot(), &conversation_id)
        })?;
        optional_to_json(state)
    }

    #[napi(js_name = "turnState")]
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

    #[napi(js_name = "openElicitations")]
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

    #[napi(js_name = "setModel")]
    pub fn set_model(&self, conversation_id: String, model: String) -> Result<serde_json::Value> {
        self.with_client_json(move |client| {
            client.send_thread_event(conversation_id, ThreadEvent::set_model(model))
        })
    }

    #[napi(js_name = "setMode")]
    pub fn set_mode(&self, conversation_id: String, mode: String) -> Result<serde_json::Value> {
        self.with_client_json(move |client| {
            client.send_thread_event(conversation_id, ThreadEvent::set_mode(mode))
        })
    }

    #[napi(js_name = "setReasoningEffort")]
    pub fn set_reasoning_effort(
        &self,
        conversation_id: String,
        effort: String,
    ) -> Result<serde_json::Value> {
        self.with_client_json(move |client| {
            client.send_thread_event(conversation_id, ThreadEvent::set_reasoning_effort(effort))
        })
    }

    #[napi(js_name = "runShellCommand")]
    pub fn run_shell_command(
        &self,
        conversation_id: String,
        command: String,
    ) -> Result<serde_json::Value> {
        self.with_client_json(move |client| {
            client.send_thread_event(conversation_id, ThreadEvent::shell(command))
        })
    }

    #[napi(js_name = "resolveElicitation")]
    pub fn resolve_elicitation(
        &self,
        conversation_id: String,
        elicitation_id: String,
        response: serde_json::Value,
    ) -> Result<serde_json::Value> {
        let response = from_json::<ElicitationResponse>(response)?;
        self.with_client_json(move |client| {
            client.send_thread_event(
                conversation_id,
                ThreadEvent::resolve(elicitation_id, response),
            )
        })
    }

    #[napi(js_name = "resolveFirstElicitation")]
    pub fn resolve_first_elicitation(
        &self,
        conversation_id: String,
        response: serde_json::Value,
    ) -> Result<serde_json::Value> {
        let response = from_json::<ElicitationResponse>(response)?;
        self.with_client_json(move |client| {
            client.send_thread_event(conversation_id, ThreadEvent::resolve_first(response))
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
pub struct AngelEngineClient {
    client: EngineClient,
}

#[napi]
impl AngelEngineClient {
    #[napi(constructor)]
    pub fn new(options: serde_json::Value) -> Result<Self> {
        Ok(Self {
            client: EngineClient::new(from_json(options)?),
        })
    }

    #[napi]
    pub fn initialize(&mut self) -> Result<serde_json::Value> {
        to_json(client_result(self.client.initialize())?)
    }

    #[napi]
    pub fn authenticate(&mut self, method_id: String) -> Result<serde_json::Value> {
        to_json(client_result(self.client.authenticate(method_id))?)
    }

    #[napi(js_name = "discoverThreads")]
    pub fn discover_threads(
        &mut self,
        request: Option<serde_json::Value>,
    ) -> Result<serde_json::Value> {
        let request = optional_json(request)?.unwrap_or_default();
        to_json(client_result(self.client.discover_threads(request))?)
    }

    #[napi(js_name = "startThread")]
    pub fn start_thread(
        &mut self,
        request: Option<serde_json::Value>,
    ) -> Result<serde_json::Value> {
        let request = optional_json(request)?.unwrap_or_default();
        to_json(client_result(self.client.start_thread(request))?)
    }

    #[napi(js_name = "resumeThread")]
    pub fn resume_thread(&mut self, request: serde_json::Value) -> Result<serde_json::Value> {
        let request = from_json::<ResumeConversationRequest>(request)?;
        to_json(client_result(self.client.resume_thread(request))?)
    }

    #[napi(js_name = "receiveJsonLine")]
    pub fn receive_json_line(&mut self, line: String) -> Result<serde_json::Value> {
        to_json(client_result(self.client.receive_json_line(&line))?)
    }

    #[napi(js_name = "receiveJson")]
    pub fn receive_json(&mut self, value: serde_json::Value) -> Result<serde_json::Value> {
        to_json(client_result(self.client.receive_json_value(value))?)
    }

    #[napi]
    pub fn snapshot(&self) -> Result<serde_json::Value> {
        to_json(self.client.snapshot())
    }

    #[napi(js_name = "selectedThreadId")]
    pub fn selected_thread_id(&self) -> Option<String> {
        self.client.selected_thread_id()
    }

    #[napi(js_name = "threadState")]
    pub fn thread_state(&self, conversation_id: String) -> Result<Option<serde_json::Value>> {
        optional_to_json(conversation_state(&self.client, &conversation_id))
    }

    #[napi(js_name = "turnState")]
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

    #[napi(js_name = "openElicitations")]
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

    #[napi(js_name = "sendThreadEvent")]
    pub fn send_thread_event(
        &mut self,
        conversation_id: String,
        event: serde_json::Value,
    ) -> Result<serde_json::Value> {
        let event = from_json(event)?;
        self.with_thread(conversation_id, event)
    }

    #[napi(js_name = "sendText")]
    pub fn send_text(
        &mut self,
        conversation_id: String,
        text: String,
    ) -> Result<serde_json::Value> {
        self.with_thread(conversation_id, ThreadEvent::text(text))
    }

    #[napi(js_name = "setModel")]
    pub fn set_model(
        &mut self,
        conversation_id: String,
        model: String,
    ) -> Result<serde_json::Value> {
        self.with_thread(conversation_id, ThreadEvent::set_model(model))
    }

    #[napi(js_name = "setMode")]
    pub fn set_mode(&mut self, conversation_id: String, mode: String) -> Result<serde_json::Value> {
        self.with_thread(conversation_id, ThreadEvent::set_mode(mode))
    }

    #[napi(js_name = "setReasoningEffort")]
    pub fn set_reasoning_effort(
        &mut self,
        conversation_id: String,
        effort: String,
    ) -> Result<serde_json::Value> {
        self.with_thread(conversation_id, ThreadEvent::set_reasoning_effort(effort))
    }

    #[napi(js_name = "runShellCommand")]
    pub fn run_shell_command(
        &mut self,
        conversation_id: String,
        command: String,
    ) -> Result<serde_json::Value> {
        self.with_thread(conversation_id, ThreadEvent::shell(command))
    }

    #[napi(js_name = "resolveElicitation")]
    pub fn resolve_elicitation(
        &mut self,
        conversation_id: String,
        elicitation_id: String,
        response: serde_json::Value,
    ) -> Result<serde_json::Value> {
        self.with_thread(
            conversation_id,
            ThreadEvent::resolve(elicitation_id, from_json::<ElicitationResponse>(response)?),
        )
    }

    #[napi(js_name = "resolveFirstElicitation")]
    pub fn resolve_first_elicitation(
        &mut self,
        conversation_id: String,
        response: serde_json::Value,
    ) -> Result<serde_json::Value> {
        self.with_thread(
            conversation_id,
            ThreadEvent::resolve_first(from_json::<ElicitationResponse>(response)?),
        )
    }
}

impl AngelEngineClient {
    fn with_thread(
        &mut self,
        conversation_id: String,
        event: ThreadEvent,
    ) -> Result<serde_json::Value> {
        let result: ClientCommandResult = {
            let mut thread = self.client.thread(conversation_id);
            client_result(thread.send_event(event))?
        };
        to_json(result)
    }
}

#[napi(js_name = "normalizeClientOptions")]
pub fn normalize_client_options(options: serde_json::Value) -> Result<serde_json::Value> {
    to_json(from_json::<ClientOptions>(options)?)
}

#[napi(js_name = "textThreadEvent")]
pub fn text_thread_event(text: String) -> Result<serde_json::Value> {
    to_json(ThreadEvent::text(text))
}

#[napi(js_name = "answersResponse")]
pub fn answers_response(answers: serde_json::Value) -> Result<serde_json::Value> {
    let answers = from_json::<Vec<ClientAnswer>>(answers)?;
    to_json(ElicitationResponse::answers(answers))
}

fn conversation_state(
    client: &EngineClient,
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

fn lock_error<T>(_: std::sync::PoisonError<T>) -> Error {
    Error::from_reason("angel client lock was poisoned".to_string())
}

fn to_napi_error(error: impl std::fmt::Display) -> Error {
    Error::from_reason(error.to_string())
}
