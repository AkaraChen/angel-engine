use std::fs;
use std::path::{Path, PathBuf};

use angel_engine::event::EngineEvent;
use angel_engine::ids::ConversationId;
use angel_engine::state::{ContentDelta, HistoryReplayEntry, HistoryRole};
use angel_engine::transport::{JsonRpcMessage, TransportLogKind, TransportOutput};
use angel_engine::{AngelEngine, EngineError, PendingRequest};
use serde_json::{Value, json};

use crate::acp::acp_tool_history_entry;
use crate::acp::permission_modes::permission_mode_wire_id;
use crate::acp::wire::AcpSessionUpdateKind;

use super::KimiAdapter;
use super::state::{KimiPermissionMode, kimi_permission_mode_state_for, kimi_plan_mode_state_for};

impl KimiAdapter {
    pub(super) fn append_kimi_local_hydration(
        &self,
        engine: &AngelEngine,
        message: &JsonRpcMessage,
        output: &mut TransportOutput,
    ) -> Result<(), EngineError> {
        if output
            .events
            .iter()
            .any(|event| matches!(event, EngineEvent::HistoryReplayChunk { .. }))
        {
            return Ok(());
        }

        let Some((conversation_id, remote_id)) = kimi_hydrate_response(engine, message) else {
            return Ok(());
        };
        let Some(context_path) = kimi_session_context_path(remote_id) else {
            output.logs.push(angel_engine::TransportLog::new(
                TransportLogKind::State,
                format!("Kimi local history not found for session {remote_id}"),
            ));
            return Ok(());
        };

        let history = fs::read_to_string(&context_path)
            .ok()
            .map(|content| kimi_context_history_entries(&content))
            .unwrap_or_default();
        let mut event_count = 0usize;
        for entry in history {
            output.events.push(EngineEvent::HistoryReplayChunk {
                conversation_id: conversation_id.clone(),
                entry,
            });
            event_count += 1;
        }

        if let Some(state) = kimi_session_state(&context_path)? {
            if let Some(mode_event) = kimi_local_mode_event(&conversation_id, &state) {
                output.events.push(mode_event);
                event_count += 1;
            }
            if let Some(permission_mode_event) =
                kimi_local_permission_mode_event(&conversation_id, &state)?
            {
                output.events.push(permission_mode_event);
                event_count += 1;
            }
            if let Some(plan_entry) = kimi_local_plan_entry(&context_path, &state) {
                output.events.push(EngineEvent::HistoryReplayChunk {
                    conversation_id: conversation_id.clone(),
                    entry: plan_entry,
                });
                event_count += 1;
            }
        }

        output.logs.push(angel_engine::TransportLog::new(
            TransportLogKind::State,
            format!(
                "Kimi local history replayed from {} entries={event_count}",
                context_path.display()
            ),
        ));
        Ok(())
    }
}

fn kimi_hydrate_response<'a>(
    engine: &'a AngelEngine,
    message: &JsonRpcMessage,
) -> Option<(&'a ConversationId, &'a str)> {
    let JsonRpcMessage::Response { id, .. } = message else {
        return None;
    };
    let PendingRequest::ResumeConversation {
        conversation_id,
        hydrate: true,
    } = engine.pending.requests.get(id)?
    else {
        return None;
    };
    let conversation = engine.conversations.get(conversation_id)?;
    let remote_id = conversation.remote.as_protocol_id()?;
    Some((conversation_id, remote_id))
}

fn kimi_session_context_path(remote_id: &str) -> Option<PathBuf> {
    if !kimi_safe_path_component(remote_id) {
        return None;
    }
    let sessions_root = kimi_share_dir()?.join("sessions");
    for work_dir in fs::read_dir(sessions_root).ok()?.flatten() {
        let path = work_dir.path().join(remote_id).join("context.jsonl");
        if path.is_file() {
            return Some(path);
        }
    }
    None
}

fn kimi_safe_path_component(value: &str) -> bool {
    !value.is_empty()
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_'))
}

fn kimi_share_dir() -> Option<PathBuf> {
    if let Some(path) = std::env::var_os("KIMI_SHARE_DIR")
        && !path.is_empty()
    {
        return Some(PathBuf::from(path));
    }
    Some(PathBuf::from(std::env::var_os("HOME")?).join(".kimi"))
}

pub(super) fn kimi_context_history_entries(content: &str) -> Vec<HistoryReplayEntry> {
    content
        .lines()
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
        .flat_map(|value| kimi_context_record_entries(&value))
        .collect()
}

fn kimi_context_record_entries(value: &Value) -> Vec<HistoryReplayEntry> {
    match value.get("role").and_then(Value::as_str) {
        Some("user") => kimi_context_user_entry(value).into_iter().collect(),
        Some("assistant") => kimi_context_assistant_entries(value),
        Some("tool") => kimi_context_tool_entry(value).into_iter().collect(),
        Some(role) if !role.starts_with('_') => {
            kimi_context_text_entry(HistoryRole::Unknown(role.to_string()), value.get("content"))
                .into_iter()
                .collect()
        }
        _ => Vec::new(),
    }
}

fn kimi_context_user_entry(value: &Value) -> Option<HistoryReplayEntry> {
    let text = kimi_content_value_text(value.get("content")?);
    if text.trim().is_empty() || kimi_internal_user_message(&text) {
        return None;
    }
    Some(HistoryReplayEntry {
        role: HistoryRole::User,
        content: ContentDelta::Text(text),
        tool: None,
    })
}

fn kimi_context_assistant_entries(value: &Value) -> Vec<HistoryReplayEntry> {
    let mut entries = Vec::new();
    if let Some(entry) = kimi_context_text_entry(HistoryRole::Assistant, value.get("content")) {
        entries.push(entry);
    }
    if let Some(tool_calls) = value.get("tool_calls").and_then(Value::as_array) {
        entries.extend(tool_calls.iter().filter_map(kimi_tool_call_history_entry));
    }
    entries
}

fn kimi_context_tool_entry(value: &Value) -> Option<HistoryReplayEntry> {
    let tool_call_id = value.get("tool_call_id").and_then(Value::as_str)?;
    if !kimi_safe_path_component(tool_call_id) {
        return None;
    }
    let output = value
        .get("content")
        .map(kimi_content_value_text)
        .unwrap_or_default();
    acp_tool_history_entry(&json!({
        "sessionUpdate": AcpSessionUpdateKind::ToolCallUpdate.wire_value(),
        "toolCallId": tool_call_id,
        "status": agent_client_protocol_schema::ToolCallStatus::Completed,
        "content": [
            {
                "type": "content",
                "content": {
                    "type": "text",
                    "text": output,
                }
            }
        ]
    }))
}

fn kimi_context_text_entry(
    role: HistoryRole,
    content: Option<&Value>,
) -> Option<HistoryReplayEntry> {
    let text = kimi_content_value_text(content?);
    if text.trim().is_empty() {
        return None;
    }
    Some(HistoryReplayEntry {
        role,
        content: ContentDelta::Text(text),
        tool: None,
    })
}

fn kimi_tool_call_history_entry(tool_call: &Value) -> Option<HistoryReplayEntry> {
    let id = tool_call.get("id").and_then(Value::as_str)?;
    if !kimi_safe_path_component(id) {
        return None;
    }
    let function = tool_call.get("function")?;
    let name = function
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or("tool");
    let arguments = function
        .get("arguments")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let raw_input = serde_json::from_str::<Value>(arguments)
        .unwrap_or_else(|_| Value::String(arguments.to_string()));

    let mut payload = serde_json::Map::new();
    payload.insert(
        "sessionUpdate".to_string(),
        AcpSessionUpdateKind::ToolCall.wire_value(),
    );
    payload.insert("toolCallId".to_string(), json!(id));
    payload.insert(
        "title".to_string(),
        json!(kimi_tool_title(name, &raw_input)),
    );
    payload.insert(
        "status".to_string(),
        json!(agent_client_protocol_schema::ToolCallStatus::Pending),
    );
    payload.insert("rawInput".to_string(), raw_input);
    if let Some(kind) = kimi_tool_kind(name) {
        payload.insert("kind".to_string(), json!(kind));
    }

    acp_tool_history_entry(&Value::Object(payload))
}

fn kimi_content_value_text(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Array(items) => items
            .iter()
            .map(kimi_content_value_text)
            .collect::<Vec<_>>()
            .join(""),
        Value::Object(_) => ["text", "content", "summary", "delta", "message"]
            .iter()
            .find_map(|key| value.get(*key))
            .map(kimi_content_value_text)
            .unwrap_or_default(),
        _ => String::new(),
    }
}

fn kimi_internal_user_message(text: &str) -> bool {
    let text = text.trim_start();
    text.starts_with("<system-reminder>") || text.starts_with("<system>")
}

fn kimi_tool_title(name: &str, raw_input: &Value) -> String {
    match name {
        "Shell" => raw_input
            .get("command")
            .and_then(Value::as_str)
            .map(|command| format!("Shell: {command}"))
            .unwrap_or_else(|| "Shell".to_string()),
        "ReadFile" | "WriteFile" | "StrReplaceFile" | "ReadMediaFile" => raw_input
            .get("path")
            .and_then(Value::as_str)
            .map(|path| format!("{name}: {path}"))
            .unwrap_or_else(|| name.to_string()),
        "Glob" | "Grep" => raw_input
            .get("pattern")
            .and_then(Value::as_str)
            .map(|pattern| format!("{name}: {pattern}"))
            .unwrap_or_else(|| name.to_string()),
        _ => name.to_string(),
    }
}

fn kimi_tool_kind(name: &str) -> Option<&'static str> {
    match name {
        "Shell" => Some("execute"),
        "ReadFile" | "ReadMediaFile" => Some("read"),
        "WriteFile" | "StrReplaceFile" => Some("edit"),
        "Glob" | "Grep" => Some("read"),
        "SearchWeb" => Some("search"),
        "FetchURL" | "Agent" => Some("fetch"),
        "EnterPlanMode" | "ExitPlanMode" | "AskUserQuestion" => Some("switch_mode"),
        _ => None,
    }
}

pub(super) fn kimi_session_state(context_path: &Path) -> Result<Option<Value>, EngineError> {
    let Some(parent) = context_path.parent() else {
        return Ok(None);
    };
    let state_path = parent.join("state.json");
    let state = match fs::read_to_string(&state_path) {
        Ok(state) => state,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(EngineError::InvalidState {
                expected: "readable Kimi state.json".to_string(),
                actual: format!("{}: {error}", state_path.display()),
            });
        }
    };
    serde_json::from_str(&state)
        .map(Some)
        .map_err(|error| EngineError::InvalidState {
            expected: "valid Kimi state.json".to_string(),
            actual: format!("{}: {error}", state_path.display()),
        })
}

pub(super) fn kimi_local_mode_event(
    conversation_id: &ConversationId,
    state: &Value,
) -> Option<EngineEvent> {
    let plan_mode = state.get("plan_mode")?.as_bool()?;
    Some(EngineEvent::SessionModesUpdated {
        conversation_id: conversation_id.clone(),
        modes: kimi_plan_mode_state_for(if plan_mode {
            "plan".to_string()
        } else {
            "default".to_string()
        }),
    })
}

pub(super) fn kimi_local_permission_mode_event(
    conversation_id: &ConversationId,
    state: &Value,
) -> Result<Option<EngineEvent>, EngineError> {
    let Some(approval) = state.get("approval") else {
        return Ok(None);
    };
    let Some(yolo) = approval.get("yolo") else {
        return Ok(None);
    };
    let Some(yolo) = yolo.as_bool() else {
        return Err(EngineError::InvalidState {
            expected: "Kimi state approval.yolo boolean".to_string(),
            actual: yolo.to_string(),
        });
    };

    let mode = if yolo {
        KimiPermissionMode::Yolo
    } else {
        KimiPermissionMode::Default
    };
    Ok(Some(EngineEvent::SessionPermissionModesUpdated {
        conversation_id: conversation_id.clone(),
        modes: kimi_permission_mode_state_for(permission_mode_wire_id(mode)),
    }))
}

pub(super) fn kimi_local_plan_entry(
    context_path: &Path,
    state: &Value,
) -> Option<HistoryReplayEntry> {
    let slug = state.get("plan_slug").and_then(Value::as_str)?;
    if !kimi_safe_path_component(slug) {
        return None;
    }
    let share_dir = kimi_share_dir_from_context_path(context_path)?;
    let path = share_dir.join("plans").join(format!("{slug}.md"));
    let text = fs::read_to_string(&path).ok()?;
    if text.trim().is_empty() {
        return None;
    }
    Some(HistoryReplayEntry {
        role: HistoryRole::Assistant,
        content: ContentDelta::Structured(
            json!({
                "type": "plan",
                "path": path.to_string_lossy(),
                "markdown": text,
            })
            .to_string(),
        ),
        tool: None,
    })
}

fn kimi_share_dir_from_context_path(context_path: &Path) -> Option<PathBuf> {
    for ancestor in context_path.ancestors() {
        if ancestor.file_name().and_then(|name| name.to_str()) == Some("sessions") {
            return ancestor.parent().map(Path::to_path_buf);
        }
    }
    None
}
