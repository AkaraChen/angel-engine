use angel_engine::event::EngineEvent;
use angel_engine::ids::ConversationId;
use angel_engine::state::{SessionPermissionMode, SessionPermissionModeState};
use angel_engine::transport::{JsonRpcMessage, TransportOptions, TransportOutput};
use angel_engine::{
    AngelEngine, ConversationCapabilities, EngineError, ProtocolEffect, ProtocolFlavor,
    SessionModelState, UserInput,
};
use serde_json::Value;

use crate::acp::{AcpAdapter, AcpAdapterCapabilities};
use crate::{InterpretedUserInput, ProtocolAdapter};

#[derive(Clone, Debug)]
pub struct CursorAdapter {
    acp: AcpAdapter,
    startup_permission_mode: CursorPermissionMode,
}

impl CursorAdapter {
    pub fn with_args(capabilities: AcpAdapterCapabilities, args: &[String]) -> Self {
        Self {
            acp: AcpAdapter::new(capabilities),
            startup_permission_mode: cursor_startup_permission_mode(args),
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

    fn normalize_cursor_output(&self, mut output: TransportOutput) -> TransportOutput {
        let permission_mode_updates = output
            .events
            .iter()
            .filter_map(|event| {
                let EngineEvent::ConversationReady { id, .. } = event else {
                    return None;
                };
                Some(EngineEvent::SessionPermissionModesUpdated {
                    conversation_id: id.clone(),
                    modes: cursor_permission_mode_state(self.startup_permission_mode),
                })
            })
            .collect::<Vec<_>>();
        output.events.extend(permission_mode_updates);
        output
    }
}

impl ProtocolAdapter for CursorAdapter {
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
        Ok(self.normalize_cursor_output(self.acp.decode_message(engine, message)?))
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

fn cursor_permission_mode_state(mode: CursorPermissionMode) -> SessionPermissionModeState {
    SessionPermissionModeState {
        current_mode_id: cursor_permission_mode_wire_id(mode),
        available_modes: vec![SessionPermissionMode {
            id: cursor_permission_mode_wire_id(mode),
            name: cursor_permission_mode_name(mode).to_string(),
            description: Some(
                "Cursor ACP does not expose runtime permission switching.".to_string(),
            ),
        }],
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
enum CursorPermissionMode {
    #[serde(rename = "default")]
    Default,
    #[serde(rename = "yolo")]
    Yolo,
}

fn cursor_startup_permission_mode(args: &[String]) -> CursorPermissionMode {
    if args
        .iter()
        .any(|arg| matches!(arg.as_str(), "--force" | "--yolo"))
    {
        CursorPermissionMode::Yolo
    } else {
        CursorPermissionMode::Default
    }
}

fn cursor_permission_mode_name(mode: CursorPermissionMode) -> &'static str {
    match mode {
        CursorPermissionMode::Default => "Default",
        CursorPermissionMode::Yolo => "YOLO",
    }
}

fn cursor_permission_mode_wire_id(mode: CursorPermissionMode) -> String {
    let value = serde_json::to_value(mode).expect("CursorPermissionMode serializes to a string");
    let Value::String(id) = value else {
        unreachable!("CursorPermissionMode serialized to non-string JSON");
    };
    id
}

#[cfg(test)]
mod tests {
    use super::*;
    use angel_engine::{
        ConversationLifecycle, ConversationState, PendingRequest, ProvisionOp,
        RemoteConversationId, apply_transport_output,
    };
    use serde_json::json;

    #[test]
    fn cursor_yolo_startup_flag_projects_single_permission_mode() {
        let adapter = CursorAdapter::standard_with_args(&["--yolo".to_string(), "acp".to_string()]);
        let mut engine = AngelEngine::with_available_runtime(
            ProtocolFlavor::Acp,
            angel_engine::RuntimeCapabilities::new("Cursor Agent"),
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
                            "currentModeId": "agent",
                            "availableModes": [{"id": "agent", "name": "Agent"}]
                        }
                    }),
                ),
            )
            .expect("decode session");
        apply_transport_output(&mut engine, &output).expect("apply output");

        let permission_modes = engine
            .permission_modes(conversation_id)
            .expect("permission modes");
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
}
