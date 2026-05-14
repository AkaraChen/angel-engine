use angel_engine::*;
use serde_json::Value;

use super::super::helpers::*;
use super::super::wire::AcpSessionUpdateKind;
use super::super::{AcpAdapter, AcpToolStatus};
use std::str::FromStr;

pub(super) fn decode_acp_update(
    adapter: &AcpAdapter,
    engine: &AngelEngine,
    params: &Value,
) -> Result<TransportOutput, angel_engine::EngineError> {
    let session_id = params
        .get("sessionId")
        .and_then(Value::as_str)
        .unwrap_or("");
    let Some(conversation_id) = find_acp_conversation_or_pending_start(engine, session_id) else {
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

    let update_kind = AcpSessionUpdateKind::from_str(update_type).ok();

    if update_kind == Some(AcpSessionUpdateKind::AvailableCommandsUpdate) {
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
    if update_kind == Some(AcpSessionUpdateKind::ConfigOptionUpdate) {
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
    if update_kind == Some(AcpSessionUpdateKind::CurrentModeUpdate) {
        let Some(mode_id) = update
            .get("modeId")
            .or_else(|| update.get("currentModeId"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|mode_id| !mode_id.is_empty())
            .map(str::to_string)
        else {
            return Err(angel_engine::EngineError::InvalidCommand {
                message: "ACP current mode update missing modeId/currentModeId".to_string(),
            });
        };
        return Ok(TransportOutput::default()
            .event(EngineEvent::SessionModeChanged {
                conversation_id,
                mode_id: mode_id.clone(),
            })
            .log(TransportLogKind::State, format!("mode changed: {mode_id}")));
    }
    if update_kind == Some(AcpSessionUpdateKind::SessionInfoUpdate) {
        let patch = acp_session_info_context(update);
        return Ok(TransportOutput::default()
            .event(EngineEvent::ContextUpdated {
                conversation_id,
                patch,
            })
            .log(TransportLogKind::State, "session info updated"));
    }
    if update_kind == Some(AcpSessionUpdateKind::UsageUpdate) {
        let Some(usage) = session_usage_state(update) else {
            return Ok(TransportOutput::default().log(
                TransportLogKind::Warning,
                "ignoring invalid ACP usage update",
            ));
        };
        return Ok(TransportOutput::default()
            .event(EngineEvent::SessionUsageUpdated {
                conversation_id,
                usage,
            })
            .log(TransportLogKind::State, "usage updated"));
    }

    let Some(turn_id) = active_turn_id(engine, &conversation_id) else {
        if let Some(output) = hydration_update(engine, &conversation_id, update_kind, update) {
            return Ok(output);
        }
        return Ok(TransportOutput::default().log(
            TransportLogKind::Receive,
            "session update without active turn",
        ));
    };

    match update_kind {
        Some(AcpSessionUpdateKind::AgentMessageChunk) => {
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
        Some(AcpSessionUpdateKind::AgentThoughtChunk) => {
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
        Some(AcpSessionUpdateKind::ToolCall) => {
            let Some(id) = tool_call_id(update) else {
                return Err(angel_engine::EngineError::InvalidCommand {
                    message: "ACP tool call missing toolCallId/id".to_string(),
                });
            };
            let status = tool_status_from_update(update);
            let action_id = ActionId::new(id.to_string());
            if let Some(existing_action_id) =
                duplicate_active_acp_tool_action_id(engine, &conversation_id, update, &action_id)
            {
                adapter.remember_duplicate_tool_action(id, existing_action_id.clone());
                if status == AcpToolStatus::Pending {
                    return Ok(TransportOutput::default().log(
                        TransportLogKind::Warning,
                        format!(
                            "ignored duplicate ACP tool call {id} for active action {existing_action_id}"
                        ),
                    ));
                }
                let title = tool_title(update);
                let deltas =
                    acp_tool_output_deltas(engine, &conversation_id, &existing_action_id, update);
                let error = acp_tool_error(update, status);
                let mut output = TransportOutput::default().log(
                    TransportLogKind::Warning,
                    format!("merged duplicate ACP tool call {id} into {existing_action_id}"),
                );
                push_tool_action_updates(
                    &mut output,
                    conversation_id,
                    existing_action_id,
                    Some(AcpAdapter::tool_status_to_phase(status)),
                    title,
                    error,
                    deltas,
                );
                return Ok(output);
            }
            if let Some(existing_action_id) =
                matching_acp_tool_action_id(engine, &conversation_id, update, &action_id)
            {
                adapter.remember_duplicate_tool_action(id, existing_action_id.clone());
                return Ok(TransportOutput::default().log(
                    TransportLogKind::Warning,
                    format!(
                        "ignored duplicate ACP tool call {id}; active action {existing_action_id} already represents it"
                    ),
                ));
            }
            let mut action = ActionState::new(action_id, turn_id, acp_action_kind(update));
            action.phase = AcpAdapter::tool_status_to_phase(status);
            action.title = tool_title(update);
            action.input = acp_tool_input(update);
            action.output.chunks = acp_tool_output_snapshot(update);
            action.error = acp_tool_error(update, status);
            Ok(TransportOutput::default()
                .event(EngineEvent::ActionObserved {
                    conversation_id,
                    action,
                })
                .log(TransportLogKind::State, "tool call started"))
        }
        Some(AcpSessionUpdateKind::ToolCallUpdate) => {
            let Some(id) = tool_call_id(update) else {
                return Err(angel_engine::EngineError::InvalidCommand {
                    message: "ACP tool call update missing toolCallId/id".to_string(),
                });
            };
            let mut action_id = ActionId::new(id.to_string());
            let status = update
                .get("status")
                .and_then(Value::as_str)
                .map(acp_tool_status)
                .unwrap_or(AcpToolStatus::InProgress);
            let title = tool_title(update);
            let error = acp_tool_error(update, status);
            let mut output = TransportOutput::default()
                .log(TransportLogKind::State, format!("tool call {status:?}"));
            if !acp_action_exists(engine, &conversation_id, &action_id) {
                if let Some(existing_action_id) = adapter.duplicate_tool_action_id(id) {
                    if status == AcpToolStatus::Failed {
                        return Ok(output.log(
                            TransportLogKind::Warning,
                            format!(
                                "ignored failed duplicate ACP tool call update {id}; active action {existing_action_id} already represents it"
                            ),
                        ));
                    }
                    output.logs.push(angel_engine::TransportLog {
                        kind: TransportLogKind::Warning,
                        message: format!(
                            "merged duplicate ACP tool call update {id} into {existing_action_id}"
                        ),
                    });
                    action_id = existing_action_id;
                } else if let Some(existing_action_id) = duplicate_active_acp_tool_action_id(
                    engine,
                    &conversation_id,
                    update,
                    &action_id,
                ) {
                    adapter.remember_duplicate_tool_action(id, existing_action_id.clone());
                    output.logs.push(angel_engine::TransportLog {
                        kind: TransportLogKind::Warning,
                        message: format!(
                            "merged duplicate ACP tool call update {id} into {existing_action_id}"
                        ),
                    });
                    action_id = existing_action_id;
                } else if let Some(existing_action_id) =
                    matching_acp_tool_action_id(engine, &conversation_id, update, &action_id)
                {
                    adapter.remember_duplicate_tool_action(id, existing_action_id.clone());
                    return Ok(output.log(
                        TransportLogKind::Warning,
                        format!(
                            "ignored duplicate ACP tool call update {id}; active action {existing_action_id} already represents it"
                        ),
                    ));
                } else {
                    let mut action = ActionState::new(
                        action_id.clone(),
                        turn_id.clone(),
                        acp_action_kind(update),
                    );
                    action.title = title.clone();
                    action.input = acp_tool_input(update);
                    output.events.push(EngineEvent::ActionObserved {
                        conversation_id: conversation_id.clone(),
                        action,
                    });
                }
            }
            let deltas = acp_tool_output_deltas(engine, &conversation_id, &action_id, update);
            push_tool_action_updates(
                &mut output,
                conversation_id,
                action_id,
                Some(AcpAdapter::tool_status_to_phase(status)),
                title,
                error,
                deltas,
            );
            Ok(output)
        }
        Some(AcpSessionUpdateKind::Plan) => {
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

fn tool_call_id(update: &Value) -> Option<&str> {
    update
        .get("toolCallId")
        .or_else(|| update.get("id"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|id| !id.is_empty())
}

fn hydration_update(
    engine: &AngelEngine,
    conversation_id: &ConversationId,
    update_kind: Option<AcpSessionUpdateKind>,
    update: &Value,
) -> Option<TransportOutput> {
    let conversation = engine.conversations.get(conversation_id)?;
    if !matches!(
        conversation.lifecycle,
        ConversationLifecycle::Hydrating { .. }
    ) {
        return None;
    }
    let entry = match update_kind? {
        AcpSessionUpdateKind::UserMessageChunk => HistoryReplayEntry {
            role: HistoryRole::User,
            content: content_delta_from_update(update),
            tool: None,
        },
        AcpSessionUpdateKind::AgentMessageChunk => HistoryReplayEntry {
            role: HistoryRole::Assistant,
            content: content_delta_from_update(update),
            tool: None,
        },
        AcpSessionUpdateKind::AgentThoughtChunk => HistoryReplayEntry {
            role: HistoryRole::Reasoning,
            content: content_delta_from_update(update),
            tool: None,
        },
        AcpSessionUpdateKind::ToolCall | AcpSessionUpdateKind::ToolCallUpdate => {
            acp_tool_history_entry(update)?
        }
        _ => return None,
    };
    Some(
        TransportOutput::default()
            .event(EngineEvent::HistoryReplayChunk {
                conversation_id: conversation_id.clone(),
                entry,
            })
            .log(
                TransportLogKind::State,
                format!("hydrated {}", update_kind?.wire_string()),
            ),
    )
}

fn tool_status_from_update(update: &Value) -> AcpToolStatus {
    update
        .get("status")
        .and_then(Value::as_str)
        .map(acp_tool_status)
        .unwrap_or(AcpToolStatus::Pending)
}

fn tool_title(update: &Value) -> Option<String> {
    let title = update
        .get("title")
        .and_then(Value::as_str)
        .map(str::to_string);
    let kind = update
        .get("kind")
        .and_then(Value::as_str)
        .and_then(super::super::wire::parse_tool_kind);
    match kind {
        Some(agent_client_protocol_schema::ToolKind::Read) => tool_path_from_output(update)
            .map(|path| format!("Read file: {path}"))
            .or(title),
        _ => title,
    }
}

fn tool_path_from_output(update: &Value) -> Option<String> {
    acp_tool_output_snapshot(update)
        .iter()
        .find_map(|chunk| match chunk {
            ActionOutputDelta::Text(text) => path_like_text(text),
            ActionOutputDelta::Patch(_)
            | ActionOutputDelta::Structured(_)
            | ActionOutputDelta::Terminal(_) => None,
        })
}

fn path_like_text(text: &str) -> Option<String> {
    extract_tag_text(text, "path")
        .and_then(clean_path_candidate)
        .or_else(|| {
            text.lines()
                .find_map(|line| clean_path_candidate(line.trim()))
        })
        .or_else(|| {
            text.split_whitespace()
                .find_map(|token| clean_path_candidate(token))
        })
}

fn extract_tag_text(text: &str, tag: &str) -> Option<String> {
    let start_tag = format!("<{tag}>");
    let end_tag = format!("</{tag}>");
    let start = text.find(&start_tag)? + start_tag.len();
    let end = text[start..].find(&end_tag)? + start;
    Some(text[start..end].to_string())
}

fn clean_path_candidate(value: impl AsRef<str>) -> Option<String> {
    let candidate = value.as_ref().trim().trim_matches(|ch: char| {
        matches!(
            ch,
            '`' | '\'' | '"' | ',' | ';' | ':' | ')' | ']' | '}' | '(' | '[' | '{'
        )
    });
    looks_like_path(candidate).then(|| candidate.to_string())
}

fn looks_like_path(value: &str) -> bool {
    if value.is_empty() || value.contains('\n') {
        return false;
    }
    value.starts_with('/')
        || value.starts_with("./")
        || value.starts_with("../")
        || value.starts_with("file://")
        || value.contains('/')
}

fn acp_tool_input(update: &Value) -> ActionInput {
    ActionInput {
        summary: tool_title(update),
        raw: Some(json_string(update)),
    }
}

fn acp_action_kind(update: &Value) -> ActionKind {
    acp_tool_action_kind(update)
}

fn acp_tool_output_snapshot(update: &Value) -> Vec<ActionOutputDelta> {
    let Some(content) = update.get("content") else {
        return Vec::new();
    };
    if let Some(items) = content.as_array() {
        return items.iter().filter_map(tool_content_delta).collect();
    }
    tool_content_delta(content).into_iter().collect()
}

fn acp_tool_output_deltas(
    engine: &AngelEngine,
    conversation_id: &ConversationId,
    action_id: &ActionId,
    update: &Value,
) -> Vec<ActionOutputDelta> {
    let snapshot = acp_tool_output_snapshot(update);
    let Some(previous) = existing_action_output(engine, conversation_id, action_id) else {
        return snapshot;
    };
    snapshot_delta(previous, snapshot)
}

fn existing_action_output<'a>(
    engine: &'a AngelEngine,
    conversation_id: &ConversationId,
    action_id: &ActionId,
) -> Option<&'a [ActionOutputDelta]> {
    engine
        .conversations
        .get(conversation_id)
        .and_then(|conversation| conversation.actions.get(action_id))
        .map(|action| action.output.chunks.as_slice())
}

fn snapshot_delta(
    previous: &[ActionOutputDelta],
    snapshot: Vec<ActionOutputDelta>,
) -> Vec<ActionOutputDelta> {
    if previous.is_empty() || snapshot.is_empty() {
        return snapshot;
    }
    if snapshot.starts_with(previous) {
        return snapshot[previous.len()..].to_vec();
    }
    if let Some(delta) = text_snapshot_suffix(previous, &snapshot) {
        return delta;
    }
    snapshot
}

fn text_snapshot_suffix(
    previous: &[ActionOutputDelta],
    snapshot: &[ActionOutputDelta],
) -> Option<Vec<ActionOutputDelta>> {
    let [next] = snapshot else {
        return None;
    };
    let next_text = action_output_delta_text(next)?;
    let previous_text = previous
        .iter()
        .map(action_output_delta_text)
        .collect::<Option<Vec<_>>>()?
        .join("");
    let suffix = next_text.strip_prefix(&previous_text)?;
    if suffix.is_empty() {
        return Some(Vec::new());
    }
    Some(vec![action_output_delta_with_text(
        next,
        suffix.to_string(),
    )])
}

fn action_output_delta_text(delta: &ActionOutputDelta) -> Option<&str> {
    match delta {
        ActionOutputDelta::Text(text) => Some(text),
        _ => None,
    }
}

fn action_output_delta_with_text(template: &ActionOutputDelta, text: String) -> ActionOutputDelta {
    match template {
        ActionOutputDelta::Text(_) => ActionOutputDelta::Text(text),
        ActionOutputDelta::Patch(_) => ActionOutputDelta::Patch(text),
        ActionOutputDelta::Terminal(_) => ActionOutputDelta::Terminal(text),
        ActionOutputDelta::Structured(_) => ActionOutputDelta::Structured(text),
    }
}

fn tool_content_delta(value: &Value) -> Option<ActionOutputDelta> {
    match value.get("type").and_then(Value::as_str) {
        Some("content") => value
            .get("content")
            .map(content_block_action_delta)
            .or_else(|| Some(ActionOutputDelta::Structured(json_string(value)))),
        Some("diff") => Some(ActionOutputDelta::Patch(acp_diff_text(value))),
        Some("terminal") => value
            .get("terminalId")
            .and_then(Value::as_str)
            .map(|terminal_id| ActionOutputDelta::Terminal(terminal_id.to_string()))
            .or_else(|| Some(ActionOutputDelta::Structured(json_string(value)))),
        Some("text") => content_text(value).map(ActionOutputDelta::Text),
        Some(_) => Some(ActionOutputDelta::Structured(json_string(value))),
        None => content_text(value)
            .map(ActionOutputDelta::Text)
            .or_else(|| Some(ActionOutputDelta::Structured(json_string(value)))),
    }
}

fn content_block_action_delta(value: &Value) -> ActionOutputDelta {
    content_text(value)
        .map(ActionOutputDelta::Text)
        .unwrap_or_else(|| ActionOutputDelta::Structured(json_string(value)))
}

fn acp_diff_text(value: &Value) -> String {
    let path = value
        .get("path")
        .and_then(Value::as_str)
        .unwrap_or("<unknown>");
    let old_text = value
        .get("oldText")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let new_text = value
        .get("newText")
        .and_then(Value::as_str)
        .unwrap_or_default();
    format!("diff -- {path}\n--- old\n{old_text}\n+++ new\n{new_text}")
}

fn acp_tool_error(update: &Value, status: AcpToolStatus) -> Option<angel_engine::ErrorInfo> {
    if status != AcpToolStatus::Failed {
        return None;
    }
    let message = update
        .get("error")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| update.get("rawOutput").map(json_string))
        .or_else(|| update.get("content").and_then(content_text))
        .unwrap_or_else(|| "ACP tool call failed".to_string());
    Some(angel_engine::ErrorInfo::new(
        "acp.tool_call_failed",
        message,
    ))
}

fn push_tool_action_updates(
    output: &mut TransportOutput,
    conversation_id: ConversationId,
    action_id: ActionId,
    phase: Option<ActionPhase>,
    title: Option<String>,
    error: Option<angel_engine::ErrorInfo>,
    deltas: Vec<ActionOutputDelta>,
) {
    if deltas.is_empty() {
        output.events.push(EngineEvent::ActionUpdated {
            conversation_id,
            action_id,
            patch: ActionPatch {
                phase,
                output_delta: None,
                error,
                title,
            },
        });
        return;
    }
    for (index, delta) in deltas.into_iter().enumerate() {
        output.events.push(EngineEvent::ActionUpdated {
            conversation_id: conversation_id.clone(),
            action_id: action_id.clone(),
            patch: ActionPatch {
                phase: (index == 0).then(|| phase.clone()).flatten(),
                output_delta: Some(delta),
                error: (index == 0).then(|| error.clone()).flatten(),
                title: (index == 0).then(|| title.clone()).flatten(),
            },
        });
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
        let mut engine =
            AngelEngine::new(angel_engine::ProtocolFlavor::Acp, adapter.capabilities());
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
        let mut engine =
            AngelEngine::new(angel_engine::ProtocolFlavor::Acp, adapter.capabilities());
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
        let mut engine =
            AngelEngine::new(angel_engine::ProtocolFlavor::Acp, adapter.capabilities());
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
        let mut engine =
            AngelEngine::new(angel_engine::ProtocolFlavor::Acp, adapter.capabilities());
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

    #[test]
    fn agent_message_chunk_maps_resource_link_to_resource_ref() {
        let adapter = AcpAdapter::standard();
        let mut engine =
            AngelEngine::new(angel_engine::ProtocolFlavor::Acp, adapter.capabilities());
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
        let mut engine =
            AngelEngine::new(angel_engine::ProtocolFlavor::Acp, adapter.capabilities());
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

    #[test]
    fn tool_call_update_trims_cumulative_text_snapshots() {
        let adapter = AcpAdapter::standard();
        let mut engine =
            AngelEngine::new(angel_engine::ProtocolFlavor::Acp, adapter.capabilities());
        let conversation_id = ready_conversation(&adapter, &mut engine);
        start_ready_turn(&mut engine, &conversation_id);

        let output = adapter
            .decode_notification(
                &engine,
                "session/update",
                &json!({
                    "sessionId": "sess",
                    "update": {
                        "sessionUpdate": "tool_call",
                        "toolCallId": "call-1",
                        "kind": "execute",
                        "status": "in_progress",
                        "content": [
                            {
                                "type": "content",
                                "content": {
                                    "type": "text",
                                    "text": "x\n"
                                }
                            }
                        ]
                    }
                }),
            )
            .expect("tool call");
        assert!(matches!(
            output.events.as_slice(),
            [EngineEvent::ActionObserved { action, .. }]
                if action.output.chunks == vec![ActionOutputDelta::Text("x\n".to_string())]
        ));
        apply_events(&mut engine, output.events);

        let output = adapter
            .decode_notification(
                &engine,
                "session/update",
                &json!({
                    "sessionId": "sess",
                    "update": {
                        "sessionUpdate": "tool_call_update",
                        "toolCallId": "call-1",
                        "status": "in_progress",
                        "content": [
                            {
                                "type": "content",
                                "content": {
                                    "type": "text",
                                    "text": "x\nxx\n"
                                }
                            }
                        ]
                    }
                }),
            )
            .expect("tool update");
        assert!(matches!(
            output.events.as_slice(),
            [EngineEvent::ActionUpdated { patch, .. }]
                if patch.output_delta == Some(ActionOutputDelta::Text("xx\n".to_string()))
        ));
        apply_events(&mut engine, output.events);

        let output = adapter
            .decode_notification(
                &engine,
                "session/update",
                &json!({
                    "sessionId": "sess",
                    "update": {
                        "sessionUpdate": "tool_call_update",
                        "toolCallId": "call-1",
                        "status": "completed",
                        "content": [
                            {
                                "type": "content",
                                "content": {
                                    "type": "text",
                                    "text": "x\nxx\n"
                                }
                            }
                        ]
                    }
                }),
            )
            .expect("tool completed");
        assert!(matches!(
            output.events.as_slice(),
            [EngineEvent::ActionUpdated { patch, .. }]
                if patch.phase == Some(ActionPhase::Completed)
                    && patch.output_delta.is_none()
        ));
        apply_events(&mut engine, output.events);

        let action = engine
            .conversations
            .get(&conversation_id)
            .and_then(|conversation| conversation.actions.get(&ActionId::new("call-1")))
            .expect("action");
        assert_eq!(
            action.output.chunks,
            vec![
                ActionOutputDelta::Text("x\n".to_string()),
                ActionOutputDelta::Text("xx\n".to_string())
            ]
        );
    }

    #[test]
    fn tool_call_update_preserves_non_cumulative_snapshots() {
        let adapter = AcpAdapter::standard();
        let mut engine =
            AngelEngine::new(angel_engine::ProtocolFlavor::Acp, adapter.capabilities());
        let conversation_id = ready_conversation(&adapter, &mut engine);
        let turn_id = start_ready_turn(&mut engine, &conversation_id);
        let mut action = ActionState::new(ActionId::new("call-1"), turn_id, ActionKind::Command);
        action.output.chunks = vec![ActionOutputDelta::Text("old".to_string())];
        engine
            .apply_event(EngineEvent::ActionObserved {
                conversation_id: conversation_id.clone(),
                action,
            })
            .expect("action observed");

        let output = adapter
            .decode_notification(
                &engine,
                "session/update",
                &json!({
                    "sessionId": "sess",
                    "update": {
                        "sessionUpdate": "tool_call_update",
                        "toolCallId": "call-1",
                        "status": "completed",
                        "content": [
                            {
                                "type": "content",
                                "content": {
                                    "type": "text",
                                    "text": "new"
                                }
                            }
                        ]
                    }
                }),
            )
            .expect("tool update");

        assert!(matches!(
            output.events.as_slice(),
            [EngineEvent::ActionUpdated { patch, .. }]
                if patch.output_delta == Some(ActionOutputDelta::Text("new".to_string()))
        ));
    }

    #[test]
    fn read_tool_update_prefers_output_path_for_display_title() {
        let adapter = AcpAdapter::standard();
        let mut engine =
            AngelEngine::new(angel_engine::ProtocolFlavor::Acp, adapter.capabilities());
        let conversation_id = ready_conversation(&adapter, &mut engine);
        start_ready_turn(&mut engine, &conversation_id);

        let output = adapter
            .decode_notification(
                &engine,
                "session/update",
                &json!({
                    "sessionId": "sess",
                    "update": {
                        "sessionUpdate": "tool_call",
                        "toolCallId": "read-1",
                        "title": "Read file: project-root",
                        "kind": "read",
                        "status": "in_progress"
                    }
                }),
            )
            .expect("tool call");
        apply_events(&mut engine, output.events);

        let output = adapter
            .decode_notification(
                &engine,
                "session/update",
                &json!({
                    "sessionId": "sess",
                    "update": {
                        "sessionUpdate": "tool_call_update",
                        "toolCallId": "read-1",
                        "title": "Read file: project-root",
                        "kind": "read",
                        "status": "completed",
                        "content": [
                            {
                                "type": "content",
                                "content": {
                                    "type": "text",
                                    "text": "/tmp/project/src/edit-me.txt\n"
                                }
                            }
                        ]
                    }
                }),
            )
            .expect("tool update");

        assert!(matches!(
            output.events.as_slice(),
            [EngineEvent::ActionUpdated { patch, .. }]
                if patch.title.as_deref() == Some("Read file: /tmp/project/src/edit-me.txt")
        ));
    }

    fn ready_conversation(adapter: &AcpAdapter, engine: &mut AngelEngine) -> ConversationId {
        let conversation_id = ConversationId::new("conv");
        engine
            .apply_event(EngineEvent::ConversationProvisionStarted {
                id: conversation_id.clone(),
                remote: RemoteConversationId::Pending("conv".to_string()),
                op: angel_engine::ProvisionOp::New,
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
                remote: angel_engine::RemoteTurnId::Local("remote-turn".to_string()),
                input: Vec::new(),
            })
            .expect("turn started");
        turn_id
    }

    fn apply_events(engine: &mut AngelEngine, events: Vec<EngineEvent>) {
        for event in events {
            engine.apply_event(event).expect("apply event");
        }
    }
}
