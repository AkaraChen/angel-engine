use napi_derive::napi;

use super::{
    AgentRuntime, ClientProtocol, ElicitationResponseType, ThreadEventType, TurnRunDeltaPart,
    TurnRunEventType,
    client::{ClientAuthOptions, ClientIdentity},
    snapshot::{ActionOutputSnapshot, ConversationSnapshot, DisplayMessagePartSnapshot},
};

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
    pub force_reload: Option<bool>,
}

#[napi(object)]
pub struct RuntimeOptionsOverrides {
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub auth: Option<ClientAuthOptions>,
    pub identity: Option<ClientIdentity>,
    pub cwd: Option<String>,
    pub additional_directories: Option<Vec<String>>,
    pub environment: Option<Vec<ClientEnvironmentVariable>>,
    pub experimental_api: Option<bool>,
    pub process_label: Option<String>,
    pub client_name: Option<String>,
    pub client_title: Option<String>,
    pub default_reasoning_effort: Option<String>,
}

#[napi(object)]
pub struct ClientEnvironmentVariable {
    pub name: String,
    pub value: String,
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
    pub environment: Option<Vec<ClientEnvironmentVariable>>,
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
        ts_type = "Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string; name?: string | null } | { type: 'resource_link'; name: string; uri: string; mimeType?: string | null; title?: string | null; description?: string | null } | { type: 'file_mention'; name: string; path: string; mimeType?: string | null } | { type: 'skill_mention'; name: string; path: string } | { type: 'embedded_text_resource'; uri: string; text: string; mimeType?: string | null } | { type: 'embedded_blob_resource'; uri: string; data: string; mimeType?: string | null; name?: string | null } | { type: 'raw_content_block'; value: unknown }>"
    )]
    pub input: Option<Vec<serde_json::Value>>,
    pub cwd: Option<String>,
    pub remote_id: Option<String>,
    pub model: Option<String>,
    pub mode: Option<String>,
    pub permission_mode: Option<String>,
    pub reasoning_effort: Option<String>,
}

#[napi(object)]
pub struct SetModeRequest {
    pub mode: String,
    pub cwd: Option<String>,
    pub remote_id: Option<String>,
}

#[napi(object)]
pub struct SetPermissionModeRequest {
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
pub struct RefreshSkillsRequest {
    pub cwd: Option<String>,
    pub remote_id: Option<String>,
    pub force_reload: Option<bool>,
}

#[napi(object)]
pub struct InspectRequest {
    pub cwd: Option<String>,
}

#[napi(object)]
pub struct TurnRunResult {
    pub remote_thread_id: Option<String>,
    pub turn_id: Option<String>,
    pub conversation: Option<ConversationSnapshot>,
}

#[napi(object)]
pub struct TurnRunEvent {
    #[napi(ts_type = "`${TurnRunEventType}`")]
    pub r#type: TurnRunEventType,
    #[napi(ts_type = "`${TurnRunDeltaPart}`")]
    pub part: Option<TurnRunDeltaPart>,
    pub text: Option<String>,
    pub turn_id: Option<String>,
    pub action_id: Option<String>,
    pub content: Option<ActionOutputSnapshot>,
    pub message_part: Option<DisplayMessagePartSnapshot>,
    pub result: Option<TurnRunResult>,
}
