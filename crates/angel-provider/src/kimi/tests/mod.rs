use std::path::PathBuf;

use angel_engine::*;
use serde_json::Value;

use crate::ProtocolAdapter;

use super::KimiAdapter;
use super::history::{
    kimi_context_history_entries, kimi_local_mode_event, kimi_local_permission_mode_event,
    kimi_local_plan_entry, kimi_session_state,
};
use super::state::{kimi_permission_mode_state_for, kimi_plan_mode_state};

mod modes;
mod permissions;
mod projection;

pub(super) fn ready_engine(adapter: &KimiAdapter) -> (AngelEngine, ConversationId) {
    let mut engine = AngelEngine::with_available_runtime(
        ProtocolFlavor::Acp,
        angel_engine::RuntimeCapabilities::new("Kimi Code CLI"),
        adapter.capabilities(),
    );
    let conversation_id = ConversationId::new("conv");
    engine.conversations.insert(
        conversation_id.clone(),
        ConversationState::new(
            conversation_id.clone(),
            RemoteConversationId::Known("sess".to_string()),
            ConversationLifecycle::Idle,
            adapter.capabilities(),
        ),
    );
    (engine, conversation_id)
}

pub(super) fn apply(engine: &mut AngelEngine, output: &TransportOutput) {
    apply_transport_output(engine, output).expect("apply output");
}

pub(super) fn start_turn(
    engine: &mut AngelEngine,
    conversation_id: &ConversationId,
) -> angel_engine::TurnId {
    let turn_id = angel_engine::TurnId::new("turn");
    engine
        .apply_event(EngineEvent::TurnStarted {
            conversation_id: conversation_id.clone(),
            turn_id: turn_id.clone(),
            remote: angel_engine::RemoteTurnId::Local("remote-turn".to_string()),
            input: Vec::new(),
        })
        .expect("turn started");
    turn_id
}

pub(super) fn fixture_path(path: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/kimi")
        .join(path)
}

pub(super) fn fixture_context_path() -> PathBuf {
    fixture_path("share/sessions/workspace/session-1/context.jsonl")
}
