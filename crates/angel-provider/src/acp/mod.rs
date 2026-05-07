use super::ProtocolAdapter;
use angel_engine::capabilities::{CapabilitySupport, ConversationCapabilities};
use angel_engine::error::ErrorInfo;
use angel_engine::event::EngineEvent;
use angel_engine::ids::{
    ActionId, ConversationId, ElicitationId, JsonRpcRequestId, RemoteConversationId,
    RemoteRequestId, TurnId,
};
use angel_engine::protocol::{AcpMethod, ProtocolFlavor, ProtocolMethod};
use angel_engine::reducer::{AngelEngine, PendingRequest};
use angel_engine::state::{
    ActionInput, ActionKind, ActionPhase, ActionState, ContentDelta, ContentPart, ContextPatch,
    ElicitationKind, ElicitationOptions, ElicitationPhase, ElicitationState, ExhaustionReason,
    SessionConfigOption, SessionConfigValue, SessionMode, SessionModeState, SessionModel,
    SessionModelState, SessionUsageCost, SessionUsageState, TurnOutcome, UserQuestion,
    UserQuestionOption,
};
use angel_engine::transport::{
    JsonRpcMessage, TransportLogKind, TransportOptions, TransportOutput, client_info_json,
    method_name,
};
use angel_engine::{EngineError, ProtocolEffect};
use serde_json::{Value, json};

mod encode;
mod helpers;
mod notifications;
mod requests;
mod response;
mod transport;
mod types;

pub use types::*;

#[derive(Clone, Debug)]
pub struct AcpAdapter {
    capabilities: AcpAdapterCapabilities,
}

#[derive(Clone, Debug)]
pub struct AcpAdapterCapabilities {
    pub runtime: AcpRuntimeCapabilities,
    pub conversation: ConversationCapabilities,
}

#[derive(Clone, Debug)]
pub struct AcpRuntimeCapabilities {
    pub authentication: CapabilitySupport,
}

impl AcpAdapterCapabilities {
    pub fn standard() -> Self {
        Self {
            runtime: AcpRuntimeCapabilities {
                authentication: CapabilitySupport::Supported,
            },
            conversation: ConversationCapabilities::acp_standard(),
        }
    }

    pub fn without_authentication(mut self) -> Self {
        self.runtime.authentication = CapabilitySupport::Unsupported;
        self
    }
}

impl AcpAdapter {
    pub fn new(capabilities: AcpAdapterCapabilities) -> Self {
        Self { capabilities }
    }

    pub fn standard() -> Self {
        Self::new(AcpAdapterCapabilities::standard())
    }

    pub fn with_steer_extension(name: impl Into<String>) -> Self {
        let mut adapter = Self::standard();
        adapter.capabilities.conversation.turn.steer =
            angel_engine::CapabilitySupport::Extension { name: name.into() };
        adapter
    }

    pub fn without_authentication() -> Self {
        Self::new(AcpAdapterCapabilities::standard().without_authentication())
    }

    pub fn capabilities(&self) -> ConversationCapabilities {
        self.capabilities.conversation.clone()
    }

    pub fn adapter_capabilities(&self) -> &AcpAdapterCapabilities {
        &self.capabilities
    }

    pub fn stop_reason_event(
        &self,
        conversation_id: ConversationId,
        turn_id: TurnId,
        reason: AcpStopReason,
    ) -> EngineEvent {
        EngineEvent::TurnTerminal {
            conversation_id,
            turn_id,
            outcome: reason.into(),
        }
    }

    pub fn tool_status_to_phase(status: AcpToolStatus) -> ActionPhase {
        match status {
            AcpToolStatus::Pending => ActionPhase::Proposed,
            AcpToolStatus::InProgress => ActionPhase::Running,
            AcpToolStatus::Completed => ActionPhase::Completed,
            AcpToolStatus::Failed => ActionPhase::Failed,
        }
    }
}

impl ProtocolAdapter for AcpAdapter {
    fn protocol_flavor(&self) -> ProtocolFlavor {
        ProtocolFlavor::Acp
    }

    fn capabilities(&self) -> ConversationCapabilities {
        self.capabilities.conversation.clone()
    }

    fn encode_effect(
        &self,
        engine: &AngelEngine,
        effect: &ProtocolEffect,
        options: &TransportOptions,
    ) -> Result<TransportOutput, EngineError> {
        AcpAdapter::encode_effect(self, engine, effect, options)
    }

    fn decode_message(
        &self,
        engine: &AngelEngine,
        message: &JsonRpcMessage,
    ) -> Result<TransportOutput, EngineError> {
        AcpAdapter::decode_message(self, engine, message)
    }
}
