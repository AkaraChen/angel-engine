use crate::command::{EngineCommand, TurnOverrides, UserInput};
use crate::event::EngineEvent;
use crate::ids::RemoteConversationId;
use crate::protocol::{ProtocolFlavor, ProtocolMethod};
use crate::state::{
    AgentMode, ApprovalPolicy, ContextPatch, ContextScope, ContextUpdate, PermissionMode,
    PermissionProfile, ReasoningProfile, SandboxProfile, SessionConfigOption, SessionConfigValue,
    SessionMode, SessionModeState, SessionModel, SessionModelState, SessionPermissionMode,
    SessionPermissionModeState,
};

use super::{acp_capabilities, codex_capabilities, engine_with, insert_ready_conversation};

mod effects;
mod settings;
