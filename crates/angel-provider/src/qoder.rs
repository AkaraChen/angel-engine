use angel_engine::event::EngineEvent;
use angel_engine::ids::ConversationId;
use angel_engine::protocol::ProtocolMethod;
use angel_engine::state::{
    SessionConfigOption, SessionMode, SessionModeState, SessionPermissionMode,
    SessionPermissionModeState,
};
use angel_engine::transport::{
    JsonRpcMessage, TransportLogKind, TransportOptions, TransportOutput,
};
use angel_engine::{
    AngelEngine, ConversationCapabilities, EngineError, ProtocolEffect, ProtocolFlavor,
    SessionModelState, UserInput,
};
use serde_json::{Value, json};

use crate::acp::{AcpAdapter, AcpAdapterCapabilities};
use crate::{InterpretedUserInput, ProtocolAdapter};

#[derive(Clone, Debug)]
pub struct QoderAdapter {
    acp: AcpAdapter,
}

impl QoderAdapter {
    pub fn new(capabilities: AcpAdapterCapabilities) -> Self {
        Self {
            acp: AcpAdapter::new(capabilities),
        }
    }

    pub fn without_authentication() -> Self {
        Self::new(AcpAdapterCapabilities::standard().without_authentication())
    }

    pub fn capabilities(&self) -> ConversationCapabilities {
        self.acp.capabilities()
    }

    fn normalize_qoder_output(
        &self,
        mut output: TransportOutput,
    ) -> Result<TransportOutput, EngineError> {
        let mut events = Vec::with_capacity(output.events.len());
        for event in output.events {
            if let Some(event) = qoder_event(event)? {
                events.push(event);
            }
        }
        output.events = events;
        Ok(output)
    }

    fn encode_qoder_permission_mode_effect(
        &self,
        engine: &AngelEngine,
        effect: &ProtocolEffect,
    ) -> Result<Option<TransportOutput>, EngineError> {
        let Some(mode) = qoder_permission_mode_effect(effect)? else {
            return Ok(None);
        };
        let session_id = qoder_session_id(engine, effect)?;
        let method = "session/set_mode";
        let params = json!({
            "sessionId": session_id,
            "modeId": mode,
        });
        let mut output = TransportOutput::default().log(
            TransportLogKind::Send,
            format!(
                "Qoder permission mode set via ACP mode: {}",
                qoder_permission_mode_wire_id(mode),
            ),
        );
        if let Some(request_id) = &effect.request_id {
            output.messages.push(JsonRpcMessage::request(
                request_id.clone(),
                method.to_string(),
                params,
            ));
        } else {
            output
                .messages
                .push(JsonRpcMessage::notification(method.to_string(), params));
        }
        Ok(Some(output))
    }
}

impl ProtocolAdapter for QoderAdapter {
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
            && let Some(output) = self.encode_qoder_permission_mode_effect(engine, effect)?
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
        self.normalize_qoder_output(self.acp.decode_message(engine, message)?)
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

fn qoder_event(event: EngineEvent) -> Result<Option<EngineEvent>, EngineError> {
    match event {
        EngineEvent::SessionModesUpdated {
            conversation_id,
            modes,
        } if qoder_mode_state_is_permission_modes(&modes)? => {
            Ok(Some(EngineEvent::SessionPermissionModesUpdated {
                conversation_id,
                modes: qoder_permission_mode_state(modes)?,
            }))
        }
        EngineEvent::SessionModeChanged {
            conversation_id,
            mode_id,
        } => {
            let mode = decode_qoder_permission_mode(&mode_id)?;
            Ok(Some(EngineEvent::SessionPermissionModeChanged {
                conversation_id,
                mode_id: qoder_permission_mode_wire_id(mode),
            }))
        }
        EngineEvent::SessionConfigOptionsUpdated {
            conversation_id,
            options,
        } => Ok(Some(EngineEvent::SessionConfigOptionsUpdated {
            conversation_id,
            options: qoder_config_options(options)?,
        })),
        event => Ok(Some(event)),
    }
}

fn qoder_mode_state_is_permission_modes(modes: &SessionModeState) -> Result<bool, EngineError> {
    if modes.available_modes.is_empty() {
        return Ok(false);
    }
    for mode in &modes.available_modes {
        decode_qoder_permission_mode(&mode.id)?;
    }
    Ok(true)
}

fn qoder_permission_mode_state(
    modes: SessionModeState,
) -> Result<SessionPermissionModeState, EngineError> {
    let current_mode_id =
        qoder_permission_mode_wire_id(decode_qoder_permission_mode(&modes.current_mode_id)?);
    let available_modes = modes
        .available_modes
        .into_iter()
        .map(qoder_permission_mode)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(SessionPermissionModeState {
        current_mode_id,
        available_modes,
    })
}

fn qoder_permission_mode(mode: SessionMode) -> Result<SessionPermissionMode, EngineError> {
    let permission_mode = decode_qoder_permission_mode(&mode.id)?;
    Ok(SessionPermissionMode {
        id: qoder_permission_mode_wire_id(permission_mode),
        name: mode.name,
        description: mode.description,
    })
}

fn qoder_config_options(
    options: Vec<SessionConfigOption>,
) -> Result<Vec<SessionConfigOption>, EngineError> {
    options
        .into_iter()
        .map(|mut option| {
            if option.category.as_deref() == Some("mode") {
                option.category = Some("permissionMode".to_string());
                option.current_value = qoder_permission_mode_wire_id(decode_qoder_permission_mode(
                    &option.current_value,
                )?);
                for value in &mut option.values {
                    value.value =
                        qoder_permission_mode_wire_id(decode_qoder_permission_mode(&value.value)?);
                }
            }
            Ok(option)
        })
        .collect()
}

fn qoder_permission_mode_effect(
    effect: &ProtocolEffect,
) -> Result<Option<QoderPermissionMode>, EngineError> {
    let fields = &effect.payload.fields;
    if fields.get("contextUpdate").map(String::as_str) != Some("permissionMode") {
        return Ok(None);
    }
    fields
        .get("permissionMode")
        .map(|mode| decode_qoder_permission_mode(mode))
        .transpose()
}

fn qoder_session_id(engine: &AngelEngine, effect: &ProtocolEffect) -> Result<String, EngineError> {
    let conversation_id =
        effect
            .conversation_id
            .as_ref()
            .ok_or_else(|| EngineError::InvalidCommand {
                message: "missing conversation id for Qoder permission mode update".to_string(),
            })?;
    let conversation = engine.conversations.get(conversation_id).ok_or_else(|| {
        EngineError::ConversationNotFound {
            conversation_id: conversation_id.to_string(),
        }
    })?;
    conversation
        .remote
        .as_protocol_id()
        .map(str::to_string)
        .ok_or_else(|| EngineError::InvalidState {
            expected: "Qoder ACP session id".to_string(),
            actual: format!("{:?}", conversation.remote),
        })
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
enum QoderPermissionMode {
    #[serde(rename = "default")]
    Default,
    #[serde(rename = "acceptEdits")]
    AcceptEdits,
    #[serde(rename = "bypassPermissions")]
    BypassPermissions,
    #[serde(rename = "dontAsk")]
    DontAsk,
    #[serde(rename = "plan")]
    Plan,
}

fn decode_qoder_permission_mode(value: &str) -> Result<QoderPermissionMode, EngineError> {
    serde_json::from_value(Value::String(value.to_string())).map_err(|error| {
        EngineError::InvalidState {
            expected: "canonical Qoder permission mode id".to_string(),
            actual: format!("{value:?}: {error}"),
        }
    })
}

fn qoder_permission_mode_wire_id(mode: QoderPermissionMode) -> String {
    let value = serde_json::to_value(mode).expect("QoderPermissionMode serializes to a string");
    let Value::String(id) = value else {
        unreachable!("QoderPermissionMode serialized to non-string JSON");
    };
    id
}

#[cfg(test)]
mod tests {
    use super::*;
    use angel_engine::{
        ContextPatch, ContextScope, ContextUpdate, ConversationLifecycle, ConversationState,
        EngineCommand, PermissionMode, RemoteConversationId, apply_transport_output,
    };

    fn ready_engine(adapter: &QoderAdapter) -> (AngelEngine, ConversationId) {
        let mut engine = AngelEngine::with_available_runtime(
            ProtocolFlavor::Acp,
            angel_engine::RuntimeCapabilities::new("Qoder CLI"),
            adapter.capabilities(),
        );
        let conversation_id = ConversationId::new("conv");
        engine.conversations.insert(
            conversation_id.clone(),
            ConversationState::new(
                conversation_id.clone(),
                RemoteConversationId::Known("sess".to_string()),
                ConversationLifecycle::Idle,
                adapter.capabilities(),
            ),
        );
        engine.selected = Some(conversation_id.clone());
        (engine, conversation_id)
    }

    #[test]
    fn qoder_acp_modes_project_as_permission_modes() {
        let adapter = QoderAdapter::without_authentication();
        let (mut engine, conversation_id) = ready_engine(&adapter);
        engine.pending.requests.insert(
            angel_engine::JsonRpcRequestId::new("new"),
            angel_engine::PendingRequest::StartConversation {
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
                            "currentModeId": "default",
                            "availableModes": [
                                {"id": "default", "name": "Default"},
                                {"id": "acceptEdits", "name": "Accept Edits"},
                                {"id": "bypassPermissions", "name": "Bypass Permissions"},
                                {"id": "plan", "name": "Plan"}
                            ]
                        }
                    }),
                ),
            )
            .expect("decode session");
        apply_transport_output(&mut engine, &output).expect("apply output");

        let modes = engine
            .available_modes(conversation_id.clone())
            .expect("modes");
        assert!(!modes.can_set);
        assert!(modes.available_modes.is_empty());
        let permissions = engine
            .permission_modes(conversation_id)
            .expect("permission modes");
        assert!(permissions.can_set);
        assert_eq!(
            permissions
                .available_modes
                .iter()
                .map(|mode| mode.id.as_str())
                .collect::<Vec<_>>(),
            vec!["default", "acceptEdits", "bypassPermissions", "plan"]
        );
    }

    #[test]
    fn qoder_rejects_noncanonical_permission_mode_casing() {
        let adapter = QoderAdapter::without_authentication();
        let (mut engine, conversation_id) = ready_engine(&adapter);
        engine.pending.requests.insert(
            angel_engine::JsonRpcRequestId::new("new"),
            angel_engine::PendingRequest::StartConversation {
                conversation_id: conversation_id.clone(),
            },
        );

        let error = adapter
            .decode_message(
                &engine,
                &JsonRpcMessage::response(
                    angel_engine::JsonRpcRequestId::new("new"),
                    json!({
                        "sessionId": "sess",
                        "modes": {
                            "currentModeId": "default",
                            "availableModes": [
                                {"id": "default", "name": "Default"},
                                {"id": "accept_edits", "name": "Accept Edits"}
                            ]
                        }
                    }),
                ),
            )
            .expect_err("noncanonical casing must fail");

        assert!(matches!(
            error,
            EngineError::InvalidState { expected, .. }
                if expected == "canonical Qoder permission mode id"
        ));
    }

    #[test]
    fn qoder_permission_mode_encodes_as_acp_mode_update() {
        let adapter = QoderAdapter::without_authentication();
        let (mut engine, conversation_id) = ready_engine(&adapter);
        engine
            .apply_event(EngineEvent::SessionPermissionModesUpdated {
                conversation_id: conversation_id.clone(),
                modes: SessionPermissionModeState {
                    current_mode_id: "default".to_string(),
                    available_modes: vec![SessionPermissionMode {
                        id: "bypassPermissions".to_string(),
                        name: "Bypass Permissions".to_string(),
                        description: None,
                    }],
                },
            })
            .expect("seed permission modes");
        let plan = engine
            .plan_command(EngineCommand::UpdateContext {
                conversation_id,
                patch: ContextPatch::one(ContextUpdate::PermissionMode {
                    scope: ContextScope::TurnAndFuture,
                    mode: Some(PermissionMode {
                        id: "bypassPermissions".to_string(),
                    }),
                }),
            })
            .expect("set permission mode");

        let output = adapter
            .encode_effect(&engine, &plan.effects[0], &TransportOptions::default())
            .expect("encode permission mode");
        assert!(matches!(
            output.messages.first(),
            Some(JsonRpcMessage::Request { method, params, .. })
                if method == "session/set_mode"
                    && params["sessionId"] == json!("sess")
                    && params["modeId"] == json!("bypassPermissions")
        ));
    }
}
