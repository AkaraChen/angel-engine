use super::*;

mod actions;
mod content;

fn engine_with_thread(adapter: &CodexAdapter) -> AngelEngine {
    let mut engine = AngelEngine::with_available_runtime(
        angel_engine::ProtocolFlavor::CodexAppServer,
        angel_engine::RuntimeCapabilities::new("test"),
        adapter.capabilities(),
    );
    let conversation_id = ConversationId::new("conv");
    engine.conversations.insert(
        conversation_id.clone(),
        angel_engine::ConversationState::new(
            conversation_id.clone(),
            RemoteConversationId::Known("thread".to_string()),
            ConversationLifecycle::Idle,
            adapter.capabilities(),
        ),
    );
    engine.selected = Some(conversation_id);
    engine
}
