use self::content::{
    codex_content_delta, codex_content_text, codex_reasoning_text, content_delta_is_empty,
};
use self::tools::{
    codex_history_replay_item, codex_history_replay_plan_item, codex_history_replay_tool_action,
    codex_history_replay_tool_item, codex_history_replay_tool_item_type,
};
use super::*;
use std::{collections::BTreeMap, env, fs, path::PathBuf};

mod content;
mod tools;

pub(super) fn append_local_rollout_history(
    output: &mut TransportOutput,
    conversation_id: &ConversationId,
    thread_id: &str,
) -> bool {
    let Some(path) = find_local_rollout_path(thread_id) else {
        return false;
    };
    let Ok(content) = fs::read_to_string(path) else {
        return false;
    };

    append_local_rollout_history_content(output, conversation_id, &content)
}

pub(super) fn append_local_rollout_history_content(
    output: &mut TransportOutput,
    conversation_id: &ConversationId,
    content: &str,
) -> bool {
    let mut appended = 0usize;
    let mut replay_tool_titles = BTreeMap::new();
    for line in content.lines() {
        let Ok(record) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let Some((role, content, mut tool)) = codex_rollout_history_entry(&record) else {
            continue;
        };
        inherit_replay_tool_title(&mut tool, &mut replay_tool_titles);
        if content_delta_is_empty(&content) {
            continue;
        }
        output.events.push(EngineEvent::HistoryReplayChunk {
            conversation_id: conversation_id.clone(),
            entry: HistoryReplayEntry {
                role,
                content,
                tool,
            },
        });
        appended += 1;
    }

    appended > 0
}

fn find_local_rollout_path(thread_id: &str) -> Option<PathBuf> {
    let codex_home = env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .or_else(|| env::var_os("HOME").map(|home| PathBuf::from(home).join(".codex")))?;
    let sessions_dir = codex_home.join("sessions");
    find_rollout_path_in_dir(&sessions_dir, thread_id)
}

fn find_rollout_path_in_dir(dir: &PathBuf, thread_id: &str) -> Option<PathBuf> {
    let entries = fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = find_rollout_path_in_dir(&path, thread_id) {
                return Some(found);
            }
            continue;
        }
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if name.contains(thread_id) && name.ends_with(".jsonl") {
            return Some(path);
        }
    }
    None
}

fn codex_rollout_history_entry(
    record: &Value,
) -> Option<(HistoryRole, ContentDelta, Option<HistoryReplayToolAction>)> {
    match record.get("type").and_then(Value::as_str)? {
        // Codex rollout also writes chat messages as response_item records; replay that channel only.
        "event_msg" => None,
        "response_item" => {
            let payload = record.get("payload")?;
            match payload.get("type").and_then(Value::as_str) {
                Some("message") if payload.get("role").and_then(Value::as_str) == Some("user") => {
                    if codex_replay_is_internal_user_message(payload) {
                        return None;
                    }
                    Some((HistoryRole::User, codex_content_delta(payload), None))
                }
                Some("message")
                    if payload.get("role").and_then(Value::as_str) == Some("assistant") =>
                {
                    Some((HistoryRole::Assistant, codex_content_delta(payload), None))
                }
                Some("agentMessage") => Some((
                    HistoryRole::Assistant,
                    ContentDelta::Text(
                        payload
                            .get("text")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_string(),
                    ),
                    None,
                )),
                Some("reasoning") => Some((
                    HistoryRole::Reasoning,
                    ContentDelta::Text(codex_reasoning_text(payload)),
                    None,
                )),
                Some(item_type) if codex_history_replay_tool_item_type(item_type) => {
                    let tool_item = codex_history_replay_tool_item(payload);
                    let tool = codex_history_replay_tool_action(&tool_item);
                    Some((
                        HistoryRole::Tool,
                        ContentDelta::Structured(tool_item.to_string()),
                        tool,
                    ))
                }
                _ => None,
            }
        }
        _ => None,
    }
}

fn codex_replay_is_internal_user_message(item: &Value) -> bool {
    // Codex bundles context into user-role messages, sometimes as several
    // content parts in one message (e.g. `<recommended_plugins>` followed by
    // `<environment_context>`). The message is internal only when every text
    // part is an internal block; a single user-authored part keeps the whole
    // message visible.
    let mut saw_text = false;
    for part in item
        .get("content")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let Some(text) = part.get("text").and_then(Value::as_str) else {
            continue;
        };
        saw_text = true;
        if !codex_replay_is_internal_user_text(text.trim()) {
            return false;
        }
    }
    saw_text
}

fn codex_replay_is_internal_user_text(text: &str) -> bool {
    codex_replay_is_environment_context_text(text)
        || codex_replay_is_agents_instructions_text(text)
        || codex_replay_is_turn_aborted_text(text)
        || codex_replay_is_recommended_plugins_text(text)
}

fn codex_replay_is_recommended_plugins_text(text: &str) -> bool {
    text.starts_with("<recommended_plugins>") && text.ends_with("</recommended_plugins>")
}

fn codex_replay_is_environment_context_text(text: &str) -> bool {
    text.starts_with("<environment_context>") && text.ends_with("</environment_context>")
}

fn codex_replay_is_agents_instructions_text(text: &str) -> bool {
    text.starts_with("# AGENTS.md instructions for ")
        && text.contains("\n<INSTRUCTIONS>\n")
        && text.contains("</INSTRUCTIONS>")
}

fn codex_replay_is_turn_aborted_text(text: &str) -> bool {
    // TODO: model Codex turn aborts as a protocol-neutral abort message in angel-engine.
    text == "<turn_aborted>\nThe user interrupted the previous turn on purpose. Any running unified exec processes may still be running in the background. If any tools/commands were aborted, they may have partially executed.\n</turn_aborted>"
}

pub(super) fn append_hydrated_turns(
    output: &mut TransportOutput,
    conversation_id: &ConversationId,
    result: &Value,
) {
    let Some(turns) = result
        .get("thread")
        .and_then(|thread| thread.get("turns"))
        .and_then(Value::as_array)
    else {
        return;
    };

    for turn in turns {
        let mut replay_tool_titles = BTreeMap::new();
        for item in turn
            .get("items")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            let replay_item = codex_history_replay_item(item);
            let (role, content, tool) = match replay_item.get("type").and_then(Value::as_str) {
                Some("userMessage") => {
                    if codex_replay_is_internal_user_message(replay_item) {
                        continue;
                    }
                    (HistoryRole::User, codex_content_delta(replay_item), None)
                }
                Some("message")
                    if replay_item.get("role").and_then(Value::as_str) == Some("user") =>
                {
                    if codex_replay_is_internal_user_message(replay_item) {
                        continue;
                    }
                    (HistoryRole::User, codex_content_delta(replay_item), None)
                }
                Some("message")
                    if replay_item.get("role").and_then(Value::as_str) == Some("assistant") =>
                {
                    (
                        HistoryRole::Assistant,
                        codex_content_delta(replay_item),
                        None,
                    )
                }
                Some("message") => (
                    HistoryRole::Assistant,
                    codex_content_delta(replay_item),
                    None,
                ),
                Some("agentMessage") => (
                    HistoryRole::Assistant,
                    ContentDelta::Text(
                        replay_item
                            .get("text")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_string(),
                    ),
                    None,
                ),
                Some("reasoning") => (
                    HistoryRole::Reasoning,
                    ContentDelta::Text(codex_reasoning_text(replay_item)),
                    None,
                ),
                Some("plan") => {
                    let Some(plan_item) = codex_history_replay_plan_item(replay_item) else {
                        continue;
                    };
                    (
                        HistoryRole::Assistant,
                        ContentDelta::Structured(plan_item.to_string()),
                        None,
                    )
                }
                Some(item_type) if codex_history_replay_tool_item_type(item_type) => {
                    let tool_item = codex_history_replay_tool_item(replay_item);
                    let mut tool = codex_history_replay_tool_action(&tool_item);
                    inherit_replay_tool_title(&mut tool, &mut replay_tool_titles);
                    (
                        HistoryRole::Tool,
                        ContentDelta::Structured(tool_item.to_string()),
                        tool,
                    )
                }
                _ => continue,
            };
            if content_delta_is_empty(&content) {
                continue;
            }
            output.events.push(EngineEvent::HistoryReplayChunk {
                conversation_id: conversation_id.clone(),
                entry: HistoryReplayEntry {
                    role,
                    content,
                    tool,
                },
            });
        }
    }
}

fn inherit_replay_tool_title(
    tool: &mut Option<HistoryReplayToolAction>,
    replay_tool_titles: &mut BTreeMap<String, String>,
) {
    let Some(tool) = tool.as_mut() else {
        return;
    };
    let Some(id) = tool.id.clone() else {
        return;
    };
    let missing_title = tool
        .title
        .as_deref()
        .is_none_or(|title| title.trim().is_empty());
    if missing_title && let Some(title) = replay_tool_titles.get(&id) {
        tool.title = Some(title.clone());
    }
    if let Some(title) = tool.title.as_ref().filter(|title| !title.trim().is_empty()) {
        replay_tool_titles.insert(id, title.clone());
    }
}
