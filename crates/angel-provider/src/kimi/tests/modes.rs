use serde_json::json;

use super::*;

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
fn set_plan_mode_projects_locally_without_kimi_plan_slash_command() {
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

    assert!(output.messages.is_empty());
    assert!(
        output
            .completed_requests
            .contains(&plan.effects[0].request_id.clone().unwrap())
    );
    assert!(output.events.iter().any(|event| {
        matches!(
            event,
            EngineEvent::SessionModeChanged { mode_id, .. } if mode_id == "plan"
        )
    }));
}

#[test]
fn neutral_update_context_plan_mode_projects_locally() {
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
    let effect = ProtocolEffect::new(ProtocolFlavor::Acp, ProtocolMethod::UpdateContext)
        .request_id(angel_engine::JsonRpcRequestId::new("ctx"))
        .conversation_id(conversation_id)
        .field("contextUpdate", "mode")
        .field("mode", "plan");

    let output = adapter
        .encode_effect(&engine, &effect, &TransportOptions::default())
        .expect("encode mode");

    assert!(output.messages.is_empty());
    assert!(
        output
            .completed_requests
            .contains(&angel_engine::JsonRpcRequestId::new("ctx"))
    );
    assert!(output.events.iter().any(|event| {
        matches!(
            event,
            EngineEvent::SessionModeChanged { mode_id, .. } if mode_id == "plan"
        )
    }));
}

#[test]
fn set_default_mode_projects_locally_without_kimi_plan_slash_command() {
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
                available_modes: kimi_plan_mode_state(&engine, &conversation_id).available_modes,
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

    assert!(output.messages.is_empty());
    assert!(
        output
            .completed_requests
            .contains(&plan.effects[0].request_id.clone().unwrap())
    );
    assert!(output.events.iter().any(|event| {
        matches!(
            event,
            EngineEvent::SessionModeChanged { mode_id, .. } if mode_id == "default"
        )
    }));
}
