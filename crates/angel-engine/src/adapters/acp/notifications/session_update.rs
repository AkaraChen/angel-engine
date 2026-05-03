use crate::*;
use serde_json::Value;

use super::super::helpers::*;
use super::super::{AcpAdapter, AcpToolStatus};

pub(super) fn decode_acp_update(
    engine: &AngelEngine,
    params: &Value,
) -> Result<TransportOutput, crate::EngineError> {
    let session_id = params
        .get("sessionId")
        .and_then(Value::as_str)
        .unwrap_or("");
    let Some(conversation_id) = find_acp_conversation(engine, session_id) else {
        return Ok(TransportOutput::default().log(
            TransportLogKind::Receive,
            format!("update for unknown session {session_id}"),
        ));
    };
    let update = params.get("update").unwrap_or(&Value::Null);
    let update_type = update
        .get("sessionUpdate")
        .and_then(Value::as_str)
        .unwrap_or("");

    if update_type == "available_commands_update" {
        let commands = available_commands(update);
        return Ok(TransportOutput::default()
            .event(EngineEvent::AvailableCommandsUpdated {
                conversation_id,
                commands: commands.clone(),
            })
            .log(
                TransportLogKind::State,
                format!("available commands updated: {}", commands.len()),
            ));
    }
    if update_type == "config_option_update" {
        let options = session_config_options(update);
        return Ok(TransportOutput::default()
            .event(EngineEvent::SessionConfigOptionsUpdated {
                conversation_id,
                options: options.clone(),
            })
            .log(
                TransportLogKind::State,
                format!("config options updated: {}", options.len()),
            ));
    }
    if update_type == "current_mode_update" {
        let mode_id = update
            .get("modeId")
            .or_else(|| update.get("currentModeId"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        return Ok(TransportOutput::default()
            .event(EngineEvent::SessionModeChanged {
                conversation_id,
                mode_id: mode_id.clone(),
            })
            .log(TransportLogKind::State, format!("mode changed: {mode_id}")));
    }
    if update_type == "session_info_update" {
        let patch = acp_session_info_context(update);
        return Ok(TransportOutput::default()
            .event(EngineEvent::ContextUpdated {
                conversation_id,
                patch,
            })
            .log(TransportLogKind::State, "session info updated"));
    }

    let Some(turn_id) = active_turn_id(engine, &conversation_id) else {
        return Ok(TransportOutput::default().log(
            TransportLogKind::Receive,
            "session update without active turn",
        ));
    };

    match update_type {
        "agent_message_chunk" => {
            let delta = content_delta_from_update(update);
            let log_text = content_delta_log_text(&delta);
            Ok(TransportOutput::default()
                .event(EngineEvent::AssistantDelta {
                    conversation_id,
                    turn_id,
                    delta,
                })
                .log(TransportLogKind::Output, log_text))
        }
        "agent_thought_chunk" => {
            let delta = content_delta_from_update(update);
            let log_text = content_delta_log_text(&delta);
            Ok(TransportOutput::default()
                .event(EngineEvent::ReasoningDelta {
                    conversation_id,
                    turn_id,
                    delta,
                })
                .log(TransportLogKind::Output, format!("[reasoning] {log_text}")))
        }
        "tool_call" => {
            let id = update
                .get("toolCallId")
                .or_else(|| update.get("id"))
                .and_then(Value::as_str)
                .unwrap_or("tool");
            let mut action =
                ActionState::new(ActionId::new(id.to_string()), turn_id, ActionKind::McpTool);
            action.input = ActionInput {
                summary: update
                    .get("title")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                raw: Some(update.to_string()),
            };
            Ok(TransportOutput::default()
                .event(EngineEvent::ActionObserved {
                    conversation_id,
                    action,
                })
                .log(TransportLogKind::State, "tool call started"))
        }
        "tool_call_update" => {
            let id = update
                .get("toolCallId")
                .or_else(|| update.get("id"))
                .and_then(Value::as_str)
                .unwrap_or("tool");
            let action_id = ActionId::new(id.to_string());
            let status = update
                .get("status")
                .and_then(Value::as_str)
                .map(acp_tool_status)
                .unwrap_or(AcpToolStatus::InProgress);
            let text = update_text(update);
            let mut output = TransportOutput::default()
                .log(TransportLogKind::State, format!("tool call {status:?}"));
            if !acp_action_exists(engine, &conversation_id, &action_id) {
                let mut action =
                    ActionState::new(action_id.clone(), turn_id.clone(), ActionKind::McpTool);
                action.input = ActionInput {
                    summary: update
                        .get("title")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                    raw: Some(update.to_string()),
                };
                output.events.push(EngineEvent::ActionObserved {
                    conversation_id: conversation_id.clone(),
                    action,
                });
            }
            output.events.push(EngineEvent::ActionUpdated {
                conversation_id,
                action_id,
                patch: ActionPatch {
                    phase: Some(AcpAdapter::tool_status_to_phase(status)),
                    output_delta: (!text.is_empty()).then_some(ActionOutputDelta::Text(text)),
                    error: None,
                    title: None,
                },
            });
            Ok(output)
        }
        "plan" => {
            let path = plan_update_path(update);
            let entries = update
                .get("entries")
                .or_else(|| update.get("plan"))
                .and_then(Value::as_array)
                .map(|steps| {
                    steps
                        .iter()
                        .map(|step| PlanEntry {
                            content: step
                                .get("content")
                                .or_else(|| step.get("step"))
                                .and_then(Value::as_str)
                                .unwrap_or_default()
                                .to_string(),
                            status: match step
                                .get("status")
                                .and_then(Value::as_str)
                                .unwrap_or("pending")
                            {
                                "in_progress" | "inProgress" => PlanEntryStatus::InProgress,
                                "completed" => PlanEntryStatus::Completed,
                                _ => PlanEntryStatus::Pending,
                            },
                        })
                        .collect()
                })
                .unwrap_or_default();
            let mut output = TransportOutput::default()
                .event(EngineEvent::PlanUpdated {
                    conversation_id: conversation_id.clone(),
                    turn_id: turn_id.clone(),
                    plan: PlanState { entries },
                })
                .log(TransportLogKind::State, "plan updated");
            if let Some(path) = path {
                output.events.push(EngineEvent::PlanPathUpdated {
                    conversation_id,
                    turn_id,
                    path,
                });
            }
            Ok(output)
        }
        _ => Ok(TransportOutput::default().log(
            TransportLogKind::Receive,
            format!("session/update {update_type}"),
        )),
    }
}

fn plan_update_path(update: &Value) -> Option<String> {
    [
        "savedPath",
        "saved_path",
        "path",
        "filePath",
        "file_path",
        "planPath",
        "plan_path",
    ]
    .iter()
    .find_map(|key| update.get(*key).and_then(Value::as_str))
    .map(str::to_string)
}

fn available_commands(update: &Value) -> Vec<AvailableCommand> {
    update
        .get("availableCommands")
        .and_then(Value::as_array)
        .map(|commands| {
            commands
                .iter()
                .filter_map(|command| {
                    let name = command.get("name").and_then(Value::as_str)?;
                    let description = command
                        .get("description")
                        .and_then(Value::as_str)
                        .unwrap_or_default();
                    let input = command
                        .get("input")
                        .and_then(|input| input.get("hint"))
                        .and_then(Value::as_str)
                        .map(|hint| AvailableCommandInput {
                            hint: hint.to_string(),
                        });
                    Some(AvailableCommand {
                        name: name.to_string(),
                        description: description.to_string(),
                        input,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn available_commands_update_does_not_require_active_turn() {
        let adapter = AcpAdapter::standard();
        let mut engine = AngelEngine::new(crate::ProtocolFlavor::Acp, adapter.capabilities());
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
    fn session_info_update_updates_context_without_active_turn() {
        let adapter = AcpAdapter::standard();
        let mut engine = AngelEngine::new(crate::ProtocolFlavor::Acp, adapter.capabilities());
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
                        crate::ContextUpdate::Raw { key, value, .. }
                            if key == "conversation.title" && value == "Investigate ACP"
                    ))
                    && patch.updates.iter().any(|update| matches!(
                        update,
                        crate::ContextUpdate::Raw { key, value, .. }
                            if key == "conversation.updatedAt" && value == "2026-05-03T12:00:00Z"
                    ))
        ));
    }

    #[test]
    fn session_info_update_can_clear_optional_fields() {
        let adapter = AcpAdapter::standard();
        let mut engine = AngelEngine::new(crate::ProtocolFlavor::Acp, adapter.capabilities());
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
                        crate::ContextUpdate::Raw { key, value, .. }
                            if key == "conversation.title" && value.is_empty()
                    ))
        ));
    }

    #[test]
    fn agent_message_chunk_maps_resource_link_to_resource_ref() {
        let adapter = AcpAdapter::standard();
        let mut engine = AngelEngine::new(crate::ProtocolFlavor::Acp, adapter.capabilities());
        let conversation_id = ready_conversation(&adapter, &mut engine);
        let turn_id = start_ready_turn(&mut engine, &conversation_id);

        let output = adapter
            .decode_notification(
                &engine,
                "session/update",
                &json!({
                    "sessionId": "sess",
                    "update": {
                        "sessionUpdate": "agent_message_chunk",
                        "content": {
                            "type": "resource_link",
                            "name": "README",
                            "uri": "file:///repo/README.md"
                        }
                    }
                }),
            )
            .expect("agent message update");

        assert!(matches!(
            output.events.as_slice(),
            [EngineEvent::AssistantDelta {
                conversation_id: id,
                turn_id: actual_turn_id,
                delta: ContentDelta::ResourceRef(uri),
            }] if id == &conversation_id
                && actual_turn_id == &turn_id
                && uri == "file:///repo/README.md"
        ));
    }

    #[test]
    fn agent_thought_chunk_preserves_unknown_content_as_structured_delta() {
        let adapter = AcpAdapter::standard();
        let mut engine = AngelEngine::new(crate::ProtocolFlavor::Acp, adapter.capabilities());
        let conversation_id = ready_conversation(&adapter, &mut engine);
        let turn_id = start_ready_turn(&mut engine, &conversation_id);

        let output = adapter
            .decode_notification(
                &engine,
                "session/update",
                &json!({
                    "sessionId": "sess",
                    "update": {
                        "sessionUpdate": "agent_thought_chunk",
                        "content": {
                            "type": "image",
                            "data": "ZmFrZQ==",
                            "mimeType": "image/png"
                        }
                    }
                }),
            )
            .expect("agent thought update");

        assert!(matches!(
            output.events.as_slice(),
            [EngineEvent::ReasoningDelta {
                conversation_id: id,
                turn_id: actual_turn_id,
                delta: ContentDelta::Structured(value),
            }] if id == &conversation_id
                && actual_turn_id == &turn_id
                && value.contains("\"type\":\"image\"")
                && value.contains("\"mimeType\":\"image/png\"")
        ));
    }

    fn ready_conversation(adapter: &AcpAdapter, engine: &mut AngelEngine) -> ConversationId {
        let conversation_id = ConversationId::new("conv");
        engine
            .apply_event(EngineEvent::ConversationProvisionStarted {
                id: conversation_id.clone(),
                remote: RemoteConversationId::Pending("conv".to_string()),
                op: crate::ProvisionOp::New,
                capabilities: adapter.capabilities(),
            })
            .expect("conversation provision");
        engine
            .apply_event(EngineEvent::ConversationReady {
                id: conversation_id.clone(),
                remote: Some(RemoteConversationId::Known("sess".to_string())),
                context: ContextPatch::empty(),
                capabilities: None,
            })
            .expect("conversation ready");
        conversation_id
    }

    fn start_ready_turn(engine: &mut AngelEngine, conversation_id: &ConversationId) -> TurnId {
        let turn_id = TurnId::new("turn");
        engine
            .apply_event(EngineEvent::TurnStarted {
                conversation_id: conversation_id.clone(),
                turn_id: turn_id.clone(),
                remote: crate::RemoteTurnId::Local("remote-turn".to_string()),
                input: Vec::new(),
            })
            .expect("turn started");
        turn_id
    }
}
