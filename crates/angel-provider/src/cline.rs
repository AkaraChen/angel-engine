use angel_engine::event::EngineEvent;
use angel_engine::ids::ConversationId;
use angel_engine::state::{SessionPermissionMode, SessionPermissionModeState};
use angel_engine::transport::{JsonRpcMessage, TransportOptions, TransportOutput};
use angel_engine::{
    AngelEngine, ConversationCapabilities, EngineError, ProtocolEffect, ProtocolFlavor,
    SessionModelState, UserInput,
};
use serde_json::Value;

use crate::acp::permission_modes::permission_mode_wire_id;
use crate::acp::{AcpAdapter, AcpAdapterCapabilities};
use crate::{InterpretedUserInput, ProtocolAdapter};

#[derive(Clone, Debug)]
pub struct ClineAdapter {
    acp: AcpAdapter,
    startup_permission_mode: ClinePermissionMode,
}

impl ClineAdapter {
    pub fn with_args(capabilities: AcpAdapterCapabilities, args: &[String]) -> Self {
        Self {
            acp: AcpAdapter::new(capabilities),
            startup_permission_mode: cline_startup_permission_mode(args),
        }
    }

    pub fn standard_with_args(args: &[String]) -> Self {
        Self::with_args(AcpAdapterCapabilities::standard(), args)
    }

    pub fn without_authentication_with_args(args: &[String]) -> Self {
        Self::with_args(
            AcpAdapterCapabilities::standard().without_authentication(),
            args,
        )
    }

    fn normalize_cline_output(&self, mut output: TransportOutput) -> TransportOutput {
        let permission_mode_updates = output
            .events
            .iter()
            .filter_map(|event| {
                let EngineEvent::ConversationReady { id, .. } = event else {
                    return None;
                };
                Some(EngineEvent::SessionPermissionModesUpdated {
                    conversation_id: id.clone(),
                    modes: cline_permission_mode_state(self.startup_permission_mode),
                })
            })
            .collect::<Vec<_>>();
        output.events.extend(permission_mode_updates);
        output
    }
}

impl ProtocolAdapter for ClineAdapter {
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
        self.acp.encode_effect(engine, effect, options)
    }

    fn decode_message(
        &self,
        engine: &AngelEngine,
        message: &JsonRpcMessage,
    ) -> Result<TransportOutput, EngineError> {
        Ok(self.normalize_cline_output(self.acp.decode_message(engine, message)?))
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

fn cline_permission_mode_state(mode: ClinePermissionMode) -> SessionPermissionModeState {
    SessionPermissionModeState {
        current_mode_id: permission_mode_wire_id(mode),
        available_modes: vec![SessionPermissionMode {
            id: permission_mode_wire_id(mode),
            name: cline_permission_mode_name(mode).to_string(),
            description: Some(
                "Cline ACP does not expose runtime permission switching.".to_string(),
            ),
        }],
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
enum ClinePermissionMode {
    #[serde(rename = "default")]
    Default,
    #[serde(rename = "yolo")]
    Yolo,
}

fn cline_startup_permission_mode(args: &[String]) -> ClinePermissionMode {
    if args
        .iter()
        .any(|arg| matches!(arg.as_str(), "--yolo" | "-y"))
    {
        ClinePermissionMode::Yolo
    } else {
        ClinePermissionMode::Default
    }
}

fn cline_permission_mode_name(mode: ClinePermissionMode) -> &'static str {
    match mode {
        ClinePermissionMode::Default => "Default",
        ClinePermissionMode::Yolo => "YOLO",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use angel_engine::{
        ConversationLifecycle, ConversationState, PendingRequest, ProvisionOp,
        RemoteConversationId, apply_transport_output,
    };
    use serde_json::json;

    fn permission_modes_for_args(
        args: &[&str],
    ) -> angel_engine::settings::AvailablePermissionModeState {
        let args = args
            .iter()
            .map(|arg| (*arg).to_string())
            .collect::<Vec<_>>();
        let adapter = ClineAdapter::standard_with_args(&args);
        let mut engine = AngelEngine::with_available_runtime(
            ProtocolFlavor::Acp,
            angel_engine::RuntimeCapabilities::new("Cline CLI"),
            adapter.capabilities(),
        );
        let conversation_id = ConversationId::new("conv");
        engine.conversations.insert(
            conversation_id.clone(),
            ConversationState::new(
                conversation_id.clone(),
                RemoteConversationId::Pending("new".to_string()),
                ConversationLifecycle::Provisioning {
                    op: ProvisionOp::New,
                },
                adapter.capabilities(),
            ),
        );
        engine.pending.requests.insert(
            angel_engine::JsonRpcRequestId::new("new"),
            PendingRequest::StartConversation {
                conversation_id: conversation_id.clone(),
            },
        );

        let output = adapter
            .decode_message(
                &engine,
                &JsonRpcMessage::response(
                    angel_engine::JsonRpcRequestId::new("new"),
                    json!({
                        "sessionId": "sess",
                        "modes": {
                            "currentModeId": "plan",
                            "availableModes": [{"id": "plan", "name": "Plan"}]
                        }
                    }),
                ),
            )
            .expect("decode session");
        apply_transport_output(&mut engine, &output).expect("apply output");

        engine
            .permission_modes(conversation_id)
            .expect("permission modes")
    }

    #[test]
    fn cline_yolo_startup_flag_projects_single_permission_mode() {
        let permission_modes = permission_modes_for_args(&["--yolo", "--acp"]);
        assert_eq!(permission_modes.current_mode_id.as_deref(), Some("yolo"));
        assert_eq!(
            permission_modes
                .available_modes
                .iter()
                .map(|mode| mode.id.as_str())
                .collect::<Vec<_>>(),
            vec!["yolo"]
        );
    }

    #[test]
    fn cline_default_startup_projects_single_permission_mode() {
        let permission_modes = permission_modes_for_args(&["--acp"]);
        assert_eq!(permission_modes.current_mode_id.as_deref(), Some("default"));
        assert_eq!(
            permission_modes
                .available_modes
                .iter()
                .map(|mode| (mode.id.as_str(), mode.name.as_str()))
                .collect::<Vec<_>>(),
            vec![("default", "Default")]
        );
    }

    #[test]
    fn cline_yolo_short_flag_projects_single_permission_mode() {
        let permission_modes = permission_modes_for_args(&["-y"]);
        assert_eq!(permission_modes.current_mode_id.as_deref(), Some("yolo"));
        assert_eq!(
            permission_modes
                .available_modes
                .iter()
                .map(|mode| (mode.id.as_str(), mode.name.as_str()))
                .collect::<Vec<_>>(),
            vec![("yolo", "YOLO")]
        );
    }
}
