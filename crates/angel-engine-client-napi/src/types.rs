#![allow(dead_code)]

use std::collections::HashMap;

use napi_derive::napi;

#[napi(object)]
pub struct ClientOptions {
    pub command: String,
    pub args: Option<Vec<String>>,
    #[napi(ts_type = "'acp' | 'codexAppServer'")]
    pub protocol: Option<String>,
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
pub struct StartConversationRequest {
    pub cwd: Option<String>,
    pub additional_directories: Option<Vec<String>>,
}

#[napi(object)]
pub struct ResumeConversationRequest {
    pub remote_id: String,
    pub hydrate: Option<bool>,
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
    pub kind: String,
    pub message: String,
}

#[napi(object)]
pub struct RuntimeAuthMethod {
    pub id: String,
    pub label: String,
}

#[napi(object)]
pub struct ClientEvent {
    pub r#type: String,
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
    pub outcome: Option<String>,
    pub action: Option<ActionSnapshot>,
    pub elicitation: Option<ElicitationSnapshot>,
}

#[napi(object)]
pub struct ClientStreamDelta {
    #[napi(ts_type = "'assistantDelta' | 'reasoningDelta' | 'planDelta' | 'actionOutputDelta'")]
    pub r#type: String,
    pub conversation_id: Option<String>,
    pub turn_id: Option<String>,
    pub action_id: Option<String>,
    #[napi(ts_type = "ContentChunk | ActionOutputSnapshot")]
    pub content: Option<serde_json::Value>,
}

#[napi(object)]
pub struct ClientSnapshot {
    pub runtime: RuntimeSnapshot,
    pub selected_conversation_id: Option<String>,
    pub conversations: Vec<ConversationSnapshot>,
}

#[napi(object)]
pub struct RuntimeSnapshot {
    pub status: String,
    pub methods: Option<Vec<RuntimeAuthMethod>>,
    pub name: Option<String>,
    pub version: Option<String>,
    pub metadata: Option<HashMap<String, String>>,
    pub code: Option<String>,
    pub message: Option<String>,
    pub recoverable: Option<bool>,
}

#[napi(object)]
pub struct ConversationSnapshot {
    pub id: String,
    pub remote_id: Option<String>,
    pub remote_kind: String,
    pub lifecycle: String,
    pub active_turn_ids: Vec<String>,
    pub focused_turn_id: Option<String>,
    pub context: ContextSnapshot,
    pub turns: Vec<TurnSnapshot>,
    pub actions: Vec<ActionSnapshot>,
    pub elicitations: Vec<ElicitationSnapshot>,
    pub history: HistorySnapshot,
    pub reasoning: ReasoningOptionsSnapshot,
    pub available_commands: Vec<AvailableCommandSnapshot>,
    pub config_options: Vec<SessionConfigOptionSnapshot>,
    pub modes: Option<SessionModeStateSnapshot>,
    pub models: Option<SessionModelStateSnapshot>,
    pub usage: Option<SessionUsageSnapshot>,
}

#[napi(object)]
pub struct ContextSnapshot {
    pub model: Option<String>,
    pub mode: Option<String>,
    pub cwd: Option<String>,
    pub additional_directories: Vec<String>,
    pub approval_policy: Option<String>,
    pub sandbox: Option<String>,
    pub permission_profile: Option<String>,
    pub raw: HashMap<String, String>,
}

#[napi(object)]
pub struct ReasoningOptionsSnapshot {
    pub can_set: bool,
    pub current_effort: Option<String>,
    pub available_efforts: Vec<String>,
    pub config_option_id: Option<String>,
    pub source: String,
}

#[napi(object)]
pub struct AvailableCommandSnapshot {
    pub name: String,
    pub description: Option<String>,
    pub input_hint: Option<String>,
}

#[napi(object)]
pub struct SessionConfigOptionSnapshot {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub current_value: Option<String>,
    pub values: Vec<SessionConfigValueSnapshot>,
}

#[napi(object)]
pub struct SessionConfigValueSnapshot {
    pub value: String,
    pub name: String,
    pub description: Option<String>,
}

#[napi(object)]
pub struct SessionModeStateSnapshot {
    pub current_mode_id: Option<String>,
    pub available_modes: Vec<SessionModeSnapshot>,
}

#[napi(object)]
pub struct SessionModeSnapshot {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

#[napi(object)]
pub struct SessionModelStateSnapshot {
    pub current_model_id: Option<String>,
    pub available_models: Vec<SessionModelSnapshot>,
}

#[napi(object)]
pub struct SessionModelSnapshot {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

#[napi(object)]
pub struct SessionUsageSnapshot {
    pub input_tokens: Option<u32>,
    pub output_tokens: Option<u32>,
    pub cache_creation_input_tokens: Option<u32>,
    pub cache_read_input_tokens: Option<u32>,
    pub total_tokens: Option<u32>,
    pub costs: Vec<SessionUsageCostSnapshot>,
}

#[napi(object)]
pub struct SessionUsageCostSnapshot {
    pub amount: f64,
    pub currency: String,
}

#[napi(object)]
pub struct HistorySnapshot {
    pub hydrated: bool,
    pub turn_count: u32,
    pub replay: Vec<HistoryReplaySnapshot>,
}

#[napi(object)]
pub struct HistoryReplaySnapshot {
    pub role: String,
    pub content: ContentChunk,
}

#[napi(object)]
pub struct TurnSnapshot {
    pub id: String,
    pub remote_id: Option<String>,
    pub phase: String,
    pub outcome: Option<String>,
    pub input_text: Option<String>,
    pub output_text: Option<String>,
    pub reasoning_text: Option<String>,
    pub plan_text: Option<String>,
}

#[napi(object)]
pub struct ContentChunk {
    pub kind: String,
    pub text: String,
}

#[napi(object)]
pub struct PlanEntrySnapshot {
    pub text: String,
    pub status: String,
}

#[napi(object)]
pub struct ActionSnapshot {
    pub id: String,
    pub turn_id: Option<String>,
    pub kind: String,
    pub phase: String,
    pub title: Option<String>,
    pub input_summary: Option<String>,
    pub raw_input: Option<String>,
    pub output: Vec<ActionOutputSnapshot>,
    pub output_text: Option<String>,
    pub error: Option<ErrorSnapshot>,
}

#[napi(object)]
pub struct ActionOutputSnapshot {
    pub kind: String,
    pub text: String,
}

#[napi(object)]
pub struct ErrorSnapshot {
    pub code: String,
    pub message: String,
    pub recoverable: bool,
}

#[napi(object)]
pub struct ElicitationSnapshot {
    pub id: String,
    pub turn_id: Option<String>,
    pub action_id: Option<String>,
    pub kind: String,
    pub phase: String,
    pub title: Option<String>,
    pub body: Option<String>,
    pub choices: Vec<String>,
    pub questions: Vec<QuestionSnapshot>,
}

#[napi(object)]
pub struct QuestionSnapshot {
    pub id: String,
    pub header: Option<String>,
    pub question: Option<String>,
    pub is_secret: bool,
    pub is_other: bool,
    pub options: Vec<QuestionOptionSnapshot>,
    pub schema: Option<QuestionSchemaSnapshot>,
}

#[napi(object)]
pub struct QuestionOptionSnapshot {
    pub label: String,
    pub description: Option<String>,
}

#[napi(object)]
pub struct QuestionSchemaSnapshot {
    #[napi(ts_type = "'string' | 'integer' | 'number' | 'boolean'")]
    pub value_type: String,
    pub constraints: Option<QuestionConstraintsSnapshot>,
}

#[napi(object)]
pub struct QuestionConstraintsSnapshot {
    pub min_length: Option<u32>,
    pub max_length: Option<u32>,
    pub minimum: Option<f64>,
    pub maximum: Option<f64>,
    pub pattern: Option<String>,
}

#[napi(object)]
pub struct ElicitationAnswer {
    pub id: String,
    pub value: String,
}

#[napi(object)]
pub struct ElicitationResponse {
    #[napi(
        ts_type = "'allow' | 'allowForSession' | 'deny' | 'cancel' | 'answers' | 'dynamicToolResult' | 'externalComplete' | 'raw'"
    )]
    pub r#type: String,
    pub answers: Option<Vec<ElicitationAnswer>>,
    pub success: Option<bool>,
    pub value: Option<String>,
}

#[napi(object)]
pub struct ThreadEvent {
    #[napi(
        ts_type = "'userMessage' | 'inputs' | 'steer' | 'cancel' | 'setModel' | 'setMode' | 'setReasoningEffort' | 'resolveElicitation' | 'resolveFirstElicitation' | 'fork' | 'close' | 'unsubscribe' | 'archive' | 'unarchive' | 'compactHistory' | 'rollbackHistory' | 'runShellCommand'"
    )]
    pub r#type: String,
    pub text: Option<String>,
    pub input: Option<Vec<serde_json::Value>>,
    pub turn_id: Option<String>,
    pub model: Option<String>,
    pub mode: Option<String>,
    pub effort: Option<String>,
    pub elicitation_id: Option<String>,
    pub response: Option<ElicitationResponse>,
    pub at_turn_id: Option<String>,
    pub num_turns: Option<u32>,
    pub command: Option<String>,
}

#[napi(object)]
pub struct RuntimeOptionsOverrides {
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub auth: Option<ClientAuthOptions>,
    pub identity: Option<ClientIdentity>,
    pub cwd: Option<String>,
    pub additional_directories: Option<Vec<String>>,
    pub experimental_api: Option<bool>,
    pub process_label: Option<String>,
    pub client_name: Option<String>,
    pub client_title: Option<String>,
    pub default_reasoning_effort: Option<String>,
}

#[napi(object)]
pub struct RuntimeOptions {
    pub command: String,
    pub args: Option<Vec<String>>,
    #[napi(ts_type = "'acp' | 'codexAppServer'")]
    pub protocol: Option<String>,
    pub auth: Option<ClientAuthOptions>,
    pub identity: Option<ClientIdentity>,
    pub cwd: Option<String>,
    pub additional_directories: Option<Vec<String>>,
    pub experimental_api: Option<bool>,
    pub process_label: Option<String>,
    #[napi(ts_type = "'codex' | 'kimi' | 'opencode'")]
    pub runtime: String,
    pub default_reasoning_effort: Option<String>,
}

#[napi(object)]
pub struct SendTextRequest {
    pub text: String,
    pub cwd: Option<String>,
    pub remote_id: Option<String>,
    pub model: Option<String>,
    pub mode: Option<String>,
    pub reasoning_effort: Option<String>,
}

#[napi(object)]
pub struct HydrateRequest {
    pub cwd: Option<String>,
    pub remote_id: Option<String>,
}

#[napi(object)]
pub struct InspectRequest {
    pub cwd: Option<String>,
}

#[napi(object)]
pub struct TurnRunResult {
    pub text: String,
    pub reasoning: Option<String>,
    pub model: Option<String>,
    pub remote_thread_id: Option<String>,
    pub turn_id: Option<String>,
    pub conversation: Option<ConversationSnapshot>,
    pub turn: Option<TurnSnapshot>,
    pub actions: Vec<ActionSnapshot>,
}

#[napi(object)]
pub struct TurnRunEvent {
    #[napi(ts_type = "'delta' | 'action' | 'actionOutputDelta' | 'elicitation' | 'result'")]
    pub r#type: String,
    #[napi(ts_type = "'reasoning' | 'text'")]
    pub part: Option<String>,
    pub text: Option<String>,
    pub turn_id: Option<String>,
    pub action: Option<ActionSnapshot>,
    pub action_id: Option<String>,
    pub content: Option<ActionOutputSnapshot>,
    pub elicitation: Option<ElicitationSnapshot>,
    pub result: Option<TurnRunResult>,
}
