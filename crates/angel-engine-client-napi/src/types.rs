#![allow(dead_code)]

use std::collections::HashMap;

use napi_derive::napi;

include!(concat!(env!("OUT_DIR"), "/generated_enums.rs"));

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
    pub messages: Option<Vec<serde_json::Value>>,
    #[napi(ts_type = "unknown[]")]
    pub events: Option<Vec<serde_json::Value>>,
    #[napi(ts_type = "unknown[]")]
    pub completed_requests: Option<Vec<serde_json::Value>>,
    pub logs: Option<Vec<TransportLog>>,
}

#[napi(object)]
pub struct TransportLog {
    #[napi(ts_type = "`${TransportLogKind}`")]
    pub kind: Option<TransportLogKind>,
    pub message: Option<String>,
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

#[napi(object)]
pub struct ClientSnapshot {
    pub runtime: RuntimeSnapshot,
    pub selected_conversation_id: Option<String>,
    pub conversations: Vec<ConversationSnapshot>,
}

#[napi(object)]
pub struct RuntimeSnapshot {
    #[napi(ts_type = "`${RuntimeStatus}`")]
    pub status: RuntimeStatus,
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
    #[napi(ts_type = "`${RemoteKind}`")]
    pub remote_kind: RemoteKind,
    pub lifecycle: String,
    pub active_turn_ids: Vec<String>,
    pub focused_turn_id: Option<String>,
    pub context: ContextSnapshot,
    pub turns: Vec<TurnSnapshot>,
    pub actions: Vec<ActionSnapshot>,
    pub messages: Vec<DisplayMessageSnapshot>,
    pub elicitations: Vec<ElicitationSnapshot>,
    pub history: HistorySnapshot,
    pub agent_state: AgentStateSnapshot,
    pub settings: ThreadSettingsSnapshot,
    pub available_commands: Vec<AvailableCommandSnapshot>,
    pub usage: Option<SessionUsageSnapshot>,
}

#[napi(object)]
pub struct AgentStateSnapshot {
    pub current_mode: Option<String>,
}

#[napi(object)]
pub struct DisplayMessageSnapshot {
    pub id: String,
    pub role: String,
    pub content: Vec<DisplayMessagePartSnapshot>,
}

#[napi(object)]
pub struct DisplayMessagePartSnapshot {
    pub r#type: String,
    pub text: Option<String>,
    pub data: Option<String>,
    pub mime_type: Option<String>,
    pub name: Option<String>,
    pub action: Option<DisplayToolActionSnapshot>,
    pub plan: Option<DisplayPlanSnapshot>,
}

#[napi(object)]
pub struct DisplayPlanSnapshot {
    #[napi(ts_type = "`${PlanDisplayKind}`")]
    pub kind: PlanDisplayKind,
    pub entries: Vec<PlanEntrySnapshot>,
    pub text: String,
    pub path: Option<String>,
}

#[napi(object)]
pub struct DisplayToolActionSnapshot {
    pub id: String,
    pub turn_id: Option<String>,
    pub elicitation_id: Option<String>,
    pub kind: String,
    #[napi(ts_type = "`${ActionPhase}`")]
    pub phase: String,
    pub title: Option<String>,
    pub input_summary: Option<String>,
    pub raw_input: Option<String>,
    pub output: Vec<ActionOutputSnapshot>,
    pub output_text: String,
    pub error: Option<ErrorSnapshot>,
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
pub struct ThreadSettingsSnapshot {
    pub reasoning_level: ReasoningLevelSettingSnapshot,
    pub model_list: ModelListSettingSnapshot,
    pub available_modes: AvailableModeSettingSnapshot,
}

#[napi(object)]
pub struct ReasoningLevelSettingSnapshot {
    pub current_level: Option<String>,
    pub available_levels: Vec<String>,
    pub available_options: Vec<ReasoningLevelOptionSnapshot>,
    pub source: String,
    pub config_option_id: Option<String>,
    pub can_set: bool,
}

#[napi(object)]
pub struct ReasoningLevelOptionSnapshot {
    pub value: String,
    pub label: String,
    pub description: Option<String>,
    pub selected: bool,
}

#[napi(object)]
pub struct ModelListSettingSnapshot {
    pub current_model_id: Option<String>,
    pub available_models: Vec<ModelOptionSnapshot>,
    pub config_option_id: Option<String>,
    pub can_set: bool,
}

#[napi(object)]
pub struct AvailableModeSettingSnapshot {
    pub current_mode_id: Option<String>,
    pub available_modes: Vec<ModeOptionSnapshot>,
    pub config_option_id: Option<String>,
    pub can_set: bool,
}

#[napi(object)]
pub struct ModelOptionSnapshot {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub selected: bool,
}

#[napi(object)]
pub struct ModeOptionSnapshot {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub selected: bool,
}

#[napi(object)]
pub struct AvailableCommandSnapshot {
    pub name: String,
    pub description: String,
    pub input_hint: Option<String>,
}

#[napi(object)]
pub struct SessionUsageSnapshot {
    pub used: u32,
    pub size: u32,
    pub cost: Option<SessionUsageCostSnapshot>,
}

#[napi(object)]
pub struct SessionUsageCostSnapshot {
    pub amount: String,
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
    #[napi(ts_type = "`${RemoteKind}`")]
    pub remote_kind: RemoteKind,
    pub phase: String,
    pub input_text: String,
    pub output_text: String,
    pub reasoning_text: String,
    pub plan_text: String,
    pub plan_path: Option<String>,
    pub outcome: Option<String>,
    pub output: Vec<ContentChunk>,
    pub reasoning: Vec<ContentChunk>,
    pub plan: Vec<PlanEntrySnapshot>,
    pub todo: Vec<PlanEntrySnapshot>,
}

#[napi(object)]
pub struct ContentChunk {
    #[napi(ts_type = "`${ContentChunkKind}`")]
    pub kind: ContentChunkKind,
    pub text: String,
}

#[napi(object)]
pub struct PlanEntrySnapshot {
    pub content: String,
    #[napi(ts_type = "`${PlanEntryStatus}`")]
    pub status: PlanEntryStatus,
}

#[napi(object)]
pub struct ActionSnapshot {
    pub id: String,
    pub turn_id: String,
    pub elicitation_id: Option<String>,
    #[napi(ts_type = "`${ActionKind}`")]
    pub kind: ActionKind,
    #[napi(ts_type = "`${ActionPhase}`")]
    pub phase: ActionPhase,
    pub title: Option<String>,
    pub input_summary: Option<String>,
    pub raw_input: Option<String>,
    pub output: Vec<ActionOutputSnapshot>,
    pub output_text: String,
    pub error: Option<ErrorSnapshot>,
}

#[napi(object)]
pub struct ActionOutputSnapshot {
    #[napi(ts_type = "`${ActionOutputKind}`")]
    pub kind: ActionOutputKind,
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
    #[napi(ts_type = "`${ElicitationKind}`")]
    pub kind: ElicitationKind,
    pub phase: String,
    pub title: Option<String>,
    pub body: Option<String>,
    pub choices: Vec<String>,
    pub questions: Vec<QuestionSnapshot>,
}

#[napi(object)]
pub struct QuestionSnapshot {
    pub id: String,
    pub header: String,
    pub question: String,
    pub is_secret: bool,
    pub is_other: bool,
    pub options: Vec<QuestionOptionSnapshot>,
    pub schema: Option<QuestionSchemaSnapshot>,
}

#[napi(object)]
pub struct QuestionOptionSnapshot {
    pub label: String,
    pub description: String,
}

#[napi(object)]
pub struct QuestionSchemaSnapshot {
    #[napi(ts_type = "QuestionValueType | string")]
    pub value_type: String,
    #[napi(ts_type = "QuestionValueType | string | null")]
    pub item_value_type: Option<String>,
    pub required: bool,
    pub multiple: bool,
    pub format: Option<String>,
    pub default_value: Option<String>,
    pub constraints: QuestionConstraintsSnapshot,
    pub raw_schema: Option<String>,
}

#[napi(object)]
pub struct QuestionConstraintsSnapshot {
    pub pattern: Option<String>,
    pub minimum: Option<String>,
    pub maximum: Option<String>,
    pub min_length: Option<String>,
    pub max_length: Option<String>,
    pub min_items: Option<String>,
    pub max_items: Option<String>,
    pub unique_items: Option<bool>,
}

#[napi(object)]
pub struct ElicitationAnswer {
    pub id: String,
    pub value: String,
}

#[napi(object)]
pub struct ElicitationResponse {
    #[napi(ts_type = "`${ElicitationResponseType}`")]
    pub r#type: ElicitationResponseType,
    pub answers: Option<Vec<ElicitationAnswer>>,
    pub success: Option<bool>,
    pub value: Option<String>,
}

#[napi(object)]
pub struct ThreadEvent {
    #[napi(ts_type = "`${ThreadEventType}`")]
    pub r#type: ThreadEventType,
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
    #[napi(ts_type = "`${ClientProtocol}`")]
    pub protocol: Option<ClientProtocol>,
    pub auth: Option<ClientAuthOptions>,
    pub identity: Option<ClientIdentity>,
    pub cwd: Option<String>,
    pub additional_directories: Option<Vec<String>>,
    pub experimental_api: Option<bool>,
    pub process_label: Option<String>,
    #[napi(ts_type = "`${AgentRuntime}`")]
    pub runtime: AgentRuntime,
    pub default_reasoning_effort: Option<String>,
}

#[napi(object)]
pub struct SendTextRequest {
    pub text: String,
    #[napi(
        ts_type = "Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string; name?: string | null } | { type: 'resource_link'; name: string; uri: string; mimeType?: string | null; title?: string | null; description?: string | null } | { type: 'file_mention'; name: string; path: string; mimeType?: string | null } | { type: 'embedded_text_resource'; uri: string; text: string; mimeType?: string | null } | { type: 'embedded_blob_resource'; uri: string; data: string; mimeType?: string | null; name?: string | null } | { type: 'raw_content_block'; value: unknown }>"
    )]
    pub input: Option<Vec<serde_json::Value>>,
    pub cwd: Option<String>,
    pub remote_id: Option<String>,
    pub model: Option<String>,
    pub mode: Option<String>,
    pub reasoning_effort: Option<String>,
}

#[napi(object)]
pub struct SetModeRequest {
    pub mode: String,
    pub cwd: Option<String>,
    pub remote_id: Option<String>,
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
    pub message: Option<DisplayMessageSnapshot>,
}

#[napi(object)]
pub struct TurnRunEvent {
    #[napi(ts_type = "`${TurnRunEventType}`")]
    pub r#type: TurnRunEventType,
    #[napi(ts_type = "`${TurnRunDeltaPart}`")]
    pub part: Option<TurnRunDeltaPart>,
    pub text: Option<String>,
    pub turn_id: Option<String>,
    pub action: Option<ActionSnapshot>,
    pub action_id: Option<String>,
    pub content: Option<ActionOutputSnapshot>,
    pub plan: Option<DisplayPlanSnapshot>,
    pub message_part: Option<DisplayMessagePartSnapshot>,
    pub elicitation: Option<ElicitationSnapshot>,
    pub result: Option<TurnRunResult>,
}
