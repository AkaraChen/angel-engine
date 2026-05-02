use super::helpers::*;
use super::*;

impl AcpAdapter {
    pub(super) fn decode_notification(
        &self,
        engine: &AngelEngine,
        method: &str,
        params: &Value,
    ) -> Result<TransportOutput, crate::EngineError> {
        match method {
            "session/update" => decode_acp_update(engine, params),
            _ => Ok(TransportOutput::default().log(
                TransportLogKind::Receive,
                format!("{method} (details hidden)"),
            )),
        }
    }
}

fn decode_acp_update(
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

    let Some(turn_id) = active_turn_id(engine, &conversation_id) else {
        return Ok(TransportOutput::default().log(
            TransportLogKind::Receive,
            "session update without active turn",
        ));
    };

    match update_type {
        "agent_message_chunk" => {
            let text = update_text(update);
            Ok(TransportOutput::default()
                .event(EngineEvent::AssistantDelta {
                    conversation_id,
                    turn_id,
                    delta: ContentDelta::Text(text.clone()),
                })
                .log(TransportLogKind::Output, text))
        }
        "agent_thought_chunk" => {
            let text = update_text(update);
            Ok(TransportOutput::default()
                .event(EngineEvent::ReasoningDelta {
                    conversation_id,
                    turn_id,
                    delta: ContentDelta::Text(text.clone()),
                })
                .log(TransportLogKind::Output, format!("[reasoning] {text}")))
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
            let status = update
                .get("status")
                .and_then(Value::as_str)
                .map(acp_tool_status)
                .unwrap_or(AcpToolStatus::InProgress);
            let text = update_text(update);
            Ok(TransportOutput::default()
                .event(EngineEvent::ActionUpdated {
                    conversation_id,
                    action_id: ActionId::new(id.to_string()),
                    patch: ActionPatch {
                        phase: Some(AcpAdapter::tool_status_to_phase(status)),
                        output_delta: (!text.is_empty()).then_some(ActionOutputDelta::Text(text)),
                        error: None,
                        title: None,
                    },
                })
                .log(TransportLogKind::State, format!("tool call {status:?}")))
        }
        "plan" => {
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
            Ok(TransportOutput::default()
                .event(EngineEvent::PlanUpdated {
                    conversation_id,
                    turn_id,
                    plan: PlanState { entries },
                })
                .log(TransportLogKind::State, "plan updated"))
        }
        _ => Ok(TransportOutput::default().log(
            TransportLogKind::Receive,
            format!("session/update {update_type}"),
        )),
    }
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

    #[test]
    fn available_commands_update_does_not_require_active_turn() {
        let adapter = AcpAdapter::standard();
        let mut engine = AngelEngine::new(crate::ProtocolFlavor::Acp, adapter.capabilities());
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
                remote: Some(RemoteConversationId::AcpSession("sess".to_string())),
                context: ContextPatch::empty(),
                capabilities: None,
            })
            .expect("conversation ready");

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
}
