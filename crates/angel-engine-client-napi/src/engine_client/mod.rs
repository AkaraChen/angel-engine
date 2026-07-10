use super::*;

mod thread;

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
            || {
                let elicitations = self
                    .client
                    .thread(conversation_id)
                    .open_elicitations()
                    .map_err(to_napi_error)?;
                to_json(elicitations)
            },
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

    #[napi(js_name = "refreshSkills", ts_return_type = "ClientCommandResult")]
    pub fn refresh_skills(
        &mut self,
        conversation_id: String,
        force_reload: bool,
    ) -> Result<serde_json::Value> {
        trace_napi_sync_result(
            "AngelEngineClient.refreshSkills",
            format!("conversation_id={conversation_id} force_reload={force_reload}"),
            || {
                self.with_thread_raw(
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
