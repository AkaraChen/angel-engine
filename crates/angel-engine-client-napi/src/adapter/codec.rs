use std::fmt;

use angel_engine::{
    AngelEngine, EngineError, EngineEvent, JsonRpcMessage, JsonRpcRequestId, ProtocolEffect,
    ProtocolFlavor, TransportLog, TransportLogKind, TransportOptions, TransportOutput, method_name,
};
use angel_engine_client::ClientSnapshot as EngineClientSnapshot;
use napi::bindgen_prelude::*;
use serde_json::{Value, json};

use super::EngineResult;

pub(super) fn encode_input(
    engine: &AngelEngine,
    effect: &ProtocolEffect,
    options: &TransportOptions,
) -> EngineResult<Value> {
    Ok(json!({
        "engine": engine_snapshot(engine)?,
        "effect": protocol_effect_json(effect),
        "options": transport_options_json(options),
    }))
}

pub(super) fn decode_input(engine: &AngelEngine, message: &JsonRpcMessage) -> EngineResult<Value> {
    Ok(json!({
        "engine": engine_snapshot(engine)?,
        "message": message.to_value(),
    }))
}

fn engine_snapshot(engine: &AngelEngine) -> EngineResult<Value> {
    serde_json::to_value(EngineClientSnapshot::from(engine))
        .map_err(|error| invalid_command(error.to_string()))
}

fn protocol_effect_json(effect: &ProtocolEffect) -> Value {
    json!({
        "flavor": protocol_flavor_name(effect.flavor),
        "method": method_name(&effect.method),
        "methodKind": effect.method,
        "requestId": effect.request_id.as_ref().map(JsonRpcRequestId::to_json_value),
        "conversationId": effect.conversation_id.as_ref().map(ToString::to_string),
        "turnId": effect.turn_id.as_ref().map(ToString::to_string),
        "payload": {
            "fields": effect.payload.fields,
        },
    })
}

fn transport_options_json(options: &TransportOptions) -> Value {
    json!({
        "clientInfo": {
            "name": options.client_info.name,
            "title": options.client_info.title,
            "version": options.client_info.version,
        },
        "experimentalApi": options.experimental_api,
    })
}

pub(super) fn protocol_flavor_name(flavor: ProtocolFlavor) -> &'static str {
    match flavor {
        ProtocolFlavor::Acp => "acp",
        ProtocolFlavor::CodexAppServer => "codexAppServer",
        ProtocolFlavor::Custom => "custom",
    }
}

pub(super) fn transport_output_to_json(output: TransportOutput) -> serde_json::Result<Value> {
    Ok(json!({
        "messages": output
            .messages
            .iter()
            .map(JsonRpcMessage::to_value)
            .collect::<Vec<_>>(),
        "events": serde_json::to_value(output.events)?,
        "completedRequests": output
            .completed_requests
            .iter()
            .map(JsonRpcRequestId::to_json_value)
            .collect::<Vec<_>>(),
        "logs": output
            .logs
            .iter()
            .map(transport_log_json)
            .collect::<Vec<_>>(),
    }))
}

pub(super) fn transport_output_from_json(value: Value) -> EngineResult<TransportOutput> {
    let TransportOutputJson {
        messages,
        events,
        completed_requests,
        logs,
    } = serde_json::from_value(value)
        .map_err(|error| invalid_command(format!("invalid adapter output: {error}")))?;

    let messages = messages
        .into_iter()
        .map(JsonRpcMessage::from_value)
        .collect::<EngineResult<Vec<_>>>()?;
    let completed_requests = completed_requests
        .into_iter()
        .map(|value| JsonRpcRequestId::from_json_value(&value))
        .collect();
    let logs = logs
        .into_iter()
        .map(transport_log_from_json)
        .collect::<EngineResult<Vec<_>>>()?;
    Ok(TransportOutput {
        messages,
        events,
        completed_requests,
        logs,
    })
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransportOutputJson {
    messages: Vec<Value>,
    events: Vec<EngineEvent>,
    completed_requests: Vec<Value>,
    logs: Vec<Value>,
}

fn transport_log_json(log: &TransportLog) -> Value {
    json!({
        "kind": transport_log_kind_name(log.kind),
        "message": log.message,
    })
}

fn transport_log_from_json(value: Value) -> EngineResult<TransportLog> {
    let kind = value
        .get("kind")
        .and_then(Value::as_str)
        .map(transport_log_kind_from_name)
        .transpose()?
        .ok_or_else(|| invalid_command("adapter transport log is missing kind"))?;
    let message = value
        .get("message")
        .and_then(Value::as_str)
        .ok_or_else(|| invalid_command("adapter transport log is missing message"))?
        .to_string();
    Ok(TransportLog { kind, message })
}

fn transport_log_kind_name(kind: TransportLogKind) -> &'static str {
    match kind {
        TransportLogKind::Send => "send",
        TransportLogKind::Receive => "receive",
        TransportLogKind::State => "state",
        TransportLogKind::Output => "output",
        TransportLogKind::Warning => "warning",
        TransportLogKind::Error => "error",
    }
}

fn transport_log_kind_from_name(name: &str) -> EngineResult<TransportLogKind> {
    match name {
        "send" | "Send" => Ok(TransportLogKind::Send),
        "receive" | "Receive" => Ok(TransportLogKind::Receive),
        "state" | "State" => Ok(TransportLogKind::State),
        "output" | "Output" => Ok(TransportLogKind::Output),
        "warning" | "Warning" => Ok(TransportLogKind::Warning),
        "error" | "Error" => Ok(TransportLogKind::Error),
        other => Err(invalid_command(format!(
            "unknown adapter log kind: {other}"
        ))),
    }
}

pub(super) fn to_json<T>(value: T) -> Result<Value>
where
    T: serde::Serialize,
{
    serde_json::to_value(value).map_err(to_napi_error)
}

pub(super) fn from_json<T>(value: Value) -> Result<T>
where
    T: serde::de::DeserializeOwned,
{
    serde_json::from_value(value).map_err(to_napi_error)
}

fn to_napi_error(error: impl fmt::Display) -> Error {
    Error::from_reason(error.to_string())
}

pub(super) fn invalid_command(message: impl Into<String>) -> EngineError {
    EngineError::InvalidCommand {
        message: message.into(),
    }
}
