use serde_json::json;

use super::*;

#[test]
fn available_yolo_command_exposes_kimi_permission_modes() {
    let adapter = KimiAdapter::standard();
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
                                "name": "yolo",
                                "description": "Toggle YOLO mode"
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
    apply(&mut engine, &output);

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
        vec!["default", "yolo"]
    );
}

#[test]
fn set_yolo_permission_mode_encodes_kimi_yolo_prompt() {
    let adapter = KimiAdapter::standard();
    let (mut engine, conversation_id) = ready_engine(&adapter);
    engine
        .apply_event(EngineEvent::SessionPermissionModesUpdated {
            conversation_id: conversation_id.clone(),
            modes: kimi_permission_mode_state_for("default".to_string()),
        })
        .expect("permission modes");
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
        .expect("permission mode");

    let output = adapter
        .encode_effect(&engine, &plan.effects[0], &TransportOptions::default())
        .expect("encode permission mode");
    assert!(matches!(
        output.messages.first(),
        Some(JsonRpcMessage::Request { method, params, .. })
            if method == "session/prompt"
                && params["sessionId"] == json!("sess")
                && params["prompt"] == json!([{"type": "text", "text": "/yolo"}])
    ));
    assert!(output.events.iter().any(|event| {
        matches!(
            event,
            EngineEvent::SessionPermissionModeChanged { mode_id, .. } if mode_id == "yolo"
        )
    }));
}

#[test]
fn set_default_permission_mode_encodes_kimi_yolo_prompt_when_current_is_yolo() {
    let adapter = KimiAdapter::standard();
    let (mut engine, conversation_id) = ready_engine(&adapter);
    engine
        .apply_event(EngineEvent::SessionPermissionModesUpdated {
            conversation_id: conversation_id.clone(),
            modes: kimi_permission_mode_state_for("yolo".to_string()),
        })
        .expect("permission modes");
    let effect = ProtocolEffect::new(ProtocolFlavor::Acp, ProtocolMethod::UpdateContext)
        .conversation_id(conversation_id)
        .field("contextUpdate", "permissionMode")
        .field("permissionMode", "default");

    let output = adapter
        .encode_effect(&engine, &effect, &TransportOptions::default())
        .expect("encode permission mode");
    assert!(matches!(
        output.messages.first(),
        Some(JsonRpcMessage::Notification { method, params })
            if method == "session/prompt"
                && params["sessionId"] == json!("sess")
                && params["prompt"] == json!([{"type": "text", "text": "/yolo"}])
    ));
    assert_eq!(output.messages.len(), 1);
    assert!(output.events.iter().any(|event| {
        matches!(
            event,
            EngineEvent::SessionPermissionModeChanged { mode_id, .. } if mode_id == "default"
        )
    }));
}

#[test]
fn set_same_kimi_permission_mode_does_not_send_yolo_toggle() {
    let adapter = KimiAdapter::standard();
    let (mut engine, conversation_id) = ready_engine(&adapter);
    engine
        .apply_event(EngineEvent::SessionPermissionModesUpdated {
            conversation_id: conversation_id.clone(),
            modes: kimi_permission_mode_state_for("yolo".to_string()),
        })
        .expect("permission modes");
    let request_id = angel_engine::JsonRpcRequestId::new("ctx");
    let effect = ProtocolEffect::new(ProtocolFlavor::Acp, ProtocolMethod::UpdateContext)
        .request_id(request_id.clone())
        .conversation_id(conversation_id)
        .field("contextUpdate", "permissionMode")
        .field("permissionMode", "yolo");

    let output = adapter
        .encode_effect(&engine, &effect, &TransportOptions::default())
        .expect("encode permission mode");

    assert!(output.messages.is_empty());
    assert!(output.events.is_empty());
    assert!(output.completed_requests.contains(&request_id));
}

#[test]
fn unavailable_kimi_yolo_permission_mode_does_not_send_prompt() {
    let adapter = KimiAdapter::standard();
    let (engine, conversation_id) = ready_engine(&adapter);
    let request_id = angel_engine::JsonRpcRequestId::new("ctx");
    let effect = ProtocolEffect::new(ProtocolFlavor::Acp, ProtocolMethod::UpdateContext)
        .request_id(request_id.clone())
        .conversation_id(conversation_id)
        .field("contextUpdate", "permissionMode")
        .field("permissionMode", "yolo");

    let output = adapter
        .encode_effect(&engine, &effect, &TransportOptions::default())
        .expect("encode permission mode");

    assert!(output.messages.is_empty());
    assert!(output.events.is_empty());
    assert!(output.completed_requests.contains(&request_id));
}
