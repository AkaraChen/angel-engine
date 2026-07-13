use super::*;

mod task;

pub use task::ClientJsonTask;

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

    #[napi(js_name = "processId")]
    pub fn process_id(&self) -> Result<u32> {
        self.with_client("AngelClient.processId", "no_args", |client| {
            client.process_id()
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
            move |client| client.open_elicitations(&conversation_id),
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
            client.turn_is_terminal(&conversation_id, &turn_id)
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

    #[napi(js_name = "refreshSkills", ts_return_type = "ClientCommandResult")]
    pub fn refresh_skills(
        &self,
        conversation_id: String,
        force_reload: bool,
    ) -> Result<serde_json::Value> {
        self.with_client_json(
            "AngelClient.refreshSkills",
            format!("conversation_id={conversation_id} force_reload={force_reload}"),
            move |client| {
                client.send_thread_event(
                    conversation_id,
                    EngineThreadEvent::refresh_skills(force_reload),
                )
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

type SharedProcessClient = Arc<Mutex<ProcessAngelClient>>;
