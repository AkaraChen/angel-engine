use std::collections::HashMap;

use napi_derive::napi;

use super::{
    ActionKind, ActionOutputKind, ActionPhase, ContentChunkKind, ElicitationKind, PlanDisplayKind,
    PlanEntryStatus, RemoteKind, RuntimeStatus, SkillScope, client::RuntimeAuthMethod,
};

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
    pub skills: SkillsSnapshot,
    pub usage: Option<SessionUsageSnapshot>,
}

#[napi(object)]
pub struct AgentStateSnapshot {
    pub current_mode: Option<String>,
    pub current_permission_mode: Option<String>,
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
    pub permission_mode: Option<String>,
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
    pub permission_modes: AvailablePermissionModeSettingSnapshot,
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
pub struct AvailablePermissionModeSettingSnapshot {
    pub current_mode_id: Option<String>,
    pub available_modes: Vec<PermissionModeOptionSnapshot>,
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
pub struct PermissionModeOptionSnapshot {
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
pub struct SkillsSnapshot {
    pub can_list: bool,
    pub can_mention: bool,
    pub skills: Vec<SkillSnapshot>,
}

#[napi(object)]
pub struct SkillSnapshot {
    pub name: String,
    pub description: String,
    pub path: String,
    #[napi(ts_type = "`${SkillScope}`")]
    pub scope: SkillScope,
    pub enabled: bool,
}

#[napi(object)]
pub struct SessionUsageSnapshot {
    pub used: i64,
    pub size: i64,
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
    pub is_terminal: bool,
    pub input_text: String,
    pub output_text: String,
    pub reasoning_text: String,
    pub plan_text: String,
    pub plan_path: Option<String>,
    pub outcome: Option<String>,
    pub error: Option<ErrorSnapshot>,
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
