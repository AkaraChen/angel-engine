use super::super::super::actions::{
    action_from_item, completed_phase_from_item, dynamic_tool_has_input_payload,
    dynamic_tool_is_host_capability, dynamic_tool_is_output_only, normalize_action_item_title,
};
use super::super::super::requests::host_capability_options;
use super::super::super::summaries::{plan_item_content, plan_item_saved_path};
use super::super::*;

pub(super) fn codex_history_replay_item(item: &Value) -> &Value {
    if item.get("type").and_then(Value::as_str) == Some("response_item") {
        if let Some(payload) = item.get("payload").filter(|payload| payload.is_object()) {
            return payload;
        }
    }
    item
}

pub(super) fn codex_history_replay_tool_item(item: &Value) -> Value {
    let mut replay_item = item.clone();
    let Value::Object(fields) = &mut replay_item else {
        return replay_item;
    };
    let item_type = fields
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    if codex_history_replay_tool_uses_call_id(&item_type) {
        if let Some(call_id) = string_field(fields, &["callId", "call_id"]) {
            if let Some(original_id) = fields
                .get("id")
                .and_then(Value::as_str)
                .filter(|id| *id != call_id)
                .map(str::to_string)
            {
                fields
                    .entry("itemId".to_string())
                    .or_insert_with(|| Value::String(original_id));
            }
            fields.insert("id".to_string(), Value::String(call_id));
        }
    }

    fields
        .entry("status".to_string())
        .or_insert_with(|| Value::String("completed".to_string()));
    normalize_host_capability_history_tool_item(&mut replay_item);
    normalize_action_item_title(&mut replay_item);
    replay_item
}

pub(super) fn codex_history_replay_tool_action(item: &Value) -> Option<HistoryReplayToolAction> {
    let item_type = item.get("type").and_then(Value::as_str)?;
    let fallback_turn_id = TurnId::new("history".to_string());
    let action = action_from_item(item, &fallback_turn_id);
    let kind = action
        .as_ref()
        .map(|action| action.kind.clone())
        .or_else(|| codex_history_tool_kind(item));
    let phase = action
        .as_ref()
        .and_then(|action| completed_phase_from_item(item, &action.kind))
        .or_else(|| {
            item.get("status")
                .and_then(Value::as_str)
                .and_then(codex_history_status_to_phase)
        })
        .unwrap_or_else(|| match item_type {
            "function_call_output" | "custom_tool_call_output" | "tool_search_output" => {
                ActionPhase::Completed
            }
            _ => ActionPhase::Completed,
        });
    let title = action
        .as_ref()
        .and_then(|action| action.title.clone())
        .or_else(|| first_item_string(item, &["title"]));
    let output = codex_history_tool_output(item);
    let id = first_item_string(item, &["id", "callId", "call_id", "itemId"])
        .unwrap_or_else(|| codex_history_missing_tool_id(item_type, item));
    Some(HistoryReplayToolAction {
        id: Some(id),
        kind,
        phase,
        title: title.clone(),
        input_summary: first_item_string(item, &["inputSummary", "input_summary"]).or(title),
        raw_input: codex_history_tool_raw_input(item),
        output,
        error: None,
    })
}

fn codex_history_missing_tool_id(item_type: &str, item: &Value) -> String {
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in item.to_string().as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("codex-history-{item_type}-{hash:016x}")
}

fn codex_history_tool_kind(item: &Value) -> Option<ActionKind> {
    let kind = match item.get("type").and_then(Value::as_str)? {
        "commandExecution" | "local_shell_call" => ActionKind::Command,
        "fileChange" => ActionKind::FileChange,
        "mcpToolCall" | "mcp_call" => ActionKind::McpTool,
        "dynamicToolCall" if dynamic_tool_is_host_capability(item) => ActionKind::HostCapability,
        "dynamicToolCall" | "tool_search_call" => ActionKind::DynamicTool,
        "webSearch" | "web_search_call" => ActionKind::WebSearch,
        "imageView" | "imageGeneration" => ActionKind::Media,
        "contextCompaction" => ActionKind::Reasoning,
        "function_call" => {
            if is_codex_command_tool_name(first_item_string(item, &["name"]).as_deref()) {
                ActionKind::Command
            } else {
                ActionKind::DynamicTool
            }
        }
        "custom_tool_call" => {
            if first_item_string(item, &["name"]).as_deref() == Some("apply_patch") {
                ActionKind::FileChange
            } else {
                ActionKind::DynamicTool
            }
        }
        "computer_call" => ActionKind::HostCapability,
        _ => return None,
    };
    Some(kind)
}

fn codex_history_status_to_phase(status: &str) -> Option<ActionPhase> {
    match status {
        "completed" => Some(ActionPhase::Completed),
        "failed" => Some(ActionPhase::Failed),
        "declined" => Some(ActionPhase::Declined),
        "cancelled" | "canceled" | "interrupted" => Some(ActionPhase::Cancelled),
        "pending" | "proposed" => Some(ActionPhase::Proposed),
        "inProgress" => Some(ActionPhase::Running),
        "streamingResult" => Some(ActionPhase::StreamingResult),
        _ => None,
    }
}

fn codex_history_tool_raw_input(item: &Value) -> Option<String> {
    if let Some(raw_input) = item.get("rawInput").or_else(|| item.get("raw_input")) {
        return Some(
            raw_input
                .as_str()
                .map_or_else(|| raw_input.to_string(), str::to_string),
        );
    }
    match item.get("type").and_then(Value::as_str) {
        Some("function_call") => first_item_string(item, &["arguments"])
            .or_else(|| item.get("arguments").map(Value::to_string)),
        Some("custom_tool_call") => Some(item.to_string()),
        Some("dynamicToolCall") if dynamic_tool_is_output_only(item) => None,
        Some("function_call_output" | "custom_tool_call_output" | "tool_search_output") => None,
        _ => Some(item.to_string()),
    }
}

fn codex_history_tool_output(item: &Value) -> Vec<ActionOutputDelta> {
    [
        "output",
        "result",
        "content",
        "contentItems",
        "content_items",
        "aggregatedOutput",
        "stdout",
        "stderr",
    ]
    .iter()
    .find_map(|key| item.get(*key))
    .map(codex_history_output_value)
    .unwrap_or_default()
}

fn codex_history_output_value(value: &Value) -> Vec<ActionOutputDelta> {
    match value {
        Value::Null => Vec::new(),
        Value::Array(items) => items.iter().flat_map(codex_history_output_value).collect(),
        Value::String(text) => vec![ActionOutputDelta::Text(codex_history_output_text(text))],
        Value::Bool(value) => vec![ActionOutputDelta::Text(value.to_string())],
        Value::Number(value) => vec![ActionOutputDelta::Text(value.to_string())],
        Value::Object(_) => {
            if matches!(
                value.get("type").and_then(Value::as_str),
                Some("inputText" | "outputText" | "text")
            ) {
                if let Some(text) = value.get("text").and_then(Value::as_str) {
                    return vec![ActionOutputDelta::Text(text.to_string())];
                }
            }
            vec![ActionOutputDelta::Structured(value.to_string())]
        }
    }
}

fn codex_history_output_text(text: &str) -> String {
    serde_json::from_str::<Value>(text)
        .ok()
        .and_then(|value| {
            value
                .get("output")
                .or_else(|| value.get("text"))
                .or_else(|| value.get("content"))
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_else(|| text.to_string())
}

fn is_codex_command_tool_name(name: Option<&str>) -> bool {
    matches!(name, Some("shell" | "exec_command" | "write_stdin"))
}

pub(super) fn codex_history_replay_plan_item(item: &Value) -> Option<Value> {
    let entries = codex_history_replay_plan_entries(item);
    let text = plan_item_content(item).unwrap_or_default();
    let path = plan_item_saved_path(item);
    if entries.is_empty() && text.trim().is_empty() && path.is_none() {
        return None;
    }

    let mut plan = serde_json::Map::new();
    plan.insert("type".to_string(), Value::String("plan".to_string()));
    plan.insert("entries".to_string(), Value::Array(entries));
    plan.insert("text".to_string(), Value::String(text));
    if let Some(path) = path {
        plan.insert("path".to_string(), Value::String(path));
    }
    Some(Value::Object(plan))
}

fn codex_history_replay_plan_entries(item: &Value) -> Vec<Value> {
    ["entries", "plan", "steps"]
        .iter()
        .find_map(|key| item.get(*key).and_then(Value::as_array))
        .map(|entries| {
            entries
                .iter()
                .filter_map(codex_history_replay_plan_entry)
                .collect()
        })
        .unwrap_or_default()
}

fn codex_history_replay_plan_entry(entry: &Value) -> Option<Value> {
    let content = match entry {
        Value::String(content) => content.clone(),
        Value::Object(_) => entry
            .get("content")
            .or_else(|| entry.get("text"))
            .or_else(|| entry.get("step"))
            .and_then(Value::as_str)?
            .to_string(),
        _ => return None,
    };
    if content.trim().is_empty() {
        return None;
    }

    let status = match entry.get("status").and_then(Value::as_str) {
        Some("completed" | "Completed") => PlanEntryStatus::Completed,
        Some("in_progress" | "inProgress" | "InProgress") => PlanEntryStatus::InProgress,
        _ => PlanEntryStatus::Pending,
    };
    Some(json!({
        "content": content,
        "status": status,
    }))
}

fn codex_history_replay_tool_uses_call_id(item_type: &str) -> bool {
    matches!(
        item_type,
        "dynamicToolCall"
            | "function_call"
            | "function_call_output"
            | "custom_tool_call"
            | "custom_tool_call_output"
            | "tool_search_call"
            | "tool_search_output"
    )
}

fn normalize_host_capability_history_tool_item(replay_item: &mut Value) {
    if replay_item.get("type").and_then(Value::as_str) != Some("dynamicToolCall")
        || !dynamic_tool_is_host_capability(replay_item)
    {
        return;
    }

    let has_input_payload = dynamic_tool_has_input_payload(replay_item);
    {
        let Value::Object(fields) = replay_item else {
            return;
        };
        fields
            .entry("kind".to_string())
            .or_insert_with(|| Value::String("hostCapability".to_string()));
        if !has_input_payload {
            return;
        }

        if let Some(arguments) = fields
            .get("arguments")
            .and_then(Value::as_str)
            .and_then(|arguments| serde_json::from_str::<Value>(arguments).ok())
        {
            fields.insert("arguments".to_string(), arguments);
        }
    }

    let options = host_capability_options(replay_item);
    let title = options
        .title
        .clone()
        .unwrap_or_else(|| "User input requested".to_string());
    let input_summary = host_capability_input_summary(&options);
    let raw_input = host_capability_elicitation_input(replay_item, &options);
    let Value::Object(fields) = replay_item else {
        return;
    };
    if !title.trim().is_empty() {
        fields
            .entry("title".to_string())
            .or_insert_with(|| Value::String(title));
    }
    if let Some(input_summary) = input_summary {
        fields
            .entry("inputSummary".to_string())
            .or_insert_with(|| Value::String(input_summary.clone()));
        fields.entry("rawInput".to_string()).or_insert(raw_input);
    }
}

fn host_capability_input_summary(options: &ElicitationOptions) -> Option<String> {
    if let Some(body) = options.body.as_ref().filter(|body| !body.trim().is_empty()) {
        return Some(body.clone());
    }
    let questions = options
        .questions
        .iter()
        .map(|question| {
            if question.question.trim().is_empty() {
                question.header.as_str()
            } else {
                question.question.as_str()
            }
        })
        .filter(|text| !text.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    (!questions.is_empty()).then_some(questions)
}

fn host_capability_elicitation_input(item: &Value, options: &ElicitationOptions) -> Value {
    json!({
        "actionId": first_item_string(item, &["callId", "id", "call_id", "itemId"]),
        "body": options.body,
        "choices": options.choices,
        "id": first_item_string(item, &["id", "callId", "call_id", "itemId"])
            .unwrap_or_else(|| "hostCapability".to_string()),
        "kind": "userInput",
        "phase": "open",
        "questions": options.questions.iter().map(|question| {
            json!({
                "header": question.header,
                "id": question.id,
                "isOther": question.is_other,
                "isSecret": question.is_secret,
                "options": question.options.iter().map(|option| {
                    json!({
                        "description": option.description,
                        "label": option.label,
                    })
                }).collect::<Vec<_>>(),
                "question": question.question,
            })
        }).collect::<Vec<_>>(),
        "title": options.title,
        "turnId": first_item_string(item, &["turnId", "turn_id"]),
    })
}

fn first_item_string(item: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| item.get(*key).and_then(Value::as_str))
        .map(str::to_string)
}

fn string_field(fields: &serde_json::Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| fields.get(*key).and_then(Value::as_str))
        .map(str::to_string)
}

pub(super) fn codex_history_replay_tool_item_type(item_type: &str) -> bool {
    matches!(
        item_type,
        "commandExecution"
            | "fileChange"
            | "mcpToolCall"
            | "dynamicToolCall"
            | "webSearch"
            | "imageView"
            | "imageGeneration"
            | "contextCompaction"
            | "function_call"
            | "function_call_output"
            | "custom_tool_call"
            | "custom_tool_call_output"
            | "local_shell_call"
            | "mcp_call"
            | "computer_call"
            | "web_search_call"
            | "tool_search_call"
            | "tool_search_output"
    )
}
