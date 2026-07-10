use super::*;

mod task;

pub use task::SessionJsonTask;

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
        js_name = "refreshSkills",
        ts_args_type = "request: RefreshSkillsRequest",
        ts_return_type = "Promise<ConversationSnapshot>"
    )]
    pub fn refresh_skills(&self, request: serde_json::Value) -> Result<AsyncTask<SessionJsonTask>> {
        let request = from_json::<EngineRefreshSkillsRequest>(request)?;
        Ok(self.task(
            "AngelSession.refreshSkills",
            format!(
                "cwd={} remote_id={} force_reload={}",
                request.cwd.as_deref().unwrap_or("<none>"),
                request.remote_id.as_deref().unwrap_or("<none>"),
                request.force_reload
            ),
            move |session| session.refresh_skills(request),
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
        js_name = "nextTurnEvents",
        ts_args_type = "timeoutMs?: number | null",
        ts_return_type = "Promise<TurnRunEvent[]>"
    )]
    pub fn next_turn_events(&self, timeout_ms: Option<u32>) -> AsyncTask<SessionJsonTask> {
        self.task(
            "AngelSession.nextTurnEvents",
            format!("timeout_ms={}", option_u32(timeout_ms)),
            move |session| {
                session.next_turn_events(Duration::from_millis(timeout_ms.unwrap_or(50) as u64))
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

type SharedSession = Arc<Mutex<EngineAngelSession>>;
