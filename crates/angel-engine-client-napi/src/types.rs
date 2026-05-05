#![allow(dead_code)]

use std::collections::HashMap;

use napi_derive::napi;

#[napi(string_enum = "lowercase")]
pub enum AgentRuntime {
    Codex,
    Kimi,
    Opencode,
}

#[napi(string_enum = "camelCase")]
pub enum ClientProtocol {
    Acp,
    CodexAppServer,
}

#[napi(string_enum = "camelCase")]
pub enum ClientLogKind {
    Send,
    Receive,
    State,
    Output,
    Warning,
    Error,
    ProcessStdout,
    ProcessStderr,
}

#[napi(string_enum = "camelCase")]
pub enum ClientEventType {
    Log,
    RuntimeAuthRequired,
    RuntimeReady,
    RuntimeFaulted,
    ConversationDiscovered,
    ConversationReady,
    ConversationUpdated,
    AvailableCommandsUpdated,
    SessionUsageUpdated,
    TurnStarted,
    TurnSteered,
    AssistantDelta,
    ReasoningDelta,
    PlanDelta,
    PlanUpdated,
    TurnTerminal,
    ActionObserved,
    ActionUpdated,
    ElicitationOpened,
    ElicitationUpdated,
    ContextUpdated,
    HistoryUpdated,
}

#[napi(string_enum = "camelCase")]
pub enum ClientStreamDeltaType {
    AssistantDelta,
    ReasoningDelta,
    PlanDelta,
    ActionOutputDelta,
}

#[napi(string_enum = "camelCase")]
pub enum RuntimeStatus {
    Offline,
    Connecting,
    Negotiating,
    AwaitingAuth,
    Available,
    Faulted,
}

#[napi(string_enum = "lowercase")]
pub enum RemoteKind {
    Known,
    Pending,
    Local,
}

#[napi(string_enum = "camelCase")]
pub enum ContentChunkKind {
    Text,
    ResourceRef,
    Structured,
}

#[napi(string_enum = "camelCase")]
pub enum PlanEntryStatus {
    Pending,
    InProgress,
    Completed,
}

#[napi(string_enum = "camelCase")]
pub enum ActionKind {
    Command,
    FileChange,
    Read,
    Write,
    McpTool,
    DynamicTool,
    SubAgent,
    WebSearch,
    Media,
    Reasoning,
    Plan,
    HostCapability,
}

#[napi(string_enum = "camelCase")]
pub enum ActionPhase {
    Proposed,
    AwaitingDecision,
    Running,
    StreamingResult,
    Completed,
    Failed,
    Declined,
    Cancelled,
}

#[napi(string_enum = "lowercase")]
pub enum ActionOutputKind {
    Text,
    Patch,
    Terminal,
    Structured,
}

#[napi(string_enum = "camelCase")]
pub enum ElicitationKind {
    Approval,
    UserInput,
    ExternalFlow,
    DynamicToolCall,
    PermissionProfile,
}

#[napi(string_enum = "lowercase")]
pub enum QuestionValueType {
    String,
    Number,
    Integer,
    Boolean,
    Array,
    Object,
}

#[napi(string_enum = "camelCase")]
pub enum ElicitationResponseType {
    Allow,
    AllowForSession,
    Deny,
    Cancel,
    Answers,
    DynamicToolResult,
    ExternalComplete,
    Raw,
}

#[napi(string_enum = "camelCase")]
pub enum ThreadEventType {
    UserMessage,
    Inputs,
    Steer,
    Cancel,
    SetModel,
    SetMode,
    SetReasoningEffort,
    ResolveElicitation,
    ResolveFirstElicitation,
    Fork,
    Close,
    Unsubscribe,
    Archive,
    Unarchive,
    CompactHistory,
    RollbackHistory,
    RunShellCommand,
}

#[napi(string_enum = "camelCase")]
pub enum TurnRunEventType {
    Delta,
    ActionObserved,
    ActionUpdated,
    ActionOutputDelta,
    Elicitation,
    Result,
}

#[napi(string_enum = "lowercase")]
pub enum TurnRunDeltaPart {
    Reasoning,
    Text,
}

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
    pub settings: ThreadSettingsSnapshot,
    pub reasoning: ReasoningOptionsSnapshot,
    pub available_commands: Vec<AvailableCommandSnapshot>,
    pub config_options: Vec<SessionConfigOptionSnapshot>,
    pub modes: Option<SessionModeStateSnapshot>,
    pub models: Option<SessionModelStateSnapshot>,
    pub usage: Option<SessionUsageSnapshot>,
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
    pub action: Option<DisplayToolActionSnapshot>,
}

#[napi(object)]
pub struct DisplayToolActionSnapshot {
    pub id: String,
    pub turn_id: Option<String>,
    pub kind: String,
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
    pub source: String,
    pub config_option_id: Option<String>,
    pub can_set: bool,
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
    pub description: String,
    pub input_hint: Option<String>,
}

#[napi(object)]
pub struct SessionConfigOptionSnapshot {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub current_value: String,
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
    pub current_mode_id: String,
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
    pub current_model_id: String,
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
}

#[napi(object)]
pub struct ContentChunk {
    #[napi(ts_type = "`${ContentChunkKind}`")]
    pub kind: ContentChunkKind,
    pub text: String,
}

#[napi(object)]
pub struct PlanEntrySnapshot {
    pub text: String,
    #[napi(ts_type = "`${PlanEntryStatus}`")]
    pub status: PlanEntryStatus,
}

#[napi(object)]
pub struct ActionSnapshot {
    pub id: String,
    pub turn_id: String,
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
    pub message_part: Option<DisplayMessagePartSnapshot>,
    pub elicitation: Option<ElicitationSnapshot>,
    pub result: Option<TurnRunResult>,
}
