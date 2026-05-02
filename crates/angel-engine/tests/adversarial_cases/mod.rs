use angel_engine::adapters::acp::AcpAdapter;
use angel_engine::adapters::codex::CodexAdapter;
use angel_engine::*;

mod acp;
mod codex;
mod json_rpc;

fn runtime(name: &str) -> RuntimeCapabilities {
    RuntimeCapabilities::new(name)
}

fn codex_engine(adapter: &CodexAdapter) -> AngelEngine {
    AngelEngine::with_available_runtime(
        ProtocolFlavor::CodexAppServer,
        runtime("test-codex"),
        adapter.capabilities(),
    )
}

fn acp_engine(adapter: &AcpAdapter) -> AngelEngine {
    AngelEngine::with_available_runtime(
        ProtocolFlavor::Acp,
        runtime("test-acp"),
        adapter.capabilities(),
    )
}

fn insert_ready_conversation(
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

fn start_turn(
    engine: &mut AngelEngine,
    conversation_id: ConversationId,
    text: &str,
) -> CommandPlan {
    engine
        .plan_command(EngineCommand::StartTurn {
            conversation_id,
            input: vec![UserInput::text(text)],
            overrides: TurnOverrides::default(),
        })
        .expect("start turn")
}

fn decode_and_apply<T: ProtocolTransport>(
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

fn encode_request<T: ProtocolTransport>(
    adapter: &T,
    engine: &AngelEngine,
    effect: &ProtocolEffect,
) -> (JsonRpcRequestId, String, serde_json::Value) {
    let output = adapter
        .encode_effect(engine, effect, &TransportOptions::default())
        .expect("encode effect");
    let Some(JsonRpcMessage::Request { id, method, params }) = output.messages.first() else {
        panic!("expected JSON-RPC request");
    };
    (id.clone(), method.clone(), params.clone())
}

fn assert_error_message(output: &TransportOutput, id: &str, code: i64) {
    assert!(matches!(
        output.messages.as_slice(),
        [JsonRpcMessage::Error {
            id: Some(actual_id),
            code: actual_code,
            ..
        }] if actual_id == &JsonRpcRequestId::new(id) && *actual_code == code
    ));
}
