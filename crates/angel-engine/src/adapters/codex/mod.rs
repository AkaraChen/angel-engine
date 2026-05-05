use crate::capabilities::ConversationCapabilities;
use crate::error::ErrorInfo;
use crate::event::EngineEvent;
use crate::ids::{
    ActionId, ConversationId, ElicitationId, JsonRpcRequestId, RemoteActionId,
    RemoteConversationId, RemoteRequestId, RemoteTurnId, TurnId,
};
use crate::protocol::{CodexMethod, ProtocolMethod};
use crate::reducer::{AngelEngine, PendingRequest};
use crate::state::{
    ActionInput, ActionKind, ActionOutputDelta, ActionPatch, ActionPhase, ActionState,
    ContentDelta, ContextPatch, ConversationLifecycle, ElicitationKind, ElicitationOptions,
    ElicitationState, ExhaustionReason, HistoryReplayEntry, HistoryRole, PlanEntry,
    PlanEntryStatus, PlanState, SessionModel, SessionModelState, TurnOutcome, UserQuestion,
    UserQuestionOption,
};
use crate::transport::{
    JsonRpcMessage, ProtocolTransport, TransportLogKind, TransportOptions, TransportOutput,
    client_info_json, method_name,
};
use serde_json::{Value, json};

mod actions;
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
            capabilities: ConversationCapabilities::codex_app_server(),
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
