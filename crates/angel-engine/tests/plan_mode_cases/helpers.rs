use angel_engine::adapters::acp::AcpAdapter;
use angel_engine::adapters::codex::CodexAdapter;
use angel_engine::*;

fn runtime(name: &str) -> RuntimeCapabilities {
    RuntimeCapabilities::new(name)
}

pub(super) fn codex_engine(adapter: &CodexAdapter) -> AngelEngine {
    AngelEngine::with_available_runtime(
        ProtocolFlavor::CodexAppServer,
        runtime("test-codex"),
        adapter.capabilities(),
    )
}

pub(super) fn acp_engine(adapter: &AcpAdapter) -> AngelEngine {
    AngelEngine::with_available_runtime(
        ProtocolFlavor::Acp,
        runtime("test-acp"),
        adapter.capabilities(),
    )
}

pub(super) fn insert_ready_conversation(
    engine: &mut AngelEngine,
    id: &str,
    remote: RemoteConversationId,
    capabilities: ConversationCapabilities,
) -> ConversationId {
    let id = ConversationId::new(id);
    engine.conversations.insert(
        id.clone(),
        ConversationState::new(
            id.clone(),
            remote,
            ConversationLifecycle::Idle,
            capabilities,
        ),
    );
    engine.selected = Some(id.clone());
    id
}

pub(super) fn decode_and_apply<T: ProtocolTransport>(
    adapter: &T,
    engine: &mut AngelEngine,
    message: JsonRpcMessage,
) -> TransportOutput {
    let output = adapter
        .decode_message(engine, &message)
        .expect("decode message");
    apply_transport_output(engine, &output).expect("apply transport output");
    output
}

pub(super) fn encode_and_apply<T: ProtocolTransport>(
    adapter: &T,
    engine: &mut AngelEngine,
    effect: &ProtocolEffect,
) -> TransportOutput {
    let output = adapter
        .encode_effect(engine, effect, &TransportOptions::default())
        .expect("encode effect");
    apply_transport_output(engine, &output).expect("apply transport output");
    output
}

pub(super) fn set_mode(mode: &str) -> ContextPatch {
    ContextPatch::one(ContextUpdate::Mode {
        scope: ContextScope::TurnAndFuture,
        mode: Some(AgentMode {
            id: mode.to_string(),
        }),
    })
}

pub(super) fn set_model_and_mode(model: &str, mode: &str) -> ContextPatch {
    ContextPatch {
        updates: vec![
            ContextUpdate::Model {
                scope: ContextScope::TurnAndFuture,
                model: Some(model.to_string()),
            },
            ContextUpdate::Mode {
                scope: ContextScope::TurnAndFuture,
                mode: Some(AgentMode {
                    id: mode.to_string(),
                }),
            },
        ],
    }
}
