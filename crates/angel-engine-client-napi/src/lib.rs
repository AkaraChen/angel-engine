use angel_engine_client::{
    Client, ClientAnswer, ClientCommandResult, ClientOptions, ElicitationResponse,
    ResumeConversationRequest, ThreadEvent,
};
use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde::Serialize;
use serde::de::DeserializeOwned;

#[napi]
pub struct AngelEngineClient {
    client: Client,
}

#[napi]
impl AngelEngineClient {
    #[napi(constructor)]
    pub fn new(options: serde_json::Value) -> Result<Self> {
        Ok(Self {
            client: Client::new(from_json(options)?),
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
    client: &Client,
    conversation_id: &str,
) -> Option<angel_engine_client::ConversationSnapshot> {
    client
        .snapshot()
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

fn to_napi_error(error: impl std::fmt::Display) -> Error {
    Error::from_reason(error.to_string())
}
