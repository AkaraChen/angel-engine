use super::*;

impl AngelSession {
    pub(super) fn task<F, T>(
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
