use angel_engine::capabilities::ConversationCapabilities;
use angel_engine::event::EngineEvent;
use angel_engine::ids::ConversationId;
use angel_engine::protocol::{AcpMethod, ProtocolMethod};
use angel_engine::state::{AvailableCommand, ConversationState, SessionMode, SessionModeState};
use angel_engine::transport::{
    JsonRpcMessage, TransportLogKind, TransportOptions, TransportOutput,
};
use angel_engine::{
    AngelEngine, EngineError, ProtocolEffect, ProtocolFlavor, SessionModelState, UserInput,
};
use serde_json::Value;

use crate::acp::{AcpAdapter, AcpAdapterCapabilities};
use crate::{InterpretedUserInput, ProtocolAdapter};

#[derive(Clone, Debug)]
pub struct KimiAdapter {
    acp: AcpAdapter,
}

impl KimiAdapter {
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

    fn encode_kimi_mode_effect(
        &self,
        engine: &AngelEngine,
        effect: &ProtocolEffect,
        options: &TransportOptions,
    ) -> Result<Option<TransportOutput>, EngineError> {
        let Some(mode_id) = effect.payload.fields.get("modeId").map(String::as_str) else {
            return Ok(None);
        };
        if !matches!(mode_id, "plan" | "default") || !conversation_has_plan_command(engine, effect)
        {
            return Ok(None);
        }

        let command = if mode_id == "plan" {
            "/plan on"
        } else {
            "/plan off"
        };
        let mut prompt_effect = effect.clone();
        prompt_effect.method = ProtocolMethod::Acp(AcpMethod::SessionPrompt);
        prompt_effect.payload.fields.clear();
        prompt_effect
            .payload
            .fields
            .insert("input".to_string(), command.to_string());

        let mut output = self.acp.encode_effect(engine, &prompt_effect, options)?;
        output.logs.push(angel_engine::TransportLog::new(
            TransportLogKind::State,
            format!("Kimi plan mode via slash command: {command}"),
        ));
        Ok(Some(output))
    }

    fn normalize_kimi_output(
        &self,
        engine: &AngelEngine,
        mut output: TransportOutput,
    ) -> TransportOutput {
        let mode_updates = output
            .events
            .iter()
            .filter_map(|event| match event {
                EngineEvent::AvailableCommandsUpdated {
                    conversation_id,
                    commands,
                } if commands.iter().any(is_plan_command)
                    && needs_kimi_plan_modes(engine, &output.events, conversation_id) =>
                {
                    Some(EngineEvent::SessionModesUpdated {
                        conversation_id: conversation_id.clone(),
                        modes: kimi_plan_mode_state(engine, conversation_id),
                    })
                }
                _ => None,
            })
            .collect::<Vec<_>>();

        if !mode_updates.is_empty() {
            output.events.extend(mode_updates);
            output.logs.push(angel_engine::TransportLog::new(
                TransportLogKind::State,
                "Kimi /plan command exposed as plan/default modes",
            ));
        }
        output
    }
}

impl ProtocolAdapter for KimiAdapter {
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
            ProtocolMethod::Acp(AcpMethod::SetSessionMode)
        ) && let Some(output) = self.encode_kimi_mode_effect(engine, effect, options)?
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
        Ok(self.normalize_kimi_output(engine, output))
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

fn conversation_has_plan_command(engine: &AngelEngine, effect: &ProtocolEffect) -> bool {
    effect
        .conversation_id
        .as_ref()
        .and_then(|conversation_id| engine.conversations.get(conversation_id))
        .is_some_and(|conversation| conversation.available_commands.iter().any(is_plan_command))
}

fn is_plan_command(command: &AvailableCommand) -> bool {
    command.name == "plan"
}

fn needs_kimi_plan_modes(
    engine: &AngelEngine,
    pending_events: &[EngineEvent],
    conversation_id: &ConversationId,
) -> bool {
    if pending_events.iter().any(|event| {
        matches!(
            event,
            EngineEvent::SessionConfigOptionsUpdated {
                conversation_id: id,
                options,
            } if id == conversation_id && options.iter().any(is_mode_config_option)
        )
    }) {
        return false;
    }

    let Some(conversation) = engine.conversations.get(conversation_id) else {
        return false;
    };
    if conversation
        .config_options
        .iter()
        .any(is_mode_config_option)
    {
        return false;
    }

    match &conversation.mode_state {
        Some(modes) => !modes.available_modes.iter().any(|mode| mode.id == "plan"),
        None => true,
    }
}

fn is_mode_config_option(option: &angel_engine::SessionConfigOption) -> bool {
    option
        .category
        .as_deref()
        .is_some_and(|category| category == "mode")
        || option.id == "mode"
}

fn kimi_plan_mode_state(
    engine: &AngelEngine,
    conversation_id: &ConversationId,
) -> SessionModeState {
    let current_mode_id = engine
        .conversations
        .get(conversation_id)
        .and_then(current_mode)
        .unwrap_or_else(|| "default".to_string());

    SessionModeState {
        current_mode_id,
        available_modes: vec![
            SessionMode {
                id: "default".to_string(),
                name: "Default".to_string(),
                description: Some("Kimi default mode.".to_string()),
            },
            SessionMode {
                id: "plan".to_string(),
                name: "Plan".to_string(),
                description: Some("Kimi plan mode via /plan.".to_string()),
            },
        ],
    }
}

fn current_mode(conversation: &ConversationState) -> Option<String> {
    conversation
        .context
        .mode
        .effective()
        .and_then(Option::as_ref)
        .map(|mode| mode.id.clone())
        .or_else(|| {
            conversation
                .mode_state
                .as_ref()
                .map(|modes| modes.current_mode_id.clone())
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use angel_engine::{
        AgentMode, ContextPatch, ContextScope, ContextUpdate, ConversationLifecycle,
        ConversationState, EngineCommand, RemoteConversationId, apply_transport_output,
    };
    use serde_json::json;

    fn ready_engine(adapter: &KimiAdapter) -> (AngelEngine, ConversationId) {
        let mut engine = AngelEngine::with_available_runtime(
            ProtocolFlavor::Acp,
            angel_engine::RuntimeCapabilities::new("Kimi Code CLI"),
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

    fn apply(engine: &mut AngelEngine, output: &TransportOutput) {
        apply_transport_output(engine, output).expect("apply output");
    }

    #[test]
    fn available_plan_command_exposes_kimi_plan_modes() {
        let adapter = KimiAdapter::standard();
        let (mut engine, conversation_id) = ready_engine(&adapter);

        engine
            .apply_event(EngineEvent::SessionModesUpdated {
                conversation_id: conversation_id.clone(),
                modes: SessionModeState {
                    current_mode_id: "default".to_string(),
                    available_modes: vec![SessionMode {
                        id: "default".to_string(),
                        name: "Default".to_string(),
                        description: None,
                    }],
                },
            })
            .expect("default mode");

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
                                    "name": "plan",
                                    "description": "Toggle plan mode. Usage: /plan [on|off|view|clear]"
                                }
                            ]
                        }
                    }),
                ),
            )
            .expect("decode commands");

        assert!(output.events.iter().any(|event| {
            matches!(
                event,
                EngineEvent::SessionModesUpdated { modes, .. }
                    if modes.available_modes.iter().any(|mode| mode.id == "plan")
            )
        }));
        apply(&mut engine, &output);

        let modes = engine
            .available_modes(conversation_id)
            .expect("available modes");
        assert_eq!(
            modes
                .available_modes
                .iter()
                .map(|mode| mode.id.as_str())
                .collect::<Vec<_>>(),
            vec!["default", "plan"]
        );
    }

    #[test]
    fn set_plan_mode_uses_kimi_plan_slash_command() {
        let adapter = KimiAdapter::standard();
        let (mut engine, conversation_id) = ready_engine(&adapter);
        engine
            .apply_event(EngineEvent::AvailableCommandsUpdated {
                conversation_id: conversation_id.clone(),
                commands: vec![AvailableCommand {
                    name: "plan".to_string(),
                    description: "Toggle plan mode".to_string(),
                    input: None,
                }],
            })
            .expect("commands");
        engine
            .apply_event(EngineEvent::SessionModesUpdated {
                conversation_id: conversation_id.clone(),
                modes: kimi_plan_mode_state(&engine, &conversation_id),
            })
            .expect("modes");

        let plan = engine
            .plan_command(EngineCommand::UpdateContext {
                conversation_id: conversation_id.clone(),
                patch: ContextPatch::one(ContextUpdate::Mode {
                    scope: ContextScope::TurnAndFuture,
                    mode: Some(AgentMode {
                        id: "plan".to_string(),
                    }),
                }),
            })
            .expect("plan mode");
        let output = adapter
            .encode_effect(&engine, &plan.effects[0], &TransportOptions::default())
            .expect("encode mode");

        assert!(matches!(
            &output.messages[0],
            JsonRpcMessage::Request { method, params, .. }
                if method == "session/prompt"
                    && params["sessionId"] == json!("sess")
                    && params["prompt"][0]["text"] == json!("/plan on")
        ));
    }

    #[test]
    fn set_default_mode_uses_kimi_plan_off_slash_command() {
        let adapter = KimiAdapter::standard();
        let (mut engine, conversation_id) = ready_engine(&adapter);
        engine
            .apply_event(EngineEvent::AvailableCommandsUpdated {
                conversation_id: conversation_id.clone(),
                commands: vec![AvailableCommand {
                    name: "plan".to_string(),
                    description: "Toggle plan mode".to_string(),
                    input: None,
                }],
            })
            .expect("commands");
        engine
            .apply_event(EngineEvent::SessionModesUpdated {
                conversation_id: conversation_id.clone(),
                modes: SessionModeState {
                    current_mode_id: "plan".to_string(),
                    available_modes: kimi_plan_mode_state(&engine, &conversation_id)
                        .available_modes,
                },
            })
            .expect("modes");
        engine
            .apply_event(EngineEvent::ContextUpdated {
                conversation_id: conversation_id.clone(),
                patch: ContextPatch::one(ContextUpdate::Mode {
                    scope: ContextScope::TurnAndFuture,
                    mode: Some(AgentMode {
                        id: "plan".to_string(),
                    }),
                }),
            })
            .expect("context mode");

        let plan = engine
            .plan_command(EngineCommand::UpdateContext {
                conversation_id,
                patch: ContextPatch::one(ContextUpdate::Mode {
                    scope: ContextScope::TurnAndFuture,
                    mode: Some(AgentMode {
                        id: "default".to_string(),
                    }),
                }),
            })
            .expect("default mode");
        let output = adapter
            .encode_effect(&engine, &plan.effects[0], &TransportOptions::default())
            .expect("encode mode");

        assert!(matches!(
            &output.messages[0],
            JsonRpcMessage::Request { method, params, .. }
                if method == "session/prompt"
                    && params["sessionId"] == json!("sess")
                    && params["prompt"][0]["text"] == json!("/plan off")
        ));
    }
}
