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
mod process;
mod runtime;
mod session;
mod settings;
mod snapshot;
mod thread;

pub use adapter::RuntimeAdapter;
pub use client::{Client, ClientBuilder};
pub use config::{
    ClientAuthOptions, ClientIdentity, ClientOptions, ClientOptionsBuilder, ClientProtocol,
    StartConversationRequest,
};
pub use core::{
    ClientAnswer, ClientCommandResult, ClientInput, DiscoveryRequest, ElicitationResponse,
    ForkConversationRequest, ResumeConversationRequest,
};
pub use error::{ClientError, ClientResult};
pub use event::{
    ClientEvent, ClientLog, ClientLogKind, ClientStreamDelta, ClientUpdate, JsonRpcOutbound,
    RuntimeAuthMethod,
};
pub use process::AngelClient;
pub use runtime::{AgentRuntime, RuntimeOptions, RuntimeOptionsOverrides, create_runtime_options};
pub use session::{
    AngelSession, HydrateRequest, InspectRequest, SendTextRequest, SetModeRequest,
    SetPermissionModeRequest, TurnRunEvent, TurnRunResult,
};
pub use settings::{
    AvailableModeSettingSnapshot, AvailablePermissionModeSettingSnapshot, ModeOptionSnapshot,
    ModelListSettingSnapshot, ModelOptionSnapshot, PermissionModeOptionSnapshot,
    ReasoningLevelSettingSnapshot, ThreadSettingsSnapshot,
};
pub use snapshot::{
    ActionOutputSnapshot, ActionSnapshot, AgentStateSnapshot, AvailableCommandSnapshot,
    ClientSnapshot, ContentChunk, ContextSnapshot, ConversationSnapshot,
    DisplayMessagePartSnapshot, DisplayMessageSnapshot, DisplayPlanSnapshot,
    DisplayToolActionSnapshot, ElicitationSnapshot, ErrorSnapshot, HistoryReplaySnapshot,
    HistorySnapshot, PlanEntrySnapshot, QuestionConstraintsSnapshot, QuestionOptionSnapshot,
    QuestionSchemaSnapshot, QuestionSnapshot, RuntimeSnapshot, SessionUsageCostSnapshot,
    SessionUsageSnapshot, TurnSnapshot,
};
pub use thread::{Conversation, Thread, ThreadEvent};
