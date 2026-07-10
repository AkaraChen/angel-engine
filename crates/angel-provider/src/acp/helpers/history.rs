use super::super::*;
use super::tool::{acp_tool_action_kind, acp_tool_status};
use super::{acp_tool_history_payload, content_text, json_string};

pub(crate) fn acp_tool_history_entry(update: &Value) -> Option<HistoryReplayEntry> {
    let payload = acp_tool_history_payload(update)?;
    Some(HistoryReplayEntry {
        role: HistoryRole::Tool,
        content: ContentDelta::Structured(json_string(&payload)),
        tool: Some(acp_tool_history_action(&payload)),
    })
}

fn acp_tool_history_action(value: &Value) -> HistoryReplayToolAction {
    let phase = value
        .get("status")
        .and_then(Value::as_str)
        .map(acp_tool_status)
        .map(AcpAdapter::tool_status_to_phase)
        .unwrap_or(ActionPhase::Running);
    let title = value
        .get("title")
        .and_then(Value::as_str)
        .map(str::to_string);
    let output = acp_tool_history_output(
        value
            .get("content")
            .or_else(|| value.get("rawOutput"))
            .unwrap_or(&Value::Null),
    );
    let output_text = output
        .iter()
        .filter_map(|chunk| match chunk {
            ActionOutputDelta::Text(text) | ActionOutputDelta::Terminal(text) => {
                Some(text.as_str())
            }
            ActionOutputDelta::Patch(_) | ActionOutputDelta::Structured(_) => None,
        })
        .collect::<Vec<_>>()
        .join("");
    let error = if phase == ActionPhase::Failed {
        Some(ErrorInfo::new(
            "acp.tool_call_failed",
            value
                .get("error")
                .and_then(Value::as_str)
                .map(str::to_string)
                .or_else(|| (!output_text.trim().is_empty()).then_some(output_text))
                .unwrap_or_else(|| "ACP tool call failed".to_string()),
        ))
    } else {
        None
    };
    HistoryReplayToolAction {
        id: value
            .get("toolCallId")
            .or_else(|| value.get("id"))
            .and_then(Value::as_str)
            .map(str::to_string),
        kind: Some(acp_history_action_kind(
            value.get("kind").and_then(Value::as_str),
        )),
        phase,
        title: title.clone(),
        input_summary: title,
        raw_input: value.get("rawInput").map(|raw| {
            raw.as_str()
                .map_or_else(|| json_string(raw), str::to_string)
        }),
        output,
        error,
    }
}

fn acp_history_action_kind(kind: Option<&str>) -> ActionKind {
    let mut value = serde_json::Map::new();
    if let Some(kind) = kind {
        value.insert("kind".to_string(), json!(kind));
    }
    acp_tool_action_kind(&Value::Object(value))
}

fn acp_tool_history_output(value: &Value) -> Vec<ActionOutputDelta> {
    match value {
        Value::Null => Vec::new(),
        Value::Array(items) => items.iter().flat_map(acp_tool_history_output).collect(),
        Value::String(text) => vec![ActionOutputDelta::Text(text.clone())],
        Value::Bool(value) => vec![ActionOutputDelta::Text(value.to_string())],
        Value::Number(value) => vec![ActionOutputDelta::Text(value.to_string())],
        Value::Object(_) => acp_tool_history_output_object(value),
    }
}

fn acp_tool_history_output_object(value: &Value) -> Vec<ActionOutputDelta> {
    match value.get("type").and_then(Value::as_str) {
        Some("content") => value
            .get("content")
            .map(acp_tool_history_output)
            .filter(|output| !output.is_empty())
            .unwrap_or_else(|| vec![ActionOutputDelta::Structured(json_string(value))]),
        Some("diff") => vec![ActionOutputDelta::Patch(acp_history_diff_text(value))],
        Some("terminal") => vec![ActionOutputDelta::Terminal(
            value
                .get("terminalId")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
        )],
        Some("patch") => vec![ActionOutputDelta::Patch(
            content_text(value).unwrap_or_else(|| json_string(value)),
        )],
        Some("text") => content_text(value)
            .map(|text| vec![ActionOutputDelta::Text(text)])
            .unwrap_or_else(|| vec![ActionOutputDelta::Structured(json_string(value))]),
        Some(_) | None => content_text(value)
            .map(|text| vec![ActionOutputDelta::Text(text)])
            .unwrap_or_else(|| vec![ActionOutputDelta::Structured(json_string(value))]),
    }
}

fn acp_history_diff_text(value: &Value) -> String {
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
