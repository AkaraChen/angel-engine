use angel_engine::capabilities::ConversationCapabilities;
use angel_engine::ids::ConversationId;
use angel_engine::protocol::ProtocolMethod;
use angel_engine::transport::{JsonRpcMessage, TransportOptions, TransportOutput};
use angel_engine::{
    AngelEngine, EngineError, ProtocolEffect, ProtocolFlavor, SessionModelState, UserInput,
};
use serde_json::Value;

use crate::acp::{AcpAdapter, AcpAdapterCapabilities};
use crate::{InterpretedUserInput, ProtocolAdapter};

use state::{KimiPermissionMode, kimi_startup_permission_mode};

mod commands;
mod history;
mod notifications;
mod plan;
mod state;

#[cfg(test)]
mod tests;

#[derive(Clone, Debug)]
pub struct KimiAdapter {
    acp: AcpAdapter,
    startup_permission_mode: KimiPermissionMode,
}

impl KimiAdapter {
    pub fn new(capabilities: AcpAdapterCapabilities) -> Self {
        Self::with_startup_permission_mode(capabilities, KimiPermissionMode::Default)
    }

    pub fn with_args(capabilities: AcpAdapterCapabilities, args: &[String]) -> Self {
        Self::with_startup_permission_mode(capabilities, kimi_startup_permission_mode(args))
    }

    fn with_startup_permission_mode(
        capabilities: AcpAdapterCapabilities,
        startup_permission_mode: KimiPermissionMode,
    ) -> Self {
        Self {
            acp: AcpAdapter::new(capabilities),
            startup_permission_mode,
        }
    }

    pub fn standard() -> Self {
        Self::new(AcpAdapterCapabilities::standard())
    }

    pub fn standard_with_args(args: &[String]) -> Self {
        Self::with_args(AcpAdapterCapabilities::standard(), args)
    }

    pub fn without_authentication() -> Self {
        Self::new(AcpAdapterCapabilities::standard().without_authentication())
    }

    pub fn without_authentication_with_args(args: &[String]) -> Self {
        Self::with_args(
            AcpAdapterCapabilities::standard().without_authentication(),
            args,
        )
    }

    pub fn capabilities(&self) -> ConversationCapabilities {
        self.acp.capabilities()
    }
}

impl ProtocolAdapter for KimiAdapter {
    fn protocol_flavor(&self) -> ProtocolFlavor {
        ProtocolFlavor::Acp
    }

    fn capabilities(&self) -> ConversationCapabilities {
        self.acp.capabilities()
    }

    fn encode_effect(
        &self,
        engine: &AngelEngine,
        effect: &ProtocolEffect,
        options: &TransportOptions,
    ) -> Result<TransportOutput, EngineError> {
        if matches!(effect.method, ProtocolMethod::UpdateContext)
            && let Some(output) = self.encode_kimi_permission_mode_effect(engine, effect)?
        {
            return Ok(output);
        }
        if matches!(
            effect.method,
            ProtocolMethod::SetSessionMode | ProtocolMethod::UpdateContext
        ) && let Some(output) = self.encode_kimi_mode_effect(engine, effect, options)?
        {
            return Ok(output);
        }

        self.acp.encode_effect(engine, effect, options)
    }

    fn decode_message(
        &self,
        engine: &AngelEngine,
        message: &JsonRpcMessage,
    ) -> Result<TransportOutput, EngineError> {
        let output = self.acp.decode_message(engine, message)?;
        self.normalize_kimi_output(engine, message, output)
    }

    fn model_catalog_from_runtime_debug(
        &self,
        result: &Value,
        current_model_id: Option<&str>,
    ) -> Option<SessionModelState> {
        self.acp
            .model_catalog_from_runtime_debug(result, current_model_id)
    }

    fn interpret_user_input(
        &self,
        engine: &AngelEngine,
        conversation_id: &ConversationId,
        input: &[UserInput],
    ) -> Result<Option<InterpretedUserInput>, EngineError> {
        self.acp
            .interpret_user_input(engine, conversation_id, input)
    }
}
