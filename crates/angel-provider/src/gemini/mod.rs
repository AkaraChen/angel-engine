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
                    let mode = decode_gemini_permission_mode(&mode_id)?;
                    if mode == GeminiPermissionMode::Plan {
                        filtered_plan_mode = true;
                        None
                    } else {
                        Some(EngineEvent::SessionPermissionModeChanged {
                            conversation_id,
                            mode_id: gemini_permission_mode_wire_id(mode),
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
        let Some(mode) = gemini_permission_mode_effect(effect)? else {
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

        let session_id = gemini_session_id(engine, effect)?;
        let method = "session/set_mode";
        let params = json!({
            "sessionId": session_id,
            "modeId": mode,
        });
        let mut output = TransportOutput::default().log(
            TransportLogKind::Send,
            format!(
                "Gemini permission mode set via ACP mode: {}",
                gemini_permission_mode_wire_id(mode),
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
        let permission_mode = decode_gemini_permission_mode(&mode.id)?;
        if permission_mode == GeminiPermissionMode::Plan {
            filtered = true;
            continue;
        }
        available_modes.push(gemini_permission_mode(mode, permission_mode));
    }

    let current_mode = decode_gemini_permission_mode(&modes.current_mode_id)?;
    let current_mode_id = if current_mode == GeminiPermissionMode::Plan {
        filtered = true;
        available_modes
            .first()
            .map(|mode| mode.id.clone())
            .unwrap_or_else(|| gemini_permission_mode_wire_id(GeminiPermissionMode::Default))
    } else {
        gemini_permission_mode_wire_id(current_mode)
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
        id: gemini_permission_mode_wire_id(permission_mode),
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
                    let mode = decode_gemini_permission_mode(&value.value)?;
                    if mode == GeminiPermissionMode::Plan {
                        filtered_any = true;
                    } else {
                        value.value = gemini_permission_mode_wire_id(mode);
                        values.push(value);
                    }
                }
                option.values = values;
                let current_mode = decode_gemini_permission_mode(&option.current_value)?;
                if current_mode == GeminiPermissionMode::Plan {
                    filtered_any = true;
                    option.current_value = option
                        .values
                        .iter()
                        .find(|value| {
                            decode_gemini_permission_mode(&value.value)
                                .is_ok_and(|mode| mode == GeminiPermissionMode::Default)
                        })
                        .or_else(|| option.values.first())
                        .map(|value| value.value.clone())
                        .unwrap_or_else(|| {
                            gemini_permission_mode_wire_id(GeminiPermissionMode::Default)
                        });
                } else {
                    option.current_value = gemini_permission_mode_wire_id(current_mode);
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

fn gemini_permission_mode_effect(
    effect: &ProtocolEffect,
) -> Result<Option<GeminiPermissionMode>, EngineError> {
    let fields = &effect.payload.fields;
    if fields.get("contextUpdate").map(String::as_str) != Some("permissionMode") {
        return Ok(None);
    }
    fields
        .get("permissionMode")
        .map(|mode| decode_gemini_permission_mode(mode))
        .transpose()
}

fn gemini_session_id(engine: &AngelEngine, effect: &ProtocolEffect) -> Result<String, EngineError> {
    let conversation_id =
        effect
            .conversation_id
            .as_ref()
            .ok_or_else(|| EngineError::InvalidCommand {
                message: "missing conversation id for Gemini permission mode update".to_string(),
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
            expected: "Gemini ACP session id".to_string(),
            actual: format!("{:?}", conversation.remote),
        })
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

fn decode_gemini_permission_mode(value: &str) -> Result<GeminiPermissionMode, EngineError> {
    serde_json::from_value(Value::String(value.to_string())).map_err(|error| {
        EngineError::InvalidState {
            expected: "canonical Gemini permission mode id".to_string(),
            actual: format!("{value:?}: {error}"),
        }
    })
}

fn gemini_permission_mode_wire_id(mode: GeminiPermissionMode) -> String {
    let value = serde_json::to_value(mode).expect("GeminiPermissionMode serializes to a string");
    let Value::String(id) = value else {
        unreachable!("GeminiPermissionMode serialized to non-string JSON");
    };
    id
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
mod tests {
    use super::*;
    use angel_engine::{
        AgentMode, ContextPatch, ContextScope, ContextUpdate, ConversationLifecycle,
        ConversationState, EngineCommand, PermissionMode, RemoteConversationId,
        apply_transport_output,
    };
    use serde_json::json;

    fn ready_engine(adapter: &GeminiAdapter) -> (AngelEngine, ConversationId) {
        let mut engine = AngelEngine::with_available_runtime(
            ProtocolFlavor::Acp,
            angel_engine::RuntimeCapabilities::new("Gemini CLI"),
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

    fn apply(engine: &mut AngelEngine, output: &TransportOutput) {
        apply_transport_output(engine, output).expect("apply output");
    }

    #[test]
    fn session_modes_hide_gemini_plan_mode() {
        let adapter = GeminiAdapter::standard();
        let (mut engine, conversation_id) = ready_engine(&adapter);

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
                                {"id": "autoEdit", "name": "Auto Edit"},
                                {"id": "yolo", "name": "YOLO"},
                                {"id": "plan", "name": "Plan"}
                            ]
                        }
                    }),
                ),
            )
            .expect("decode response without pending request");

        assert!(output.events.is_empty());

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
                                {"id": "autoEdit", "name": "Auto Edit"},
                                {"id": "yolo", "name": "YOLO"},
                                {"id": "plan", "name": "Plan"}
                            ]
                        }
                    }),
                ),
            )
            .expect("decode session");
        apply(&mut engine, &output);

        let modes = engine
            .available_modes(conversation_id.clone())
            .expect("modes");
        assert!(!modes.can_set);
        assert!(modes.available_modes.is_empty());
        let permission_modes = engine
            .permission_modes(conversation_id)
            .expect("permission modes");
        assert!(permission_modes.can_set);
        assert_eq!(
            permission_modes
                .available_modes
                .iter()
                .map(|mode| mode.id.as_str())
                .collect::<Vec<_>>(),
            vec!["default", "autoEdit", "yolo"]
        );
        assert!(output.logs.iter().any(|log| {
            log.kind == TransportLogKind::Warning
                && log.message
                    == "Gemini ACP plan mode hidden because this runtime does not complete prompts in plan mode"
        }));
    }

    #[test]
    fn session_modes_reject_noncanonical_gemini_permission_mode_casing() {
        let adapter = GeminiAdapter::standard();
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
                                {"id": "auto_edit", "name": "Auto Edit"}
                            ]
                        }
                    }),
                ),
            )
            .expect_err("noncanonical casing must fail");

        assert!(matches!(
            error,
            EngineError::InvalidState { expected, .. }
                if expected == "canonical Gemini permission mode id"
        ));
    }

    #[test]
    fn set_plan_mode_is_noop_after_gemini_mode_filtering() {
        let adapter = GeminiAdapter::standard();
        let (mut engine, conversation_id) = ready_engine(&adapter);
        let output = adapter
            .decode_message(
                &engine,
                &JsonRpcMessage::notification(
                    "session/update",
                    json!({
                        "sessionId": "sess",
                        "update": {
                            "sessionUpdate": "current_mode_update",
                            "modeId": "default"
                        }
                    }),
                ),
            )
            .expect("mode update");
        apply(&mut engine, &output);
        let output = adapter
            .decode_message(
                &engine,
                &JsonRpcMessage::notification(
                    "session/update",
                    json!({
                        "sessionId": "sess",
                        "update": {
                            "sessionUpdate": "config_option_update",
                            "configOptions": [
                                {
                                    "id": "mode",
                                    "name": "Mode",
                                    "category": "mode",
                                    "type": "select",
                                    "currentValue": "default",
                                    "options": [
                                        {"value": "default", "name": "Default"},
                                        {"value": "plan", "name": "Plan"}
                                    ]
                                }
                            ]
                        }
                    }),
                ),
            )
            .expect("config update");
        apply(&mut engine, &output);

        let plan = engine
            .plan_command(EngineCommand::UpdateContext {
                conversation_id,
                patch: ContextPatch::one(ContextUpdate::Mode {
                    scope: ContextScope::TurnAndFuture,
                    mode: Some(AgentMode {
                        id: "plan".to_string(),
                    }),
                }),
            })
            .expect("raw plan mode command");

        let output = adapter
            .encode_effect(&engine, &plan.effects[0], &TransportOptions::default())
            .expect("plan mode is ignored");
        assert!(output.messages.is_empty());
        assert!(output.logs.iter().any(|log| {
            log.kind == TransportLogKind::Warning
                && log.message
                    == "Gemini ACP plan mode ignored because this runtime does not complete prompts in plan mode"
        }));

        let settings_plan = engine.set_mode("conv", "plan").expect("settings plan");
        assert!(settings_plan.effects.is_empty());
    }

    #[test]
    fn set_permission_mode_encodes_as_acp_mode_update() {
        let adapter = GeminiAdapter::standard();
        let (mut engine, conversation_id) = ready_engine(&adapter);
        engine
            .apply_event(EngineEvent::SessionPermissionModesUpdated {
                conversation_id: conversation_id.clone(),
                modes: SessionPermissionModeState {
                    current_mode_id: "default".to_string(),
                    available_modes: vec![SessionPermissionMode {
                        id: "yolo".to_string(),
                        name: "YOLO".to_string(),
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
                        id: "yolo".to_string(),
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
                    && params["modeId"] == json!("yolo")
        ));
    }

    #[test]
    fn available_commands_hide_gemini_plan_command() {
        let adapter = GeminiAdapter::standard();
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
                                    "name": "memory",
                                    "description": "Manage memory."
                                },
                                {
                                    "name": "plan",
                                    "description": "Enter plan mode."
                                }
                            ]
                        }
                    }),
                ),
            )
            .expect("decode commands");
        apply(&mut engine, &output);

        let commands = &engine.conversations[&conversation_id].available_commands;
        assert_eq!(
            commands
                .iter()
                .map(|command| command.name.as_str())
                .collect::<Vec<_>>(),
            vec!["memory"]
        );
        assert!(output.logs.iter().any(|log| {
            log.kind == TransportLogKind::Warning
                && log.message
                    == "Gemini /plan command hidden because this runtime does not complete prompts in plan mode"
        }));
    }

    #[test]
    fn plan_slash_user_input_is_local_noop() {
        let adapter = GeminiAdapter::standard();
        let (engine, conversation_id) = ready_engine(&adapter);

        let interpreted = adapter
            .interpret_user_input(
                &engine,
                &conversation_id,
                &[UserInput::text("/plan inspect the repo")],
            )
            .expect("interpret")
            .expect("local noop");

        assert!(matches!(
            interpreted.command,
            EngineCommand::UpdateContext { patch, .. } if patch.is_empty()
        ));
        assert!(interpreted.message.is_some_and(|message| message
            == "Gemini /plan is unavailable through ACP because this runtime does not complete prompts in plan mode."));
    }

    #[test]
    fn plan_slash_turn_resets_gemini_runtime_mode_to_default() {
        let adapter = GeminiAdapter::standard();
        let (engine, conversation_id) = ready_engine(&adapter);
        let mut engine = engine;
        let plan = engine
            .plan_command(EngineCommand::StartTurn {
                conversation_id,
                input: vec![angel_engine::UserInput::text("/plan inspect the repo")],
                overrides: angel_engine::TurnOverrides::default(),
            })
            .expect("start plan slash turn");
        let request_id = plan.request_id.clone().expect("request id");

        let output = adapter
            .decode_message(
                &engine,
                &JsonRpcMessage::response(request_id.clone(), json!({"stopReason": "end_turn"})),
            )
            .expect("decode prompt response");

        assert!(matches!(
            output.messages.first(),
            Some(JsonRpcMessage::Request { id, method, params })
                if id == &JsonRpcRequestId::new(format!("gemini-plan-reset-{request_id}"))
                    && method == "session/set_mode"
                    && params["sessionId"] == json!("sess")
                    && params["modeId"] == json!("default")
        ));
        assert!(output.logs.iter().any(|log| {
            log.kind == TransportLogKind::Send
                && log.message == "Gemini /plan turn completed; resetting runtime mode to default"
        }));
    }
}
