use serde_json::{Value, json};

use crate::error::EngineError;
use crate::event::EngineEvent;
use crate::ids::JsonRpcRequestId;
use crate::protocol::ProtocolMethod;
use crate::reducer::AngelEngine;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TransportClientInfo {
    pub name: String,
    pub title: Option<String>,
    pub version: String,
}

impl TransportClientInfo {
    pub fn new(name: impl Into<String>, version: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            title: None,
            version: version.into(),
        }
    }

    pub fn title(mut self, title: impl Into<String>) -> Self {
        self.title = Some(title.into());
        self
    }
}

impl Default for TransportClientInfo {
    fn default() -> Self {
        Self::new("angel-engine", env!("CARGO_PKG_VERSION"))
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TransportOptions {
    pub client_info: TransportClientInfo,
    pub experimental_api: bool,
}

impl Default for TransportOptions {
    fn default() -> Self {
        Self {
            client_info: TransportClientInfo::default(),
            experimental_api: true,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum JsonRpcMessage {
    Request {
        id: JsonRpcRequestId,
        method: String,
        params: Value,
    },
    Notification {
        method: String,
        params: Value,
    },
    Response {
        id: JsonRpcRequestId,
        result: Value,
    },
    Error {
        id: Option<JsonRpcRequestId>,
        code: i64,
        message: String,
        data: Option<Value>,
    },
}

impl JsonRpcMessage {
    pub fn request(id: JsonRpcRequestId, method: impl Into<String>, params: Value) -> Self {
        Self::Request {
            id,
            method: method.into(),
            params,
        }
    }

    pub fn notification(method: impl Into<String>, params: Value) -> Self {
        Self::Notification {
            method: method.into(),
            params,
        }
    }

    pub fn response(id: JsonRpcRequestId, result: Value) -> Self {
        Self::Response { id, result }
    }

    pub fn error(
        id: Option<JsonRpcRequestId>,
        code: i64,
        message: impl Into<String>,
        data: Option<Value>,
    ) -> Self {
        Self::Error {
            id,
            code,
            message: message.into(),
            data,
        }
    }

    pub fn from_value(value: Value) -> Result<Self, EngineError> {
        let object = value
            .as_object()
            .ok_or_else(|| EngineError::InvalidCommand {
                message: "JSON-RPC frame must be an object".to_string(),
            })?;

        if let Some(method) = object.get("method").and_then(Value::as_str) {
            let params = object.get("params").cloned().unwrap_or(Value::Null);
            if let Some(id) = object.get("id") {
                return Ok(Self::Request {
                    id: request_id_from_value(id),
                    method: method.to_string(),
                    params,
                });
            }
            return Ok(Self::Notification {
                method: method.to_string(),
                params,
            });
        }

        if let Some(error) = object.get("error") {
            let error_object = error.as_object();
            let code = error_object
                .and_then(|object| object.get("code"))
                .and_then(Value::as_i64)
                .unwrap_or(-32000);
            let message = error_object
                .and_then(|object| object.get("message"))
                .and_then(Value::as_str)
                .unwrap_or("JSON-RPC error")
                .to_string();
            let data = error_object.and_then(|object| object.get("data")).cloned();
            return Ok(Self::Error {
                id: object.get("id").map(request_id_from_value),
                code,
                message,
                data,
            });
        }

        if let Some(id) = object.get("id") {
            return Ok(Self::Response {
                id: request_id_from_value(id),
                result: object.get("result").cloned().unwrap_or(Value::Null),
            });
        }

        Err(EngineError::InvalidCommand {
            message: "JSON-RPC frame was not a request, notification, or response".to_string(),
        })
    }

    pub fn to_value(&self) -> Value {
        match self {
            Self::Request { id, method, params } => json!({
                "jsonrpc": "2.0",
                "id": id.to_json_value(),
                "method": method,
                "params": params,
            }),
            Self::Notification { method, params } => {
                if params.is_null() {
                    json!({
                        "jsonrpc": "2.0",
                        "method": method,
                    })
                } else {
                    json!({
                        "jsonrpc": "2.0",
                        "method": method,
                        "params": params,
                    })
                }
            }
            Self::Response { id, result } => json!({
                "jsonrpc": "2.0",
                "id": id.to_json_value(),
                "result": result,
            }),
            Self::Error {
                id,
                code,
                message,
                data,
            } => {
                let mut error = json!({
                    "code": code,
                    "message": message,
                });
                if let Some(data) = data {
                    if let Some(object) = error.as_object_mut() {
                        object.insert("data".to_string(), data.clone());
                    }
                }
                json!({
                    "jsonrpc": "2.0",
                    "id": id.as_ref().map(JsonRpcRequestId::to_json_value),
                    "error": error,
                })
            }
        }
    }

    pub fn to_json_line(&self) -> Result<String, EngineError> {
        serde_json::to_string(&self.to_value()).map_err(|error| EngineError::InvalidCommand {
            message: format!("failed to serialize JSON-RPC message: {error}"),
        })
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TransportLogKind {
    Send,
    Receive,
    State,
    Output,
    Warning,
    Error,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TransportLog {
    pub kind: TransportLogKind,
    pub message: String,
}

impl TransportLog {
    pub fn new(kind: TransportLogKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct TransportOutput {
    pub messages: Vec<JsonRpcMessage>,
    pub events: Vec<EngineEvent>,
    pub completed_requests: Vec<JsonRpcRequestId>,
    pub logs: Vec<TransportLog>,
}

impl TransportOutput {
    pub fn message(mut self, message: JsonRpcMessage) -> Self {
        self.messages.push(message);
        self
    }

    pub fn event(mut self, event: EngineEvent) -> Self {
        self.events.push(event);
        self
    }

    pub fn completed(mut self, request_id: JsonRpcRequestId) -> Self {
        self.completed_requests.push(request_id);
        self
    }

    pub fn log(mut self, kind: TransportLogKind, message: impl Into<String>) -> Self {
        self.logs.push(TransportLog::new(kind, message));
        self
    }

    pub fn extend(&mut self, mut other: TransportOutput) {
        self.messages.append(&mut other.messages);
        self.events.append(&mut other.events);
        self.completed_requests
            .append(&mut other.completed_requests);
        self.logs.append(&mut other.logs);
    }
}

pub fn apply_transport_output(
    engine: &mut AngelEngine,
    output: &TransportOutput,
) -> Result<(), EngineError> {
    for event in &output.events {
        engine.apply_event(event.clone())?;
    }
    for request_id in &output.completed_requests {
        engine.pending.remove(request_id);
    }
    Ok(())
}

pub fn client_info_json(client_info: &TransportClientInfo) -> Value {
    json!({
        "name": client_info.name,
        "title": client_info.title,
        "version": client_info.version,
    })
}

pub fn method_name(method: &ProtocolMethod) -> String {
    match method {
        ProtocolMethod::Initialize => "initialize".to_string(),
        ProtocolMethod::Authenticate => "authenticate".to_string(),
        ProtocolMethod::ListConversations => "list_conversations".to_string(),
        ProtocolMethod::ReadConversation => "read_conversation".to_string(),
        ProtocolMethod::StartConversation => "start_conversation".to_string(),
        ProtocolMethod::ResumeConversation => "resume_conversation".to_string(),
        ProtocolMethod::ForkConversation => "fork_conversation".to_string(),
        ProtocolMethod::StartTurn => "start_turn".to_string(),
        ProtocolMethod::SteerTurn => "steer_turn".to_string(),
        ProtocolMethod::CancelTurn => "cancel_turn".to_string(),
        ProtocolMethod::ResolveElicitation => "resolve_elicitation".to_string(),
        ProtocolMethod::UpdateContext => "update_context".to_string(),
        ProtocolMethod::ArchiveConversation => "archive_conversation".to_string(),
        ProtocolMethod::UnarchiveConversation => "unarchive_conversation".to_string(),
        ProtocolMethod::CompactHistory => "history.compact".to_string(),
        ProtocolMethod::RollbackHistory => "history.rollback".to_string(),
        ProtocolMethod::InjectHistoryItems => "history.inject_items".to_string(),
        ProtocolMethod::CloseConversation => "close_conversation".to_string(),
        ProtocolMethod::Unsubscribe => "unsubscribe".to_string(),
        ProtocolMethod::SetSessionModel => "set_session_model".to_string(),
        ProtocolMethod::SetSessionMode => "set_session_mode".to_string(),
        ProtocolMethod::SetSessionConfigOption => "set_session_config_option".to_string(),
        ProtocolMethod::RunShellCommand => "run_shell_command".to_string(),
        ProtocolMethod::Extension(method) => method.clone(),
    }
}

fn request_id_from_value(value: &Value) -> JsonRpcRequestId {
    JsonRpcRequestId::from_json_value(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_rpc_numeric_request_id_round_trips_as_number() {
        let message = JsonRpcMessage::from_value(json!({
            "jsonrpc": "2.0",
            "id": 60,
            "method": "item/tool/requestUserInput",
            "params": {}
        }))
        .expect("request");
        let JsonRpcMessage::Request { id, .. } = message else {
            panic!("expected request");
        };

        assert_eq!(id.to_json_value(), json!(60));
        assert_eq!(
            JsonRpcMessage::response(id, json!({"answers": {}})).to_value(),
            json!({
                "jsonrpc": "2.0",
                "id": 60,
                "result": {"answers": {}}
            })
        );
    }
}
