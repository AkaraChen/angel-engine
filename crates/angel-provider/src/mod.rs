use std::fmt::Debug;

pub use angel_engine::*;
use serde_json::Value;

pub mod acp;
pub mod codex;
pub mod kimi;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InterpretedUserInput {
    pub command: EngineCommand,
    pub message: Option<String>,
}

pub trait ProtocolAdapter: Debug {
    fn protocol_flavor(&self) -> ProtocolFlavor;

    fn capabilities(&self) -> ConversationCapabilities;

    fn encode_effect(
        &self,
        engine: &AngelEngine,
        effect: &ProtocolEffect,
        options: &TransportOptions,
    ) -> Result<TransportOutput, EngineError>;

    fn decode_message(
        &self,
        engine: &AngelEngine,
        message: &JsonRpcMessage,
    ) -> Result<TransportOutput, EngineError>;

    fn model_catalog_from_runtime_debug(
        &self,
        _result: &Value,
        _current_model_id: Option<&str>,
    ) -> Option<SessionModelState> {
        None
    }

    fn interpret_user_input(
        &self,
        _engine: &AngelEngine,
        _conversation_id: &ConversationId,
        _input: &[UserInput],
    ) -> Result<Option<InterpretedUserInput>, EngineError> {
        Ok(None)
    }
}
