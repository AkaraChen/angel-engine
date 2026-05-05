use angel_engine::adapters::acp::AcpAdapter;
use angel_engine::adapters::codex::CodexAdapter;
use angel_engine::{
    AngelEngine, ConversationCapabilities, EngineError, ProtocolEffect, ProtocolFlavor,
    ProtocolTransport, SessionModelState, TransportOptions, TransportOutput,
};
use serde_json::Value;

use crate::config::{ClientOptions, ClientProtocol};

#[derive(Clone, Debug)]
pub(crate) enum RuntimeAdapter {
    Acp(AcpAdapter),
    Codex(CodexAdapter),
}

impl RuntimeAdapter {
    pub(crate) fn from_options(options: &ClientOptions) -> Self {
        match options.protocol {
            ClientProtocol::Acp if options.auth.need_auth => Self::Acp(AcpAdapter::standard()),
            ClientProtocol::Acp => Self::Acp(AcpAdapter::without_authentication()),
            ClientProtocol::CodexAppServer => Self::Codex(CodexAdapter::app_server()),
        }
    }

    pub(crate) fn protocol_flavor(&self) -> ProtocolFlavor {
        match self {
            Self::Acp(_) => ProtocolFlavor::Acp,
            Self::Codex(_) => ProtocolFlavor::CodexAppServer,
        }
    }

    pub(crate) fn capabilities(&self) -> ConversationCapabilities {
        match self {
            Self::Acp(adapter) => adapter.capabilities(),
            Self::Codex(adapter) => adapter.capabilities(),
        }
    }

    pub(crate) fn model_catalog_from_runtime_debug(
        &self,
        result: &Value,
        current_model_id: Option<&str>,
    ) -> Option<SessionModelState> {
        match self {
            Self::Acp(_) => None,
            Self::Codex(adapter) => {
                adapter.model_catalog_from_debug_models(result, current_model_id)
            }
        }
    }
}

impl ProtocolTransport for RuntimeAdapter {
    fn encode_effect(
        &self,
        engine: &AngelEngine,
        effect: &ProtocolEffect,
        options: &TransportOptions,
    ) -> Result<TransportOutput, EngineError> {
        match self {
            Self::Acp(adapter) => adapter.encode_effect(engine, effect, options),
            Self::Codex(adapter) => adapter.encode_effect(engine, effect, options),
        }
    }

    fn decode_message(
        &self,
        engine: &AngelEngine,
        message: &angel_engine::JsonRpcMessage,
    ) -> Result<TransportOutput, EngineError> {
        match self {
            Self::Acp(adapter) => adapter.decode_message(engine, message),
            Self::Codex(adapter) => adapter.decode_message(engine, message),
        }
    }
}
