use super::*;

impl AngelClient {
    pub(super) fn task<F, T>(
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

    pub(super) fn with_client<T, F>(
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

    pub(super) fn with_client_json<T, F>(
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
