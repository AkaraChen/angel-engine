use angel_engine::event::EngineEvent;
use angel_engine::ids::ConversationId;
use angel_engine::protocol::ProtocolMethod;
use angel_engine::state::{AvailableCommand, SessionPermissionMode, SessionPermissionModeState};
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
pub struct CopilotAdapter {
    acp: AcpAdapter,
    startup_permission_mode: CopilotPermissionMode,
}

impl CopilotAdapter {
    pub fn new(capabilities: AcpAdapterCapabilities) -> Self {
        Self::with_startup_permission_mode(capabilities, CopilotPermissionMode::Default)
    }

    pub fn with_args(capabilities: AcpAdapterCapabilities, args: &[String]) -> Self {
        Self::with_startup_permission_mode(capabilities, copilot_startup_permission_mode(args))
    }

    fn with_startup_permission_mode(
        capabilities: AcpAdapterCapabilities,
        startup_permission_mode: CopilotPermissionMode,
    ) -> Self {
        Self {
            acp: AcpAdapter::new(capabilities),
            startup_permission_mode,
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

    pub fn capabilities(&self) -> ConversationCapabilities {
        self.acp.capabilities()
    }

    fn normalize_copilot_output(
        &self,
        engine: &AngelEngine,
        mut output: TransportOutput,
    ) -> TransportOutput {
        let mut allow_all_command_conversations = Vec::new();
        let mut filtered_allow_all_command = false;
        output.events = output
            .events
            .into_iter()
            .map(|event| match event {
                EngineEvent::AvailableCommandsUpdated {
                    conversation_id,
                    commands,
                } => {
                    let (commands, had_allow_all_command) =
                        copilot_filter_allow_all_command(commands);
                    if had_allow_all_command {
                        allow_all_command_conversations.push(conversation_id.clone());
                        filtered_allow_all_command = true;
                    }
                    EngineEvent::AvailableCommandsUpdated {
                        conversation_id,
                        commands,
                    }
                }
                event => event,
            })
            .collect();

        let permission_mode_updates = output
            .events
            .iter()
            .filter_map(|event| {
                let EngineEvent::AvailableCommandsUpdated {
                    conversation_id, ..
                } = event
                else {
                    return None;
                };
                if allow_all_command_conversations
                    .iter()
                    .any(|id| id == conversation_id)
                    && needs_copilot_permission_modes(engine, &output.events, conversation_id)
                {
                    Some(EngineEvent::SessionPermissionModesUpdated {
                        conversation_id: conversation_id.clone(),
                        modes: copilot_permission_mode_state(
                            engine,
                            conversation_id,
                            self.startup_permission_mode,
                        ),
                    })
                } else {
                    None
                }
            })
            .collect::<Vec<_>>();
        if !permission_mode_updates.is_empty() {
            output.events.extend(permission_mode_updates);
            output.logs.push(angel_engine::TransportLog::new(
                TransportLogKind::State,
                "Copilot /allow-all command exposed as permission modes",
            ));
        }
        if filtered_allow_all_command {
            output.logs.push(angel_engine::TransportLog::new(
                TransportLogKind::Warning,
                "Copilot /allow-all command hidden because it is exposed as permission mode",
            ));
        }
        output
    }

    fn encode_copilot_permission_mode_effect(
        &self,
        engine: &AngelEngine,
        effect: &ProtocolEffect,
    ) -> Result<Option<TransportOutput>, EngineError> {
        let Some(mode) = copilot_permission_mode_effect(effect)? else {
            return Ok(None);
        };
        if !conversation_has_allow_all_permission_mode(engine, effect) {
            return Ok(None);
        }

        let command = match mode {
            CopilotPermissionMode::Default => "/allow-all off",
            CopilotPermissionMode::AllowAll => "/allow-all on",
        };
        let session_id = copilot_session_id(engine, effect)?;
        let method = "session/prompt";
        let params = json!({
            "sessionId": session_id,
            "prompt": [{"type": "text", "text": command}],
        });
        let mut output = TransportOutput::default().log(
            TransportLogKind::Send,
            format!(
                "Copilot permission mode set via /allow-all: {}",
                copilot_permission_mode_wire_id(mode)
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

impl ProtocolAdapter for CopilotAdapter {
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
            && let Some(output) = self.encode_copilot_permission_mode_effect(engine, effect)?
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
        Ok(self.normalize_copilot_output(engine, self.acp.decode_message(engine, message)?))
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

fn is_allow_all_command(command: &AvailableCommand) -> bool {
    command.name == "allow-all"
}

fn copilot_filter_allow_all_command(
    commands: Vec<AvailableCommand>,
) -> (Vec<AvailableCommand>, bool) {
    let mut had_allow_all_command = false;
    let commands = commands
        .into_iter()
        .filter(|command| {
            if is_allow_all_command(command) {
                had_allow_all_command = true;
                false
            } else {
                true
            }
        })
        .collect();
    (commands, had_allow_all_command)
}

fn needs_copilot_permission_modes(
    engine: &AngelEngine,
    pending_events: &[EngineEvent],
    conversation_id: &ConversationId,
) -> bool {
    if pending_events.iter().any(|event| {
        matches!(
            event,
            EngineEvent::SessionPermissionModesUpdated {
                conversation_id: id,
                ..
            } if id == conversation_id
        )
    }) {
        return false;
    }

    let Some(conversation) = engine.conversations.get(conversation_id) else {
        return false;
    };
    let allow_all_mode_id = copilot_permission_mode_wire_id(CopilotPermissionMode::AllowAll);
    match &conversation.permission_mode_state {
        Some(modes) => !modes
            .available_modes
            .iter()
            .any(|mode| mode.id == allow_all_mode_id.as_str()),
        None => true,
    }
}

fn copilot_permission_mode_state(
    engine: &AngelEngine,
    conversation_id: &ConversationId,
    startup_permission_mode: CopilotPermissionMode,
) -> SessionPermissionModeState {
    let current_mode_id = engine
        .conversations
        .get(conversation_id)
        .and_then(|conversation| {
            conversation
                .context
                .permission_mode
                .effective()
                .and_then(Option::as_ref)
                .map(|mode| mode.id.clone())
                .or_else(|| {
                    conversation
                        .permission_mode_state
                        .as_ref()
                        .map(|modes| modes.current_mode_id.clone())
                })
        })
        .unwrap_or_else(|| copilot_permission_mode_wire_id(startup_permission_mode));

    SessionPermissionModeState {
        current_mode_id,
        available_modes: vec![
            SessionPermissionMode {
                id: copilot_permission_mode_wire_id(CopilotPermissionMode::Default),
                name: "Default".to_string(),
                description: Some("Ask for permissions according to Copilot policy.".to_string()),
            },
            SessionPermissionMode {
                id: copilot_permission_mode_wire_id(CopilotPermissionMode::AllowAll),
                name: "Allow All".to_string(),
                description: Some("Enable all Copilot permissions via /allow-all.".to_string()),
            },
        ],
    }
}

fn conversation_has_allow_all_permission_mode(
    engine: &AngelEngine,
    effect: &ProtocolEffect,
) -> bool {
    effect
        .conversation_id
        .as_ref()
        .and_then(|conversation_id| engine.conversations.get(conversation_id))
        .and_then(|conversation| conversation.permission_mode_state.as_ref())
        .is_some_and(|modes| {
            let allow_all_mode_id =
                copilot_permission_mode_wire_id(CopilotPermissionMode::AllowAll);
            modes
                .available_modes
                .iter()
                .any(|mode| mode.id == allow_all_mode_id.as_str())
        })
}

fn copilot_permission_mode_effect(
    effect: &ProtocolEffect,
) -> Result<Option<CopilotPermissionMode>, EngineError> {
    let fields = &effect.payload.fields;
    if fields.get("contextUpdate").map(String::as_str) != Some("permissionMode") {
        return Ok(None);
    }
    fields
        .get("permissionMode")
        .map(|mode| decode_copilot_permission_mode(mode))
        .transpose()
}

fn copilot_session_id(
    engine: &AngelEngine,
    effect: &ProtocolEffect,
) -> Result<String, EngineError> {
    let conversation_id =
        effect
            .conversation_id
            .as_ref()
            .ok_or_else(|| EngineError::InvalidCommand {
                message: "missing conversation id for Copilot permission mode update".to_string(),
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
            expected: "Copilot ACP session id".to_string(),
            actual: format!("{:?}", conversation.remote),
        })
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
enum CopilotPermissionMode {
    #[serde(rename = "default")]
    Default,
    #[serde(rename = "allowAll")]
    AllowAll,
}

fn copilot_startup_permission_mode(args: &[String]) -> CopilotPermissionMode {
    if args.iter().any(|arg| arg == "--allow-all") {
        CopilotPermissionMode::AllowAll
    } else {
        CopilotPermissionMode::Default
    }
}

fn decode_copilot_permission_mode(value: &str) -> Result<CopilotPermissionMode, EngineError> {
    serde_json::from_value(Value::String(value.to_string())).map_err(|error| {
        EngineError::InvalidState {
            expected: "canonical Copilot permission mode id".to_string(),
            actual: format!("{value:?}: {error}"),
        }
    })
}

fn copilot_permission_mode_wire_id(mode: CopilotPermissionMode) -> String {
    let value = serde_json::to_value(mode).expect("CopilotPermissionMode serializes to a string");
    let Value::String(id) = value else {
        unreachable!("CopilotPermissionMode serialized to non-string JSON");
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

    fn ready_engine(adapter: &CopilotAdapter) -> (AngelEngine, ConversationId) {
        let mut engine = AngelEngine::with_available_runtime(
            ProtocolFlavor::Acp,
            angel_engine::RuntimeCapabilities::new("GitHub Copilot CLI"),
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
        (engine, conversation_id)
    }

    #[test]
    fn allow_all_command_exposes_copilot_permission_modes() {
        let adapter = CopilotAdapter::standard_with_args(&[]);
        let (mut engine, conversation_id) = ready_engine(&adapter);

        let output = adapter
            .decode_message(
                &engine,
                &JsonRpcMessage::notification(
                    "session/update",
                    json!({
                        "sessionId": "sess",
                        "update": {
                            "sessionUpdate": "available_commands_update",
                            "availableCommands": [
                                {
                                    "name": "allow-all",
                                    "description": "Enable all permissions",
                                    "inputHint": "[on|off|show]"
                                },
                                {
                                    "name": "compact",
                                    "description": "Compact context"
                                }
                            ]
                        }
                    }),
                ),
            )
            .expect("available commands");
        apply_transport_output(&mut engine, &output).expect("apply output");

        let commands = &engine.conversations[&conversation_id].available_commands;
        assert_eq!(
            commands
                .iter()
                .map(|command| command.name.as_str())
                .collect::<Vec<_>>(),
            vec!["compact"]
        );
        let permission_modes = engine
            .permission_modes(conversation_id)
            .expect("permission modes");
        assert_eq!(
            permission_modes
                .available_modes
                .iter()
                .map(|mode| mode.id.as_str())
                .collect::<Vec<_>>(),
            vec!["default", "allowAll"]
        );
    }

    #[test]
    fn set_allow_all_permission_mode_encodes_copilot_command_prompt() {
        let adapter = CopilotAdapter::standard_with_args(&[]);
        let (mut engine, conversation_id) = ready_engine(&adapter);
        engine
            .apply_event(EngineEvent::SessionPermissionModesUpdated {
                conversation_id: conversation_id.clone(),
                modes: copilot_permission_mode_state(
                    &engine,
                    &conversation_id,
                    CopilotPermissionMode::Default,
                ),
            })
            .expect("permission modes");
        let plan = engine
            .plan_command(EngineCommand::UpdateContext {
                conversation_id,
                patch: ContextPatch::one(ContextUpdate::PermissionMode {
                    scope: ContextScope::TurnAndFuture,
                    mode: Some(PermissionMode {
                        id: "allowAll".to_string(),
                    }),
                }),
            })
            .expect("permission mode");

        let output = adapter
            .encode_effect(&engine, &plan.effects[0], &TransportOptions::default())
            .expect("encode permission mode");
        assert!(matches!(
            output.messages.first(),
            Some(JsonRpcMessage::Request { method, params, .. })
                if method == "session/prompt"
                    && params["sessionId"] == json!("sess")
                    && params["prompt"] == json!([{"type": "text", "text": "/allow-all on"}])
        ));
    }
}
