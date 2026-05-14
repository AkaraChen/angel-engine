use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

use super::ProtocolAdapter;
use angel_engine::capabilities::{CapabilitySupport, ConversationCapabilities};
use angel_engine::error::ErrorInfo;
use angel_engine::event::EngineEvent;
use angel_engine::ids::{
    ActionId, ConversationId, ElicitationId, JsonRpcRequestId, RemoteConversationId,
    RemoteRequestId, TurnId,
};
use angel_engine::protocol::{ProtocolFlavor, ProtocolMethod};
use angel_engine::reducer::{AngelEngine, PendingRequest};
use angel_engine::state::{
    ActionInput, ActionKind, ActionOutputDelta, ActionPhase, ActionState, ContentDelta,
    ContentPart, ContextPatch, ElicitationChoice, ElicitationChoiceKind, ElicitationKind,
    ElicitationOptions, ElicitationPhase, ElicitationState, ExhaustionReason, HistoryReplayEntry,
    HistoryReplayToolAction, HistoryRole, SessionConfigOption, SessionConfigValue, SessionMode,
    SessionModeState, SessionModel, SessionModelState, SessionUsageCost, SessionUsageState,
    TurnOutcome, UserQuestion, UserQuestionOption,
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
pub(crate) mod wire;

pub(crate) use helpers::acp_tool_history_entry;
pub use types::*;

#[derive(Clone, Debug)]
pub struct AcpAdapter {
    capabilities: AcpAdapterCapabilities,
    auth_negotiation_result: Arc<Mutex<Option<Value>>>,
    duplicate_tool_actions: Arc<Mutex<BTreeMap<String, ActionId>>>,
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
            conversation: acp_standard_capabilities(),
        }
    }

    pub fn without_authentication(mut self) -> Self {
        self.runtime.authentication = CapabilitySupport::Unsupported;
        self
    }
}

impl AcpAdapter {
    pub fn new(capabilities: AcpAdapterCapabilities) -> Self {
        Self {
            capabilities,
            auth_negotiation_result: Arc::new(Mutex::new(None)),
            duplicate_tool_actions: Arc::new(Mutex::new(BTreeMap::new())),
        }
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

pub fn acp_standard_capabilities() -> ConversationCapabilities {
    ConversationCapabilities {
        lifecycle: angel_engine::LifecycleCapabilities {
            create: CapabilitySupport::Supported,
            list: CapabilitySupport::Supported,
            load: CapabilitySupport::Unknown,
            resume: CapabilitySupport::Unknown,
            fork: CapabilitySupport::Unsupported,
            archive: CapabilitySupport::Unsupported,
            close: CapabilitySupport::Unknown,
        },
        turn: angel_engine::TurnCapabilities {
            start: CapabilitySupport::Supported,
            steer: CapabilitySupport::Unsupported,
            cancel: CapabilitySupport::Supported,
            max_active_turns: 1,
            requires_expected_turn_id_for_steer: false,
        },
        action: angel_engine::ActionCapabilities {
            observe: CapabilitySupport::Supported,
            stream_output: CapabilitySupport::Supported,
            decline: CapabilitySupport::Supported,
        },
        elicitation: angel_engine::ElicitationCapabilities {
            approval: CapabilitySupport::Supported,
            user_input: CapabilitySupport::Unknown,
            external_flow: CapabilitySupport::Unknown,
            dynamic_tool_call: CapabilitySupport::Unknown,
        },
        history: angel_engine::HistoryCapabilities {
            hydrate: CapabilitySupport::Unknown,
            compact: CapabilitySupport::Unsupported,
            rollback: CapabilitySupport::Unsupported,
            inject_items: CapabilitySupport::Unsupported,
            shell_command: CapabilitySupport::Unsupported,
        },
        context: angel_engine::ContextCapabilities {
            mode: CapabilitySupport::Unknown,
            config: CapabilitySupport::Unknown,
            additional_directories: CapabilitySupport::Unknown,
            turn_overrides: CapabilitySupport::Unsupported,
        },
        observer: angel_engine::ObserverCapabilities {
            unsubscribe: CapabilitySupport::Unsupported,
        },
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
