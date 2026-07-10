use napi_derive::napi;

use super::{
    ClientEventType, ClientLogKind, ClientProtocol, ClientStreamDeltaType, TransportLogKind,
    snapshot::{
        ActionSnapshot, ContentChunk, ConversationSnapshot, DisplayPlanSnapshot,
        ElicitationSnapshot, SessionUsageSnapshot,
    },
};

#[napi(object)]
pub struct ClientOptions {
    pub command: String,
    pub args: Option<Vec<String>>,
    #[napi(ts_type = "`${ClientProtocol}`")]
    pub protocol: Option<ClientProtocol>,
    pub auth: Option<ClientAuthOptions>,
    pub identity: Option<ClientIdentity>,
    pub cwd: Option<String>,
    pub additional_directories: Option<Vec<String>>,
    pub experimental_api: Option<bool>,
    pub process_label: Option<String>,
}

#[napi(object)]
pub struct ClientAuthOptions {
    pub need_auth: Option<bool>,
    pub auto_authenticate: Option<bool>,
}

#[napi(object)]
pub struct ClientIdentity {
    pub name: String,
    pub title: Option<String>,
    pub version: Option<String>,
}

#[napi(object)]
pub struct AdapterEncodeInput {
    #[napi(ts_type = "ClientSnapshot")]
    pub engine: Option<serde_json::Value>,
    #[napi(ts_type = "unknown")]
    pub effect: Option<serde_json::Value>,
    #[napi(ts_type = "unknown")]
    pub options: Option<serde_json::Value>,
    #[napi(ts_type = "TransportOutput")]
    pub base_output: Option<serde_json::Value>,
}

#[napi(object)]
pub struct AdapterDecodeInput {
    #[napi(ts_type = "ClientSnapshot")]
    pub engine: Option<serde_json::Value>,
    #[napi(ts_type = "unknown")]
    pub message: Option<serde_json::Value>,
    #[napi(ts_type = "TransportOutput")]
    pub base_output: Option<serde_json::Value>,
}

#[napi(object)]
pub struct TransportOutput {
    #[napi(ts_type = "unknown[]")]
    pub messages: Vec<serde_json::Value>,
    #[napi(ts_type = "unknown[]")]
    pub events: Vec<serde_json::Value>,
    #[napi(ts_type = "unknown[]")]
    pub completed_requests: Vec<serde_json::Value>,
    pub logs: Vec<TransportLog>,
}

#[napi(object)]
pub struct TransportLog {
    #[napi(ts_type = "`${TransportLogKind}`")]
    pub kind: TransportLogKind,
    pub message: String,
}

#[napi(object)]
pub struct StartConversationRequest {
    pub cwd: Option<String>,
    pub additional_directories: Option<Vec<String>>,
}

#[napi(object)]
pub struct ResumeConversationRequest {
    pub remote_id: String,
    pub hydrate: Option<bool>,
    pub cwd: Option<String>,
    pub additional_directories: Option<Vec<String>>,
}

#[napi(object)]
pub struct DiscoveryRequest {
    pub cwd: Option<String>,
    pub additional_directories: Option<Vec<String>>,
    pub cursor: Option<String>,
}

#[napi(object)]
pub struct ClientCommandResult {
    pub conversation_id: Option<String>,
    pub turn_id: Option<String>,
    pub request_id: Option<String>,
    pub message: Option<String>,
    pub update: Option<ClientUpdate>,
}

#[napi(object)]
pub struct ClientUpdate {
    pub outgoing: Option<Vec<JsonRpcOutbound>>,
    pub events: Option<Vec<ClientEvent>>,
    pub stream_deltas: Option<Vec<ClientStreamDelta>>,
    pub logs: Option<Vec<ClientLog>>,
    pub completed_request_ids: Option<Vec<String>>,
}

#[napi(object)]
pub struct JsonRpcOutbound {
    #[napi(ts_type = "unknown")]
    pub value: serde_json::Value,
    pub line: String,
}

#[napi(object)]
pub struct ClientLog {
    #[napi(ts_type = "`${ClientLogKind}`")]
    pub kind: ClientLogKind,
    pub message: String,
}

#[napi(object)]
pub struct RuntimeAuthMethod {
    pub id: String,
    pub label: String,
}

#[napi(object)]
pub struct ClientEvent {
    #[napi(ts_type = "`${ClientEventType}`")]
    pub r#type: ClientEventType,
    pub log: Option<ClientLog>,
    pub methods: Option<Vec<RuntimeAuthMethod>>,
    pub name: Option<String>,
    pub version: Option<String>,
    pub code: Option<String>,
    pub message: Option<String>,
    pub conversation: Option<ConversationSnapshot>,
    pub conversation_id: Option<String>,
    pub count: Option<u32>,
    pub usage: Option<SessionUsageSnapshot>,
    pub turn_id: Option<String>,
    pub content: Option<ContentChunk>,
    pub plan: Option<DisplayPlanSnapshot>,
    pub outcome: Option<String>,
    pub action: Option<ActionSnapshot>,
    pub elicitation: Option<ElicitationSnapshot>,
}

#[napi(object)]
pub struct ClientStreamDelta {
    #[napi(ts_type = "`${ClientStreamDeltaType}`")]
    pub r#type: ClientStreamDeltaType,
    pub conversation_id: Option<String>,
    pub turn_id: Option<String>,
    pub action_id: Option<String>,
    #[napi(ts_type = "ContentChunk | ActionOutputSnapshot")]
    pub content: Option<serde_json::Value>,
}
