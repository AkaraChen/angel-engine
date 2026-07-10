use angel_engine::event::EngineEvent;
use angel_engine::ids::{ConversationId, JsonRpcRequestId};
use angel_engine::protocol::ProtocolMethod;
use angel_engine::state::{
    AvailableCommand, SessionConfigOption, SessionMode, SessionModeState, SessionPermissionMode,
    SessionPermissionModeState,
};
use angel_engine::transport::{
    JsonRpcMessage, TransportLogKind, TransportOptions, TransportOutput,
};
use angel_engine::{
    AngelEngine, ContextPatch, ConversationCapabilities, EngineCommand, EngineError,
    PendingRequest, ProtocolEffect, ProtocolFlavor, SessionModelState, UserInput, UserInputKind,
};
use serde_json::{Value, json};

use crate::acp::permission_modes::{
    acp_permission_mode_session_id, decode_permission_mode, permission_mode_effect,
    permission_mode_wire_id,
};
use crate::acp::{AcpAdapter, AcpAdapterCapabilities};
use crate::{InterpretedUserInput, ProtocolAdapter};

#[derive(Clone, Debug)]
pub struct GeminiAdapter {
    acp: AcpAdapter,
}

impl GeminiAdapter {
    pub fn new(capabilities: AcpAdapterCapabilities) -> Self {
        Self {
            acp: AcpAdapter::new(capabilities),
        }
    }

    pub fn standard() -> Self {
        Self::new(AcpAdapterCapabilities::standard())
    }

    pub fn without_authentication() -> Self {
        Self::new(AcpAdapterCapabilities::standard().without_authentication())
    }

    pub fn capabilities(&self) -> ConversationCapabilities {
        self.acp.capabilities()
    }

    fn normalize_gemini_output(
        &self,
        mut output: TransportOutput,
    ) -> Result<TransportOutput, EngineError> {
        let mut filtered_plan_mode = false;
        let mut filtered_plan_command = false;
        let mut events = Vec::with_capacity(output.events.len());
        for event in output.events {
            let event = match event {
                EngineEvent::SessionModesUpdated {
                    conversation_id,
                    modes,
                } => {
                    let (modes, filtered) = gemini_permission_modes(modes)?;
                    filtered_plan_mode |= filtered;
                    Some(EngineEvent::SessionPermissionModesUpdated {
                        conversation_id,
                        modes,
                    })
                }
                EngineEvent::SessionModeChanged {
                    conversation_id,
                    mode_id,
                } => {
                    let mode = decode_permission_mode::<GeminiPermissionMode>(&mode_id, "Gemini")?;
                    if mode == GeminiPermissionMode::Plan {
                        filtered_plan_mode = true;
                        None
                    } else {
                        Some(EngineEvent::SessionPermissionModeChanged {
                            conversation_id,
                            mode_id: permission_mode_wire_id(mode),
                        })
                    }
                }
                EngineEvent::SessionConfigOptionsUpdated {
                    conversation_id,
                    options,
                } => {
                    let (options, filtered) = gemini_config_options(options)?;
                    filtered_plan_mode |= filtered;
                    Some(EngineEvent::SessionConfigOptionsUpdated {
                        conversation_id,
                        options,
                    })
                }
                EngineEvent::AvailableCommandsUpdated {
                    conversation_id,
                    commands,
                } => {
                    let (commands, filtered) = gemini_available_commands(commands);
                    filtered_plan_command |= filtered;
                    Some(EngineEvent::AvailableCommandsUpdated {
                        conversation_id,
                        commands,
                    })
                }
                event => Some(event),
            };
            if let Some(event) = event {
                events.push(event);
            }
        }
        output.events = events;

        if filtered_plan_mode {
            output.logs.push(angel_engine::TransportLog::new(
                TransportLogKind::Warning,
                "Gemini ACP plan mode hidden because this runtime does not complete prompts in plan mode",
            ));
        }
        if filtered_plan_command {
            output.logs.push(angel_engine::TransportLog::new(
                TransportLogKind::Warning,
                "Gemini /plan command hidden because this runtime does not complete prompts in plan mode",
            ));
        }
        Ok(output)
    }

    fn normalize_gemini_response(
        &self,
        engine: &AngelEngine,
        message: &JsonRpcMessage,
        mut output: TransportOutput,
    ) -> TransportOutput {
        let Some((request_id, session_id)) = gemini_plan_prompt_response(engine, message) else {
            return output;
        };

        output.messages.push(JsonRpcMessage::request(
            JsonRpcRequestId::new(format!("gemini-plan-reset-{request_id}")),
            "session/set_mode",
            json!({
                "sessionId": session_id,
                "modeId": "default",
            }),
        ));
        output.logs.push(angel_engine::TransportLog::new(
            TransportLogKind::Send,
            "Gemini /plan turn completed; resetting runtime mode to default",
        ));
        output
    }

    fn encode_gemini_mode_effect(&self, effect: &ProtocolEffect) -> Option<TransportOutput> {
        let mode_id = effect
            .payload
            .fields
            .get("modeId")
            .or_else(|| effect.payload.fields.get("mode"))
            .map(String::as_str)?;
        if !is_gemini_plan_mode(mode_id) {
            return None;
        }

        let mut output = TransportOutput::default().log(
            TransportLogKind::Warning,
            "Gemini ACP plan mode ignored because this runtime does not complete prompts in plan mode",
        );
        if let Some(request_id) = &effect.request_id {
            output.completed_requests.push(request_id.clone());
        }
        Some(output)
    }

    fn encode_gemini_permission_mode_effect(
        &self,
        engine: &AngelEngine,
        effect: &ProtocolEffect,
    ) -> Result<Option<TransportOutput>, EngineError> {
        let Some(mode) = permission_mode_effect::<GeminiPermissionMode>(effect, "Gemini")? else {
            return Ok(None);
        };
        if mode == GeminiPermissionMode::Plan {
            let mut output = TransportOutput::default().log(
                TransportLogKind::Warning,
                "Gemini ACP plan permission mode ignored because this runtime does not complete prompts in plan mode",
            );
            if let Some(request_id) = &effect.request_id {
                output.completed_requests.push(request_id.clone());
            }
            return Ok(Some(output));
        }

        let session_id = acp_permission_mode_session_id(engine, effect, "Gemini")?;
        let method = "session/set_mode";
        let params = json!({
            "sessionId": session_id,
            "modeId": mode,
        });
        let mut output = TransportOutput::default().log(
            TransportLogKind::Send,
            format!(
                "Gemini permission mode set via ACP mode: {}",
                permission_mode_wire_id(mode),
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

impl ProtocolAdapter for GeminiAdapter {
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
            && let Some(output) = self.encode_gemini_permission_mode_effect(engine, effect)?
        {
            return Ok(output);
        }
        if matches!(
            effect.method,
            ProtocolMethod::SetSessionMode | ProtocolMethod::UpdateContext
        ) && let Some(output) = self.encode_gemini_mode_effect(effect)
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
        let output = self.normalize_gemini_output(output)?;
        Ok(self.normalize_gemini_response(engine, message, output))
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
        if is_gemini_plan_user_input(input) {
            return Ok(Some(InterpretedUserInput {
                command: EngineCommand::UpdateContext {
                    conversation_id: conversation_id.clone(),
                    patch: ContextPatch::empty(),
                },
                message: Some(
                    "Gemini /plan is unavailable through ACP because this runtime does not complete prompts in plan mode.".to_string(),
                ),
            }));
        }
        self.acp
            .interpret_user_input(engine, conversation_id, input)
    }
}

fn gemini_permission_modes(
    modes: SessionModeState,
) -> Result<(SessionPermissionModeState, bool), EngineError> {
    let mut filtered = false;
    let mut available_modes = Vec::new();
    for mode in modes.available_modes {
        let permission_mode = decode_permission_mode::<GeminiPermissionMode>(&mode.id, "Gemini")?;
        if permission_mode == GeminiPermissionMode::Plan {
            filtered = true;
            continue;
        }
        available_modes.push(gemini_permission_mode(mode, permission_mode));
    }

    let current_mode =
        decode_permission_mode::<GeminiPermissionMode>(&modes.current_mode_id, "Gemini")?;
    let current_mode_id = if current_mode == GeminiPermissionMode::Plan {
        filtered = true;
        available_modes
            .first()
            .map(|mode| mode.id.clone())
            .unwrap_or_else(|| permission_mode_wire_id(GeminiPermissionMode::Default))
    } else {
        permission_mode_wire_id(current_mode)
    };

    Ok((
        SessionPermissionModeState {
            current_mode_id,
            available_modes,
        },
        filtered,
    ))
}

fn gemini_permission_mode(
    mode: SessionMode,
    permission_mode: GeminiPermissionMode,
) -> SessionPermissionMode {
    SessionPermissionMode {
        id: permission_mode_wire_id(permission_mode),
        name: mode.name,
        description: mode.description,
    }
}

fn gemini_config_options(
    options: Vec<SessionConfigOption>,
) -> Result<(Vec<SessionConfigOption>, bool), EngineError> {
    let mut filtered_any = false;
    let options = options
        .into_iter()
        .map(|mut option| {
            if is_mode_config_option(&option) {
                option.category = Some("permissionMode".to_string());
                let mut values = Vec::with_capacity(option.values.len());
                for mut value in option.values {
                    let mode =
                        decode_permission_mode::<GeminiPermissionMode>(&value.value, "Gemini")?;
                    if mode == GeminiPermissionMode::Plan {
                        filtered_any = true;
                    } else {
                        value.value = permission_mode_wire_id(mode);
                        values.push(value);
                    }
                }
                option.values = values;
                let current_mode = decode_permission_mode::<GeminiPermissionMode>(
                    &option.current_value,
                    "Gemini",
                )?;
                if current_mode == GeminiPermissionMode::Plan {
                    filtered_any = true;
                    option.current_value = option
                        .values
                        .iter()
                        .find(|value| {
                            decode_permission_mode::<GeminiPermissionMode>(&value.value, "Gemini")
                                .is_ok_and(|mode| mode == GeminiPermissionMode::Default)
                        })
                        .or_else(|| option.values.first())
                        .map(|value| value.value.clone())
                        .unwrap_or_else(|| permission_mode_wire_id(GeminiPermissionMode::Default));
                } else {
                    option.current_value = permission_mode_wire_id(current_mode);
                }
            }
            Ok(option)
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok((options, filtered_any))
}

fn gemini_available_commands(mut commands: Vec<AvailableCommand>) -> (Vec<AvailableCommand>, bool) {
    let before = commands.len();
    commands.retain(|command| command.name != "plan");
    let filtered = before != commands.len();
    (commands, filtered)
}

fn is_mode_config_option(option: &SessionConfigOption) -> bool {
    option.category.as_deref() == Some("mode")
}

fn is_gemini_plan_mode(value: &str) -> bool {
    value == "plan"
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
enum GeminiPermissionMode {
    #[serde(rename = "default")]
    Default,
    #[serde(rename = "autoEdit")]
    AutoEdit,
    #[serde(rename = "yolo")]
    Yolo,
    #[serde(rename = "plan")]
    Plan,
}

fn gemini_plan_prompt_response(
    engine: &AngelEngine,
    message: &JsonRpcMessage,
) -> Option<(JsonRpcRequestId, String)> {
    let JsonRpcMessage::Response { id, .. } = message else {
        return None;
    };
    let PendingRequest::StartTurn {
        conversation_id,
        turn_id,
    } = engine.pending.requests.get(id)?
    else {
        return None;
    };
    let conversation = engine.conversations.get(conversation_id)?;
    let turn = conversation.turns.get(turn_id)?;
    if !is_gemini_plan_command(
        &turn
            .input
            .iter()
            .map(|input| input.content.as_str())
            .collect::<Vec<_>>()
            .join(""),
    ) {
        return None;
    }
    let session_id = conversation.remote.as_protocol_id()?.to_string();
    Some((id.clone(), session_id))
}

fn is_gemini_plan_command(value: &str) -> bool {
    let value = value.trim_start();
    value == "/plan"
        || value
            .strip_prefix("/plan")
            .is_some_and(|suffix| suffix.starts_with(char::is_whitespace))
}

fn is_gemini_plan_user_input(input: &[UserInput]) -> bool {
    let [input] = input else {
        return false;
    };
    matches!(input.kind, UserInputKind::Text) && is_gemini_plan_command(&input.content)
}

#[cfg(test)]
mod tests;
