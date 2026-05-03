//! IDE-facing client layer over `angel-engine`.
//!
//! `angel-engine` remains the protocol/state-machine crate. This crate exposes
//! the ergonomic layer expected by IDE integrations:
//!
//! `ClientOptionsBuilder -> ClientBuilder -> Client -> Thread -> ThreadEvent`.

mod adapter;
mod client;
mod config;
mod core;
mod error;
mod event;
mod process;
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
    ClientEvent, ClientLog, ClientLogKind, ClientUpdate, JsonRpcOutbound, RuntimeAuthMethod,
};
pub use process::AngelClient;
pub use snapshot::{
    ActionOutputSnapshot, ActionSnapshot, AvailableCommandSnapshot, ClientSnapshot, ContentChunk,
    ContextSnapshot, ConversationSnapshot, ElicitationSnapshot, ErrorSnapshot,
    HistoryReplaySnapshot, HistorySnapshot, PlanEntrySnapshot, QuestionConstraintsSnapshot,
    QuestionOptionSnapshot, QuestionSchemaSnapshot, QuestionSnapshot, RuntimeSnapshot,
    SessionConfigOptionSnapshot, SessionConfigValueSnapshot, SessionModeSnapshot,
    SessionModeStateSnapshot, SessionModelSnapshot, SessionModelStateSnapshot,
    SessionUsageCostSnapshot, SessionUsageSnapshot, TurnSnapshot,
};
pub use thread::{Conversation, Thread, ThreadEvent};
