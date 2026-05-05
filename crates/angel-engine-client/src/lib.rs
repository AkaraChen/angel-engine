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
pub use runtime::{
    AgentRuntime, RuntimeOptions, RuntimeOptionsOverrides, create_runtime_options,
    normalize_runtime_name,
};
pub use session::{
    AngelSession, HydrateRequest, InspectRequest, SendTextRequest, TurnRunEvent, TurnRunResult,
};
pub use settings::{
    AvailableModeSettingSnapshot, ModeOptionSnapshot, ModelListSettingSnapshot,
    ModelOptionSnapshot, ReasoningLevelSettingSnapshot, ThreadSettingsSnapshot,
};
pub use snapshot::{
    ActionOutputSnapshot, ActionSnapshot, AvailableCommandSnapshot, ClientSnapshot, ContentChunk,
    ContextSnapshot, ConversationSnapshot, DisplayMessagePartSnapshot, DisplayMessageSnapshot,
    DisplayToolActionSnapshot, ElicitationSnapshot, ErrorSnapshot, HistoryReplaySnapshot,
    HistorySnapshot, PlanEntrySnapshot, QuestionConstraintsSnapshot, QuestionOptionSnapshot,
    QuestionSchemaSnapshot, QuestionSnapshot, ReasoningOptionsSnapshot, RuntimeSnapshot,
    SessionConfigOptionSnapshot, SessionConfigValueSnapshot, SessionModeSnapshot,
    SessionModeStateSnapshot, SessionModelSnapshot, SessionModelStateSnapshot,
    SessionUsageCostSnapshot, SessionUsageSnapshot, TurnSnapshot,
};
pub use thread::{Conversation, Thread, ThreadEvent};
