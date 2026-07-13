use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use angel_engine_client::{
    AngelClient as ProcessAngelClient, AngelSession as EngineAngelSession, Client as EngineClient,
    ClientAnswer as EngineClientAnswer, ClientCommandResult as EngineClientCommandResult,
    ClientOptions as EngineClientOptions, DiscoveryRequest as EngineDiscoveryRequest,
    ElicitationResponse as EngineElicitationResponse, HydrateRequest as EngineHydrateRequest,
    InspectRequest as EngineInspectRequest, RefreshSkillsRequest as EngineRefreshSkillsRequest,
    ResumeConversationRequest as EngineResumeConversationRequest,
    RuntimeOptions as EngineRuntimeOptions,
    RuntimeOptionsOverrides as EngineRuntimeOptionsOverrides,
    SendTextRequest as EngineSendTextRequest, SetModeRequest as EngineSetModeRequest,
    SetPermissionModeRequest as EngineSetPermissionModeRequest,
    StartConversationRequest as EngineStartConversationRequest, ThreadEvent as EngineThreadEvent,
    create_runtime_options as engine_create_runtime_options,
    list_listening_ports as engine_list_listening_ports,
    list_subprocesses as engine_list_subprocesses,
};
use garde::Validate;
use napi::ScopedTask;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

mod adapter;
mod engine_client;
mod exports;
mod process_client;
mod session;
mod types;

use adapter::NapiRuntimeAdapter;
pub use engine_client::AngelEngineClient;
pub use exports::*;
pub use process_client::{AngelClient, ClientJsonTask};
pub use session::{AngelSession, SessionJsonTask};

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
    match value {
        Some(value) => value.to_string(),
        None => "<none>".to_string(),
    }
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
        EngineThreadEvent::RefreshSkills { .. } => "refreshSkills",
    }
}

fn lock_error<T>(_: std::sync::PoisonError<T>) -> Error {
    Error::from_reason("angel client lock was poisoned".to_string())
}

fn to_napi_error(error: impl std::fmt::Display) -> Error {
    Error::from_reason(error.to_string())
}
