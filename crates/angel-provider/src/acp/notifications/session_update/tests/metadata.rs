use serde_json::json;

use super::*;

#[test]
fn available_commands_update_does_not_require_active_turn() {
    let adapter = AcpAdapter::standard();
    let mut engine = AngelEngine::new(angel_engine::ProtocolFlavor::Acp, adapter.capabilities());
    let conversation_id = ready_conversation(&adapter, &mut engine);

    let output = adapter
        .decode_notification(
            &engine,
            "session/update",
            &json!({
                "sessionId": "sess",
                "update": {
                    "sessionUpdate": "available_commands_update",
                    "availableCommands": [
                        {
                            "name": "plan",
                            "description": "Create a plan",
                            "input": { "hint": "task" }
                        }
                    ]
                }
            }),
        )
        .expect("available commands update");

    assert!(matches!(
        output.events.as_slice(),
        [EngineEvent::AvailableCommandsUpdated { conversation_id: id, commands }]
            if id == &conversation_id
                && commands.len() == 1
                && commands[0].name == "plan"
                && commands[0].input.as_ref().map(|input| input.hint.as_str()) == Some("task")
    ));
}

#[test]
fn available_commands_update_can_arrive_before_session_new_response() {
    let adapter = AcpAdapter::standard();
    let mut engine = AngelEngine::with_available_runtime(
        angel_engine::ProtocolFlavor::Acp,
        RuntimeCapabilities::new("test-acp"),
        adapter.capabilities(),
    );
    let plan = engine
        .plan_command(EngineCommand::StartConversation {
            params: StartConversationParams {
                cwd: Some("/repo".to_string()),
                additional_directories: Vec::new(),
                context: ContextPatch::empty(),
            },
        })
        .expect("start conversation");
    let conversation_id = plan.conversation_id.expect("conversation id");

    let output = adapter
        .decode_notification(
            &engine,
            "session/update",
            &json!({
                "sessionId": "sess-before-response",
                "update": {
                    "sessionUpdate": "available_commands_update",
                    "availableCommands": [
                        {
                            "name": "help",
                            "description": "Show help"
                        }
                    ]
                }
            }),
        )
        .expect("available commands update");

    assert!(matches!(
        output.events.as_slice(),
        [EngineEvent::AvailableCommandsUpdated { conversation_id: id, commands }]
            if id == &conversation_id
                && commands.len() == 1
                && commands[0].name == "help"
    ));
}

#[test]
fn session_info_update_updates_context_without_active_turn() {
    let adapter = AcpAdapter::standard();
    let mut engine = AngelEngine::new(angel_engine::ProtocolFlavor::Acp, adapter.capabilities());
    let conversation_id = ready_conversation(&adapter, &mut engine);

    let output = adapter
        .decode_notification(
            &engine,
            "session/update",
            &json!({
                "sessionId": "sess",
                "update": {
                    "sessionUpdate": "session_info_update",
                    "title": "Investigate ACP",
                    "updatedAt": "2026-05-03T12:00:00Z"
                }
            }),
        )
        .expect("session info update");

    assert!(matches!(
        output.events.as_slice(),
        [EngineEvent::ContextUpdated { conversation_id: id, patch }]
            if id == &conversation_id
                && patch.updates.iter().any(|update| matches!(
                    update,
                    angel_engine::ContextUpdate::Raw { key, value, .. }
                        if key == "conversation.title" && value == "Investigate ACP"
                ))
                && patch.updates.iter().any(|update| matches!(
                    update,
                    angel_engine::ContextUpdate::Raw { key, value, .. }
                        if key == "conversation.updatedAt" && value == "2026-05-03T12:00:00Z"
                ))
    ));
}

#[test]
fn session_info_update_can_clear_optional_fields() {
    let adapter = AcpAdapter::standard();
    let mut engine = AngelEngine::new(angel_engine::ProtocolFlavor::Acp, adapter.capabilities());
    let conversation_id = ready_conversation(&adapter, &mut engine);

    let output = adapter
        .decode_notification(
            &engine,
            "session/update",
            &json!({
                "sessionId": "sess",
                "update": {
                    "sessionUpdate": "session_info_update",
                    "title": null
                }
            }),
        )
        .expect("session info update");

    assert!(matches!(
        output.events.as_slice(),
        [EngineEvent::ContextUpdated { conversation_id: id, patch }]
            if id == &conversation_id
                && patch.updates.iter().any(|update| matches!(
                    update,
                    angel_engine::ContextUpdate::Raw { key, value, .. }
                        if key == "conversation.title" && value.is_empty()
                ))
    ));
}

#[test]
fn usage_update_updates_session_usage_without_active_turn() {
    let adapter = AcpAdapter::standard();
    let mut engine = AngelEngine::new(angel_engine::ProtocolFlavor::Acp, adapter.capabilities());
    let conversation_id = ready_conversation(&adapter, &mut engine);

    let output = adapter
        .decode_notification(
            &engine,
            "session/update",
            &json!({
                "sessionId": "sess",
                "update": {
                    "sessionUpdate": "usage_update",
                    "used": 512,
                    "size": 4096,
                    "cost": {
                        "amount": 0.013,
                        "currency": "USD"
                    }
                }
            }),
        )
        .expect("usage update");

    assert!(matches!(
        output.events.as_slice(),
        [EngineEvent::SessionUsageUpdated { conversation_id: id, usage }]
            if id == &conversation_id
                && usage.used == 512
                && usage.size == 4096
                && usage.cost.as_ref().is_some_and(|cost| {
                    cost.amount == "0.013" && cost.currency == "USD"
                })
    ));
}
