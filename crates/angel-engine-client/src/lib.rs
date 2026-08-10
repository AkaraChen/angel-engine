//! IDE-facing client layer over `angel-engine`.
//!
//! `angel-engine` remains the protocol/state-machine crate. This crate exposes
//! the ergonomic layer expected by IDE integrations:
//!
//! `ClientOptionsBuilder -> AngelClient -> ThreadEvent`
//! `ClientOptionsBuilder -> ClientBuilder -> Client -> Thread -> ThreadEvent`.

mod adapter;
mod client;
mod config;
mod core;
mod error;
mod event;
mod importable;
mod injection_api;
mod process;
mod process_manager;
mod runtime;
mod session;
mod settings;
mod skills;
mod snapshot;
mod thread;

pub use adapter::RuntimeAdapter;
pub use angel_engine::{
    HostInjectionConfig, MCP_INJECT_CAPABILITY, McpInjectionConfig, McpServerConfig,
    McpServerTransport, SKILL_INJECT_CAPABILITY, SkillInjectionConfig,
    ensure_mcp_injection_allowed,
};
pub use client::{Client, ClientBuilder};
pub use config::{
    ClientAuthOptions, ClientEnvironmentVariable, ClientIdentity, ClientOptions,
    ClientOptionsBuilder, ClientProtocol, StartConversationRequest,
};
pub use core::{
    ClientAnswer, ClientCommandResult, ClientInput, DiscoveryRequest, ElicitationResponse,
    ForkConversationRequest, ImportableSession, ListImportableSessionsRequest,
    ListImportableSessionsResult, ResumeConversationRequest,
};
pub use error::{ClientError, ClientResult};
pub use event::{
    ClientEvent, ClientLog, ClientLogKind, ClientStreamDelta, ClientUpdate, JsonRpcOutbound,
    RuntimeAuthMethod,
};
pub use importable::{
    importable_session_from_conversation, importable_sessions_from_conversations,
    list_importable_sessions_result,
};
pub use injection_api::{
    can_inject_mcp, ensure_mcp_injection_for_options, inject_mcp_into_options,
    mcp_inject_unsupported_error, mcp_injection_capability,
};
pub use process::AngelClient;
pub use process_manager::{
    ListeningPortInfo, SubprocessInfo, list_listening_ports, list_subprocesses, process_is_running,
};
pub use runtime::{AgentRuntime, RuntimeOptions, RuntimeOptionsOverrides, create_runtime_options};
pub use session::{
    AngelSession, HydrateRequest, InspectRequest, RefreshSkillsRequest, SendTextRequest,
    SetModeRequest, SetPermissionModeRequest, TurnRunEvent, TurnRunResult,
};
pub use settings::{
    AvailableModeSettingSnapshot, AvailablePermissionModeSettingSnapshot, ModeOptionSnapshot,
    ModelListSettingSnapshot, ModelOptionSnapshot, PermissionModeOptionSnapshot,
    ReasoningLevelSettingSnapshot, ThreadSettingsSnapshot,
};
pub use skills::{
    SkillMaterializeReport, find_skill_package_dir, list_agent_skills, list_agent_skills_from_dirs,
    list_agent_skills_with_injection, materialize_skill_injection,
};
pub use snapshot::{
    ActionOutputSnapshot, ActionSnapshot, AgentStateSnapshot, AvailableCommandSnapshot,
    ClientSnapshot, ContentChunk, ContextSnapshot, ConversationSnapshot,
    DisplayMessagePartSnapshot, DisplayMessageSnapshot, DisplayPlanSnapshot,
    DisplayToolActionSnapshot, ElicitationSnapshot, ErrorSnapshot, HistoryReplaySnapshot,
    HistorySnapshot, PlanEntrySnapshot, QuestionConstraintsSnapshot, QuestionOptionSnapshot,
    QuestionSchemaSnapshot, QuestionSnapshot, RuntimeSnapshot, SessionUsageCostSnapshot,
    SessionUsageSnapshot, SkillScopeSnapshot, SkillSnapshot, SkillsSnapshot, TurnSnapshot,
};
pub use thread::{Conversation, Thread, ThreadEvent};
