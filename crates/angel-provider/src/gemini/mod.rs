use angel_engine::event::EngineEvent;
use angel_engine::ids::{ConversationId, JsonRpcRequestId};
use angel_engine::protocol::ProtocolMethod;
use angel_engine::state::{SessionConfigOption, SessionModeState};
use angel_engine::transport::{
    JsonRpcMessage, TransportLogKind, TransportOptions, TransportOutput,
};
use angel_engine::{
    AngelEngine, ConversationCapabilities, EngineError, PendingRequest, ProtocolEffect,
    ProtocolFlavor, SessionModelState, UserInput,
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

    fn normalize_gemini_output(&self, mut output: TransportOutput) -> TransportOutput {
        let mut filtered_plan_mode = false;
        output.events = output
            .events
            .into_iter()
            .map(|event| match event {
                EngineEvent::SessionModesUpdated {
                    conversation_id,
                    modes,
                } => {
                    let (modes, filtered) = gemini_session_modes(modes);
                    filtered_plan_mode |= filtered;
                    EngineEvent::SessionModesUpdated {
                        conversation_id,
                        modes,
                    }
                }
                EngineEvent::SessionConfigOptionsUpdated {
                    conversation_id,
                    options,
                } => {
                    let (options, filtered) = gemini_config_options(options);
                    filtered_plan_mode |= filtered;
                    EngineEvent::SessionConfigOptionsUpdated {
                        conversation_id,
                        options,
                    }
                }
                event => event,
            })
            .collect();

        if filtered_plan_mode {
            output.logs.push(angel_engine::TransportLog::new(
                TransportLogKind::Warning,
                "Gemini ACP plan mode hidden because this runtime does not complete prompts in plan mode",
            ));
        }
        output
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
        let output = self.normalize_gemini_output(output);
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
        self.acp
            .interpret_user_input(engine, conversation_id, input)
    }
}

fn gemini_session_modes(mut modes: SessionModeState) -> (SessionModeState, bool) {
    let before = modes.available_modes.len();
    modes
        .available_modes
        .retain(|mode| !is_gemini_plan_mode(&mode.id));
    let filtered = before != modes.available_modes.len();
    if filtered && is_gemini_plan_mode(&modes.current_mode_id) {
        modes.current_mode_id = modes
            .available_modes
            .iter()
            .find(|mode| mode.id == "default")
            .or_else(|| modes.available_modes.first())
            .map(|mode| mode.id.clone())
            .unwrap_or_else(|| "default".to_string());
    }
    (modes, filtered)
}

fn gemini_config_options(options: Vec<SessionConfigOption>) -> (Vec<SessionConfigOption>, bool) {
    let mut filtered_any = false;
    let options = options
        .into_iter()
        .map(|mut option| {
            if is_mode_config_option(&option) {
                let before = option.values.len();
                option
                    .values
                    .retain(|value| !is_gemini_plan_mode(&value.value));
                if before != option.values.len() {
                    filtered_any = true;
                    if is_gemini_plan_mode(&option.current_value) {
                        option.current_value = option
                            .values
                            .iter()
                            .find(|value| value.value == "default")
                            .or_else(|| option.values.first())
                            .map(|value| value.value.clone())
                            .unwrap_or_else(|| "default".to_string());
                    }
                }
            }
            option
        })
        .collect();
    (options, filtered_any)
}

fn is_mode_config_option(option: &SessionConfigOption) -> bool {
    option.category.as_deref() == Some("mode")
}

fn is_gemini_plan_mode(value: &str) -> bool {
    let value = value.trim();
    value == "plan" || value.ends_with("#plan")
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

#[cfg(test)]
mod tests {
    use super::*;
    use angel_engine::{
        AgentMode, ContextPatch, ContextScope, ContextUpdate, ConversationLifecycle,
        ConversationState, EngineCommand, RemoteConversationId, apply_transport_output,
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

        let modes = engine.available_modes(conversation_id).expect("modes");
        assert_eq!(
            modes
                .available_modes
                .iter()
                .map(|mode| mode.id.as_str())
                .collect::<Vec<_>>(),
            vec!["default", "autoEdit", "yolo"]
        );
        assert!(output.logs.iter().any(|log| {
            log.kind == TransportLogKind::Warning
                && log.message.contains("Gemini ACP plan mode hidden")
        }));
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
                && log.message.contains("Gemini ACP plan mode ignored")
        }));

        let settings_plan = engine.set_mode("conv", "plan").expect("settings plan");
        assert!(settings_plan.effects.is_empty());
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
                && log
                    .message
                    .contains("Gemini /plan turn completed; resetting runtime mode")
        }));
    }
}
