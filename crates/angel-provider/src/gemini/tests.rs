use super::*;
use angel_engine::{
    AgentMode, ContextPatch, ContextScope, ContextUpdate, ConversationLifecycle, ConversationState,
    EngineCommand, PermissionMode, RemoteConversationId, apply_transport_output,
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
