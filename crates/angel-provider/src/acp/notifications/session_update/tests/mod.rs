use angel_engine::*;

use super::super::super::AcpAdapter;

mod content;
mod metadata;
mod tools;

pub(super) fn ready_conversation(adapter: &AcpAdapter, engine: &mut AngelEngine) -> ConversationId {
    let conversation_id = ConversationId::new("conv");
    engine
        .apply_event(EngineEvent::ConversationProvisionStarted {
            id: conversation_id.clone(),
            remote: RemoteConversationId::Pending("conv".to_string()),
            op: angel_engine::ProvisionOp::New,
            capabilities: adapter.capabilities(),
        })
        .expect("conversation provision");
    engine
        .apply_event(EngineEvent::ConversationReady {
            id: conversation_id.clone(),
            remote: Some(RemoteConversationId::Known("sess".to_string())),
            context: ContextPatch::empty(),
            capabilities: None,
        })
        .expect("conversation ready");
    conversation_id
}

pub(super) fn start_ready_turn(
    engine: &mut AngelEngine,
    conversation_id: &ConversationId,
) -> TurnId {
    let turn_id = TurnId::new("turn");
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

pub(super) fn apply_events(engine: &mut AngelEngine, events: Vec<EngineEvent>) {
    for event in events {
        engine.apply_event(event).expect("apply event");
    }
}
