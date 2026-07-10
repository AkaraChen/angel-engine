use angel_engine::*;
use serde_json::Value;

pub(super) fn available_commands_update(
    conversation_id: ConversationId,
    update: &Value,
) -> Result<TransportOutput, angel_engine::EngineError> {
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

pub(super) fn plan_update(
    conversation_id: ConversationId,
    turn_id: TurnId,
    update: &Value,
) -> Result<TransportOutput, angel_engine::EngineError> {
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
