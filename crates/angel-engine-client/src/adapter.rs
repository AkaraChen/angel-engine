use angel_engine::{
    AngelEngine, ConversationCapabilities, ConversationId, EngineError, ProtocolEffect,
    ProtocolFlavor, SessionModelState, TransportOptions, TransportOutput, UserInput,
};
use angel_provider::acp::AcpAdapter;
use angel_provider::cline::ClineAdapter;
use angel_provider::codex::CodexAdapter;
use angel_provider::copilot::CopilotAdapter;
use angel_provider::cursor::CursorAdapter;
use angel_provider::gemini::GeminiAdapter;
use angel_provider::kimi::KimiAdapter;
use angel_provider::qoder::QoderAdapter;
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
            ClientProtocol::Kimi if options.auth.need_auth => {
                Box::new(KimiAdapter::standard_with_args(&options.args))
            }
            ClientProtocol::Kimi => {
                Box::new(KimiAdapter::without_authentication_with_args(&options.args))
            }
            ClientProtocol::Gemini if options.auth.need_auth => Box::new(GeminiAdapter::standard()),
            ClientProtocol::Gemini => Box::new(GeminiAdapter::without_authentication()),
            ClientProtocol::Qoder => Box::new(QoderAdapter::without_authentication()),
            ClientProtocol::Copilot if options.auth.need_auth => {
                Box::new(CopilotAdapter::standard_with_args(&options.args))
            }
            ClientProtocol::Copilot => Box::new(CopilotAdapter::without_authentication_with_args(
                &options.args,
            )),
            ClientProtocol::Cursor if options.auth.need_auth => {
                Box::new(CursorAdapter::standard_with_args(&options.args))
            }
            ClientProtocol::Cursor => Box::new(CursorAdapter::without_authentication_with_args(
                &options.args,
            )),
            ClientProtocol::Cline if options.auth.need_auth => {
                Box::new(ClineAdapter::standard_with_args(&options.args))
            }
            ClientProtocol::Cline => Box::new(ClineAdapter::without_authentication_with_args(
                &options.args,
            )),
            ClientProtocol::CodexAppServer => Box::new(CodexAdapter::app_server()),
            ClientProtocol::Custom => Box::new(UnsupportedCustomAdapter),
        };
        Self { inner }
    }
}

#[derive(Debug)]
struct UnsupportedCustomAdapter;

impl ProtocolAdapter for UnsupportedCustomAdapter {
    fn protocol_flavor(&self) -> ProtocolFlavor {
        ProtocolFlavor::Custom
    }

    fn capabilities(&self) -> ConversationCapabilities {
        ConversationCapabilities::unknown()
    }

    fn encode_effect(
        &self,
        _engine: &AngelEngine,
        _effect: &ProtocolEffect,
        _options: &TransportOptions,
    ) -> Result<TransportOutput, EngineError> {
        Err(EngineError::InvalidCommand {
            message: "custom client protocol requires an explicit adapter".to_string(),
        })
    }

    fn decode_message(
        &self,
        _engine: &AngelEngine,
        _message: &angel_engine::JsonRpcMessage,
    ) -> Result<TransportOutput, EngineError> {
        Err(EngineError::InvalidCommand {
            message: "custom client protocol requires an explicit adapter".to_string(),
        })
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
