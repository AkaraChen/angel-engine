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
fn allow_all_startup_flag_projects_current_copilot_permission_mode() {
    let adapter = CopilotAdapter::standard_with_args(&["--allow-all".to_string()]);
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
                            }
                        ]
                    }
                }),
            ),
        )
        .expect("available commands");
    apply_transport_output(&mut engine, &output).expect("apply output");

    let permission_modes = engine
        .permission_modes(conversation_id)
        .expect("permission modes");
    assert_eq!(
        permission_modes.current_mode_id.as_deref(),
        Some("allowAll")
    );
}

#[test]
fn available_commands_without_allow_all_do_not_inject_permission_modes() {
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
    assert!(permission_modes.available_modes.is_empty());
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

#[test]
fn set_default_permission_mode_encodes_copilot_command_prompt() {
    let adapter = CopilotAdapter::standard_with_args(&[]);
    let (mut engine, conversation_id) = ready_engine(&adapter);
    engine
        .apply_event(EngineEvent::SessionPermissionModesUpdated {
            conversation_id: conversation_id.clone(),
            modes: SessionPermissionModeState {
                current_mode_id: "allowAll".to_string(),
                available_modes: copilot_permission_mode_state(
                    &engine,
                    &conversation_id,
                    CopilotPermissionMode::Default,
                )
                .available_modes,
            },
        })
        .expect("permission modes");
    let plan = engine
        .plan_command(EngineCommand::UpdateContext {
            conversation_id,
            patch: ContextPatch::one(ContextUpdate::PermissionMode {
                scope: ContextScope::TurnAndFuture,
                mode: Some(PermissionMode {
                    id: "default".to_string(),
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
                && params["prompt"] == json!([{"type": "text", "text": "/allow-all off"}])
    ));
}
