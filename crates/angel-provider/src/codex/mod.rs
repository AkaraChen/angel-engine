use super::{InterpretedUserInput, ProtocolAdapter};
use angel_engine::capabilities::{CapabilitySupport, ConversationCapabilities};
use angel_engine::error::ErrorInfo;
use angel_engine::event::EngineEvent;
use angel_engine::ids::{
    ActionId, ConversationId, ElicitationId, JsonRpcRequestId, RemoteActionId,
    RemoteConversationId, RemoteRequestId, RemoteTurnId, TurnId,
};
use angel_engine::protocol::{ProtocolFlavor, ProtocolMethod};
use angel_engine::reducer::{AngelEngine, PendingRequest};
use angel_engine::state::{
    ActionInput, ActionKind, ActionOutputDelta, ActionPatch, ActionPhase, ActionState,
    ContentDelta, ContentPart, ContextPatch, ConversationLifecycle, ElicitationKind,
    ElicitationOptions, ElicitationState, ExhaustionReason, HistoryReplayEntry,
    HistoryReplayToolAction, HistoryRole, PlanEntry, PlanEntryStatus, PlanState,
    SessionConfigOption, SessionConfigValue, SessionMode, SessionModeState, SessionModel,
    SessionModelState, TurnOutcome, UserQuestion, UserQuestionOption,
};
use angel_engine::transport::{
    JsonRpcMessage, TransportLogKind, TransportOptions, TransportOutput, client_info_json,
    method_name,
};
use angel_engine::{EngineError, ProtocolEffect};
use serde_json::{Value, json};

mod actions;
mod commands;
mod encode;
mod ids;
mod notifications;
mod protocol_helpers;
mod requests;
mod response;
mod summaries;
mod transport;
mod types;

pub use types::*;

#[derive(Clone, Debug)]
pub struct CodexAdapter {
    capabilities: ConversationCapabilities,
}

impl CodexAdapter {
    pub fn app_server() -> Self {
        Self {
            capabilities: codex_app_server_capabilities(),
        }
    }

    pub fn capabilities(&self) -> ConversationCapabilities {
        self.capabilities.clone()
    }

    pub fn thread_status_event(
        &self,
        conversation_id: ConversationId,
        status: CodexThreadStatus,
    ) -> EngineEvent {
        EngineEvent::ConversationStatusChanged {
            id: conversation_id,
            lifecycle: status.into(),
        }
    }

    pub fn turn_status_to_outcome(
        status: CodexTurnStatus,
        error: Option<ErrorInfo>,
    ) -> TurnOutcome {
        match status {
            CodexTurnStatus::Completed => error.map_or(TurnOutcome::Succeeded, TurnOutcome::Failed),
            CodexTurnStatus::Interrupted => TurnOutcome::Interrupted,
            CodexTurnStatus::Failed => TurnOutcome::Failed(
                error.unwrap_or_else(|| ErrorInfo::new("codex.turn_failed", "turn failed")),
            ),
            CodexTurnStatus::InProgress => TurnOutcome::Failed(ErrorInfo::new(
                "codex.invalid_terminal",
                "inProgress is not a terminal turn status",
            )),
        }
    }

    pub fn item_status_to_phase(status: CodexItemStatus) -> ActionPhase {
        match status {
            CodexItemStatus::InProgress => ActionPhase::Running,
            CodexItemStatus::Completed => ActionPhase::Completed,
            CodexItemStatus::Failed => ActionPhase::Failed,
            CodexItemStatus::Declined => ActionPhase::Declined,
            CodexItemStatus::Interrupted => ActionPhase::Cancelled,
        }
    }

    pub fn server_request_kind(request: CodexServerRequestKind) -> ElicitationKind {
        match request {
            CodexServerRequestKind::CommandApproval
            | CodexServerRequestKind::FileChangeApproval => ElicitationKind::Approval,
            CodexServerRequestKind::PermissionsApproval => ElicitationKind::PermissionProfile,
            CodexServerRequestKind::ToolUserInput => ElicitationKind::UserInput,
            CodexServerRequestKind::McpForm => ElicitationKind::UserInput,
            CodexServerRequestKind::McpUrl => ElicitationKind::ExternalFlow,
            CodexServerRequestKind::DynamicToolCall => ElicitationKind::DynamicToolCall,
        }
    }

    pub fn model_catalog_from_debug_models(
        &self,
        result: &Value,
        current_model_id: Option<&str>,
    ) -> Option<SessionModelState> {
        let mut available_models = result
            .get("models")
            .and_then(Value::as_array)?
            .iter()
            .filter(|model| model.get("visibility").and_then(Value::as_str) == Some("list"))
            .filter_map(|model| {
                let id = model.get("slug").and_then(Value::as_str)?;
                Some(SessionModel {
                    id: id.to_string(),
                    name: model
                        .get("display_name")
                        .and_then(Value::as_str)
                        .unwrap_or(id)
                        .to_string(),
                    description: model
                        .get("description")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                })
            })
            .collect::<Vec<_>>();
        if available_models.is_empty() {
            return None;
        }

        let current_model_id = current_model_id
            .map(str::to_string)
            .unwrap_or_else(|| available_models[0].id.clone());
        if !available_models
            .iter()
            .any(|model| model.id == current_model_id)
        {
            available_models.insert(
                0,
                SessionModel {
                    id: current_model_id.clone(),
                    name: current_model_id.clone(),
                    description: None,
                },
            );
        }

        Some(SessionModelState {
            current_model_id,
            available_models,
        })
    }
}

pub fn codex_app_server_capabilities() -> ConversationCapabilities {
    ConversationCapabilities {
        lifecycle: angel_engine::LifecycleCapabilities {
            create: CapabilitySupport::Supported,
            list: CapabilitySupport::Supported,
            load: CapabilitySupport::Supported,
            resume: CapabilitySupport::Supported,
            fork: CapabilitySupport::Supported,
            archive: CapabilitySupport::Supported,
            close: CapabilitySupport::Unknown,
        },
        turn: angel_engine::TurnCapabilities {
            start: CapabilitySupport::Supported,
            steer: CapabilitySupport::Supported,
            cancel: CapabilitySupport::Supported,
            max_active_turns: 1,
            requires_expected_turn_id_for_steer: true,
        },
        action: angel_engine::ActionCapabilities {
            observe: CapabilitySupport::Supported,
            stream_output: CapabilitySupport::Supported,
            decline: CapabilitySupport::Supported,
        },
        elicitation: angel_engine::ElicitationCapabilities {
            approval: CapabilitySupport::Supported,
            user_input: CapabilitySupport::Supported,
            external_flow: CapabilitySupport::Supported,
            dynamic_tool_call: CapabilitySupport::Supported,
        },
        history: angel_engine::HistoryCapabilities {
            hydrate: CapabilitySupport::Supported,
            compact: CapabilitySupport::Supported,
            rollback: CapabilitySupport::Supported,
            inject_items: CapabilitySupport::Supported,
            shell_command: CapabilitySupport::Supported,
        },
        context: angel_engine::ContextCapabilities {
            mode: CapabilitySupport::Supported,
            config: CapabilitySupport::Supported,
            additional_directories: CapabilitySupport::Unsupported,
            turn_overrides: CapabilitySupport::Supported,
        },
        observer: angel_engine::ObserverCapabilities {
            unsubscribe: CapabilitySupport::Supported,
        },
    }
}

impl ProtocolAdapter for CodexAdapter {
    fn protocol_flavor(&self) -> ProtocolFlavor {
        ProtocolFlavor::CodexAppServer
    }

    fn capabilities(&self) -> ConversationCapabilities {
        self.capabilities.clone()
    }

    fn encode_effect(
        &self,
        engine: &AngelEngine,
        effect: &ProtocolEffect,
        options: &TransportOptions,
    ) -> Result<TransportOutput, EngineError> {
        CodexAdapter::encode_effect(self, engine, effect, options)
    }

    fn decode_message(
        &self,
        engine: &AngelEngine,
        message: &JsonRpcMessage,
    ) -> Result<TransportOutput, EngineError> {
        CodexAdapter::decode_message(self, engine, message)
    }

    fn model_catalog_from_runtime_debug(
        &self,
        result: &Value,
        current_model_id: Option<&str>,
    ) -> Option<SessionModelState> {
        self.model_catalog_from_debug_models(result, current_model_id)
    }

    fn interpret_user_input(
        &self,
        engine: &AngelEngine,
        conversation_id: &ConversationId,
        input: &[angel_engine::UserInput],
    ) -> Result<Option<InterpretedUserInput>, EngineError> {
        self.interpret_slash_command(engine, conversation_id, input)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn debug_models_catalog_keeps_visible_models_and_current_selection() {
        let adapter = CodexAdapter::app_server();
        let catalog = adapter
            .model_catalog_from_debug_models(
                &json!({
                    "models": [
                        {
                            "slug": "gpt-5.5",
                            "display_name": "GPT-5.5",
                            "description": "Flagship",
                            "visibility": "list"
                        },
                        {
                            "slug": "hidden-model",
                            "display_name": "Hidden",
                            "visibility": "hidden"
                        },
                        {
                            "slug": "gpt-5.4",
                            "display_name": "GPT-5.4",
                            "visibility": "list"
                        }
                    ]
                }),
                Some("gpt-5.4"),
            )
            .expect("catalog");

        assert_eq!(catalog.current_model_id, "gpt-5.4");
        assert_eq!(
            catalog
                .available_models
                .iter()
                .map(|model| model.id.as_str())
                .collect::<Vec<_>>(),
            vec!["gpt-5.5", "gpt-5.4"]
        );
        assert_eq!(catalog.available_models[0].name, "GPT-5.5");
    }

    #[test]
    fn debug_models_catalog_inserts_current_model_when_runtime_omits_it() {
        let adapter = CodexAdapter::app_server();
        let catalog = adapter
            .model_catalog_from_debug_models(
                &json!({
                    "models": [
                        {
                            "slug": "gpt-5.5",
                            "display_name": "GPT-5.5",
                            "visibility": "list"
                        }
                    ]
                }),
                Some("custom-model"),
            )
            .expect("catalog");

        assert_eq!(catalog.current_model_id, "custom-model");
        assert_eq!(catalog.available_models[0].id, "custom-model");
        assert_eq!(catalog.available_models[1].id, "gpt-5.5");
    }
}
