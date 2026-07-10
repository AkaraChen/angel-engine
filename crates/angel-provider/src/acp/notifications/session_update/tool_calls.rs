use angel_engine::*;
use serde_json::Value;

use super::super::super::helpers::*;
use super::super::super::{AcpAdapter, AcpToolStatus};

pub(super) fn tool_call(
    adapter: &AcpAdapter,
    engine: &AngelEngine,
    conversation_id: ConversationId,
    turn_id: TurnId,
    update: &Value,
) -> Result<TransportOutput, angel_engine::EngineError> {
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
        let deltas = acp_tool_output_deltas(engine, &conversation_id, &existing_action_id, update);
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

pub(super) fn tool_call_update(
    adapter: &AcpAdapter,
    engine: &AngelEngine,
    conversation_id: ConversationId,
    turn_id: TurnId,
    update: &Value,
) -> Result<TransportOutput, angel_engine::EngineError> {
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
    let mut output =
        TransportOutput::default().log(TransportLogKind::State, format!("tool call {status:?}"));
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
        } else if let Some(existing_action_id) =
            duplicate_active_acp_tool_action_id(engine, &conversation_id, update, &action_id)
        {
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
            let mut action =
                ActionState::new(action_id.clone(), turn_id.clone(), acp_action_kind(update));
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

fn tool_call_id(update: &Value) -> Option<&str> {
    update
        .get("toolCallId")
        .or_else(|| update.get("id"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|id| !id.is_empty())
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
        .and_then(super::super::super::wire::parse_tool_kind);
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
