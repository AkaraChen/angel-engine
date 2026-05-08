use angel_engine::{
    AngelEngine, ConversationCapabilities, ConversationId, EngineError, ProtocolEffect,
    ProtocolFlavor, SessionModelState, TransportOptions, TransportOutput, UserInput,
};
use angel_provider::acp::AcpAdapter;
use angel_provider::codex::CodexAdapter;
use angel_provider::{InterpretedUserInput, ProtocolAdapter};
use serde_json::Value;

use crate::config::{ClientOptions, ClientProtocol};

#[derive(Debug)]
pub struct RuntimeAdapter {
    inner: Box<dyn ProtocolAdapter + Send + Sync>,
}

impl RuntimeAdapter {
    pub fn from_options(options: &ClientOptions) -> Self {
        let inner: Box<dyn ProtocolAdapter + Send + Sync> = match options.protocol {
            ClientProtocol::Acp if options.auth.need_auth => Box::new(AcpAdapter::standard()),
            ClientProtocol::Acp => Box::new(AcpAdapter::without_authentication()),
            ClientProtocol::CodexAppServer => Box::new(CodexAdapter::app_server()),
        };
        Self { inner }
    }
}

impl ProtocolAdapter for RuntimeAdapter {
    fn protocol_flavor(&self) -> ProtocolFlavor {
        self.inner.protocol_flavor()
    }

    fn capabilities(&self) -> ConversationCapabilities {
        self.inner.capabilities()
    }

    fn encode_effect(
        &self,
        engine: &AngelEngine,
        effect: &ProtocolEffect,
        options: &TransportOptions,
    ) -> Result<TransportOutput, EngineError> {
        self.inner.encode_effect(engine, effect, options)
    }

    fn decode_message(
        &self,
        engine: &AngelEngine,
        message: &angel_engine::JsonRpcMessage,
    ) -> Result<TransportOutput, EngineError> {
        self.inner.decode_message(engine, message)
    }

    fn model_catalog_from_runtime_debug(
        &self,
        result: &Value,
        current_model_id: Option<&str>,
    ) -> Option<SessionModelState> {
        self.inner
            .model_catalog_from_runtime_debug(result, current_model_id)
    }

    fn interpret_user_input(
        &self,
        engine: &AngelEngine,
        conversation_id: &ConversationId,
        input: &[UserInput],
    ) -> Result<Option<InterpretedUserInput>, EngineError> {
        self.inner
            .interpret_user_input(engine, conversation_id, input)
    }
}
