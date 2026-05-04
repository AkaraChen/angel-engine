use serde_json::Value;

use crate::error::ErrorInfo;
use crate::ids::{ActionId, TurnId};
use crate::protocol::ProtocolFlavor;

use super::{
    ActionKind, ActionOutputDelta, ActionPhase, ActionState, ContentDelta, ConversationState,
    ElicitationState, HistoryReplayEntry, HistoryRole, TurnState,
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DisplayMessage {
    pub id: String,
    pub role: DisplayMessageRole,
    pub content: Vec<DisplayMessagePart>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DisplayMessageRole {
    User,
    Assistant,
    Unknown(String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DisplayMessagePart {
    Text {
        kind: DisplayTextPartKind,
        text: String,
    },
    ToolCall {
        action: DisplayToolAction,
    },
}

impl DisplayMessagePart {
    pub fn text(kind: DisplayTextPartKind, text: impl Into<String>) -> Self {
        Self::Text {
            kind,
            text: text.into(),
        }
    }

    pub fn tool(action: DisplayToolAction) -> Self {
        Self::ToolCall { action }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DisplayTextPartKind {
    Text,
    Reasoning,
    Unknown(String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DisplayToolAction {
    pub id: String,
    pub turn_id: Option<TurnId>,
    pub kind: Option<ActionKind>,
    pub phase: ActionPhase,
    pub title: Option<String>,
    pub input_summary: Option<String>,
    pub raw_input: Option<String>,
    pub output_text: String,
    pub output: Vec<ActionOutputDelta>,
    pub error: Option<ErrorInfo>,
}

impl DisplayToolAction {
    pub fn from_action(action: &ActionState) -> Self {
        let output = action.output.chunks.clone();
        Self {
            id: action.id.to_string(),
            turn_id: Some(action.turn_id.clone()),
            kind: Some(action.kind.clone()),
            phase: action.phase.clone(),
            title: action.title.clone(),
            input_summary: action.input.summary.clone(),
            raw_input: action.input.raw.clone(),
            output_text: action_output_text(&output),
            output,
            error: action.error.clone(),
        }
    }

    pub fn from_output_delta(
        turn_id: TurnId,
        action_id: ActionId,
        content: ActionOutputDelta,
    ) -> Self {
        Self {
            id: action_id.to_string(),
            turn_id: Some(turn_id),
            kind: None,
            phase: ActionPhase::StreamingResult,
            title: Some("Tool call".to_string()),
            input_summary: None,
            raw_input: None,
            output_text: action_output_text(std::slice::from_ref(&content)),
            output: vec![content],
            error: None,
        }
    }

    pub fn from_elicitation(elicitation: &ElicitationState) -> Self {
        let input_summary = elicitation.options.body.clone().or_else(|| {
            let questions = elicitation
                .options
                .questions
                .iter()
                .map(|question| {
                    if question.question.is_empty() {
                        question.header.as_str()
                    } else {
                        question.question.as_str()
                    }
                })
                .filter(|text| !text.is_empty())
                .collect::<Vec<_>>()
                .join("\n");
            (!questions.is_empty()).then_some(questions)
        });
        Self {
            id: elicitation.id.to_string(),
            turn_id: elicitation.turn_id.clone(),
            kind: Some(ActionKind::HostCapability),
            phase: ActionPhase::AwaitingDecision {
                elicitation_id: elicitation.id.clone(),
            },
            title: Some(
                elicitation
                    .options
                    .title
                    .clone()
                    .unwrap_or_else(|| "User input requested".to_string()),
            ),
            input_summary,
            raw_input: None,
            output_text: String::new(),
            output: Vec::new(),
            error: None,
        }
    }
}

pub fn conversation_display_messages(
    protocol: ProtocolFlavor,
    conversation: &ConversationState,
) -> Vec<DisplayMessage> {
    let mut messages = Vec::new();

    for (index, entry) in conversation.history.replay.iter().enumerate() {
        append_history_display_message(&mut messages, protocol, entry, index);
    }

    for turn in conversation.turns.values() {
        let input_text = turn_input_text(turn);
        if !input_text.trim().is_empty() {
            messages.push(DisplayMessage {
                id: format!("{}:user", turn.id),
                role: DisplayMessageRole::User,
                content: vec![DisplayMessagePart::text(
                    DisplayTextPartKind::Text,
                    input_text.trim().to_string(),
                )],
            });
        }

        let actions = conversation
            .actions
            .values()
            .filter(|action| action.turn_id == turn.id)
            .collect::<Vec<_>>();
        if let Some(message) = display_message_for_turn(turn, &actions) {
            messages.push(message);
        }
    }

    messages
}

pub fn display_message_for_turn(
    turn: &TurnState,
    actions: &[&ActionState],
) -> Option<DisplayMessage> {
    let content = display_content_from_turn(turn, actions);
    (!content.is_empty()).then(|| DisplayMessage {
        id: format!("{}:assistant", turn.id),
        role: DisplayMessageRole::Assistant,
        content,
    })
}

fn display_content_from_turn(
    turn: &TurnState,
    actions: &[&ActionState],
) -> Vec<DisplayMessagePart> {
    let mut parts = Vec::new();
    append_display_text_part(
        &mut parts,
        DisplayTextPartKind::Reasoning,
        [
            buffer_text(&turn.reasoning.chunks),
            buffer_text(&turn.plan_text.chunks),
        ]
        .into_iter()
        .filter(|text| !text.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n"),
    );
    for action in actions {
        parts.push(DisplayMessagePart::tool(DisplayToolAction::from_action(
            action,
        )));
    }
    append_display_text_part(
        &mut parts,
        DisplayTextPartKind::Text,
        buffer_text(&turn.output.chunks),
    );
    parts
}

fn append_history_display_message(
    messages: &mut Vec<DisplayMessage>,
    protocol: ProtocolFlavor,
    entry: &HistoryReplayEntry,
    index: usize,
) {
    let text = content_delta_text(&entry.content);
    if text.trim().is_empty() {
        return;
    }

    match &entry.role {
        HistoryRole::User => messages.push(DisplayMessage {
            id: format!("history-{index}"),
            role: DisplayMessageRole::User,
            content: vec![DisplayMessagePart::text(DisplayTextPartKind::Text, text)],
        }),
        HistoryRole::Tool => {
            let fallback_id = format!("history-tool-{index}");
            let action = history_tool_action(protocol, &entry.content, fallback_id);
            upsert_display_tool_part(ensure_history_assistant_message(messages), action);
        }
        HistoryRole::Reasoning => append_display_text_part(
            ensure_history_assistant_message(messages),
            DisplayTextPartKind::Reasoning,
            text,
        ),
        HistoryRole::Assistant => append_display_text_part(
            ensure_history_assistant_message(messages),
            DisplayTextPartKind::Text,
            text,
        ),
        HistoryRole::Unknown(role) => append_display_text_part(
            ensure_history_assistant_message(messages),
            DisplayTextPartKind::Unknown(role.clone()),
            text,
        ),
    }
}

fn ensure_history_assistant_message(
    messages: &mut Vec<DisplayMessage>,
) -> &mut Vec<DisplayMessagePart> {
    if messages
        .last()
        .map(|message| message.role == DisplayMessageRole::Assistant)
        .unwrap_or(false)
    {
        return &mut messages.last_mut().expect("last message").content;
    }

    let id = format!("history-{}", messages.len());
    messages.push(DisplayMessage {
        id,
        role: DisplayMessageRole::Assistant,
        content: Vec::new(),
    });
    &mut messages.last_mut().expect("inserted message").content
}

fn append_display_text_part(
    parts: &mut Vec<DisplayMessagePart>,
    kind: DisplayTextPartKind,
    text: String,
) {
    if text.is_empty() {
        return;
    }
    if let Some(DisplayMessagePart::Text {
        kind: last_kind,
        text: existing,
    }) = parts.last_mut()
        && *last_kind == kind
    {
        existing.push_str(&text);
        return;
    }
    parts.push(DisplayMessagePart::text(kind, text));
}

fn upsert_display_tool_part(parts: &mut Vec<DisplayMessagePart>, next: DisplayToolAction) {
    let Some(index) = parts.iter().position(|part| match part {
        DisplayMessagePart::ToolCall { action } => action.id == next.id,
        DisplayMessagePart::Text { .. } => false,
    }) else {
        parts.push(DisplayMessagePart::tool(next));
        return;
    };

    let DisplayMessagePart::ToolCall { action: previous } = parts[index].clone() else {
        parts[index] = DisplayMessagePart::tool(next);
        return;
    };
    parts[index] = DisplayMessagePart::tool(merge_display_tool_actions(previous, next));
}

fn merge_display_tool_actions(
    previous: DisplayToolAction,
    next: DisplayToolAction,
) -> DisplayToolAction {
    let output = if next.output.is_empty() {
        previous.output
    } else {
        next.output
    };
    DisplayToolAction {
        id: next.id,
        turn_id: next.turn_id.or(previous.turn_id),
        kind: next.kind.or(previous.kind),
        phase: next.phase,
        title: next.title.or(previous.title),
        input_summary: next.input_summary.or(previous.input_summary),
        raw_input: next.raw_input.or(previous.raw_input),
        output_text: if next.output_text.trim().is_empty() {
            previous.output_text
        } else {
            next.output_text
        },
        output,
        error: next.error.or(previous.error),
    }
}

fn history_tool_action(
    protocol: ProtocolFlavor,
    content: &ContentDelta,
    fallback_id: String,
) -> DisplayToolAction {
    let raw = content_delta_text(content);
    let value = serde_json::from_str::<Value>(&raw).ok();
    if let Some(value) = value.as_ref() {
        if is_acp_tool_update(value) {
            return acp_history_tool_action(value, fallback_id);
        }
        if is_codex_tool_item(value) || matches!(protocol, ProtocolFlavor::CodexAppServer) {
            return codex_history_tool_action(value, fallback_id);
        }
    }
    DisplayToolAction {
        id: fallback_id,
        turn_id: None,
        kind: None,
        phase: ActionPhase::Completed,
        title: Some("Tool call".to_string()),
        input_summary: None,
        raw_input: Some(raw),
        output_text: String::new(),
        output: Vec::new(),
        error: None,
    }
}

fn is_acp_tool_update(value: &Value) -> bool {
    matches!(
        string_field(value, &["sessionUpdate"]).as_deref(),
        Some("tool_call" | "tool_call_update")
    )
}

fn acp_history_tool_action(value: &Value, fallback_id: String) -> DisplayToolAction {
    let output = action_outputs_from_value(value.get("content").or_else(|| value.get("rawOutput")));
    let output_text = action_output_text(&output);
    let phase = normalize_tool_phase(string_field(value, &["status"]).as_deref());
    let error = if phase == ActionPhase::Failed {
        Some(ErrorInfo::new(
            "acp.tool_call_failed",
            string_field(value, &["error"])
                .or_else(|| (!output_text.trim().is_empty()).then_some(output_text.clone()))
                .unwrap_or_else(|| "ACP tool call failed".to_string()),
        ))
    } else {
        None
    };
    DisplayToolAction {
        id: string_field(value, &["toolCallId", "id"]).unwrap_or(fallback_id),
        turn_id: None,
        kind: Some(acp_tool_kind(string_field(value, &["kind"]).as_deref())),
        phase,
        title: string_field(value, &["title"]),
        input_summary: string_field(value, &["title"]),
        raw_input: value
            .get("rawInput")
            .map(json_string)
            .or_else(|| Some(json_string(value))),
        output_text,
        output,
        error,
    }
}

fn is_codex_tool_item(value: &Value) -> bool {
    let item = codex_replay_value(value);
    matches!(
        string_field(item, &["type"]).as_deref(),
        Some(
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
    )
}

fn codex_history_tool_action(value: &Value, fallback_id: String) -> DisplayToolAction {
    let item = codex_replay_value(value);
    let output = codex_tool_output(item);
    let output_text = action_output_text(&output);
    DisplayToolAction {
        id: string_field(item, &["id", "callId", "call_id", "itemId"]).unwrap_or(fallback_id),
        turn_id: None,
        kind: codex_tool_kind(item),
        phase: codex_tool_phase(item),
        title: codex_tool_title(item),
        input_summary: codex_tool_title(item),
        raw_input: codex_tool_raw_input(item),
        output_text,
        output,
        error: None,
    }
}

fn codex_replay_value(value: &Value) -> &Value {
    if string_field(value, &["type"]).as_deref() == Some("response_item")
        && let Some(payload) = value.get("payload").filter(|payload| payload.is_object())
    {
        return payload;
    }
    value
}

fn codex_tool_kind(item: &Value) -> Option<ActionKind> {
    let kind = match string_field(item, &["type"]).as_deref()? {
        "commandExecution" | "local_shell_call" => ActionKind::Command,
        "fileChange" => ActionKind::FileChange,
        "mcpToolCall" | "mcp_call" => ActionKind::McpTool,
        "dynamicToolCall" | "tool_search_call" => ActionKind::DynamicTool,
        "webSearch" | "web_search_call" => ActionKind::WebSearch,
        "imageView" | "imageGeneration" => ActionKind::Media,
        "contextCompaction" => ActionKind::Reasoning,
        "function_call" => {
            if is_codex_command_tool_name(string_field(item, &["name"]).as_deref()) {
                ActionKind::Command
            } else {
                ActionKind::DynamicTool
            }
        }
        "custom_tool_call" => {
            if string_field(item, &["name"]).as_deref() == Some("apply_patch") {
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

fn codex_tool_phase(item: &Value) -> ActionPhase {
    if let Some(status) = string_field(item, &["status"]) {
        return normalize_tool_phase(Some(&status));
    }
    match string_field(item, &["type"]).as_deref() {
        Some("function_call_output" | "custom_tool_call_output" | "tool_search_output") => {
            ActionPhase::Completed
        }
        _ => ActionPhase::Running,
    }
}

fn codex_tool_title(item: &Value) -> Option<String> {
    match string_field(item, &["type"]).as_deref()? {
        "commandExecution" | "local_shell_call" => {
            string_field(item, &["command"]).or_else(|| Some("Command".to_string()))
        }
        "mcpToolCall" => Some(format!(
            "{}.{}",
            string_field(item, &["server"]).unwrap_or_else(|| "mcp".to_string()),
            string_field(item, &["tool"]).unwrap_or_else(|| "tool".to_string())
        )),
        "mcp_call" => string_field(item, &["name"]).or_else(|| Some("mcp.call".to_string())),
        "dynamicToolCall" => {
            let tool = string_field(item, &["tool"]).unwrap_or_else(|| "tool".to_string());
            Some(
                string_field(item, &["namespace"])
                    .map(|namespace| format!("{namespace}.{tool}"))
                    .unwrap_or(tool),
            )
        }
        "webSearch" => string_field(item, &["query"]).or_else(|| Some("Web search".to_string())),
        "web_search_call" => item
            .get("action")
            .and_then(|action| string_field(action, &["query"]))
            .or_else(|| Some("Web search".to_string())),
        "function_call" => codex_function_call_title(item),
        "custom_tool_call" => {
            string_field(item, &["name"]).or_else(|| Some("Custom tool".to_string()))
        }
        "tool_search_call" => Some("tool_search".to_string()),
        "computer_call" => Some("computer".to_string()),
        "function_call_output" | "custom_tool_call_output" | "tool_search_output" => None,
        _ => string_field(item, &["title", "name", "type"]),
    }
}

fn codex_function_call_title(item: &Value) -> Option<String> {
    let name = string_field(item, &["name"]);
    let args = string_field(item, &["arguments"])
        .and_then(|arguments| serde_json::from_str::<Value>(&arguments).ok());
    if is_codex_command_tool_name(name.as_deref())
        && let Some(command) = args
            .as_ref()
            .and_then(|args| args.get("command"))
            .and_then(command_value_text)
    {
        return Some(command);
    }
    name.or_else(|| Some("Function call".to_string()))
}

fn command_value_text(value: &Value) -> Option<String> {
    if let Some(text) = value.as_str().filter(|text| !text.trim().is_empty()) {
        return Some(text.to_string());
    }
    let command = value
        .as_array()?
        .iter()
        .filter_map(Value::as_str)
        .collect::<Vec<_>>()
        .join(" ");
    (!command.is_empty()).then_some(command)
}

fn codex_tool_raw_input(item: &Value) -> Option<String> {
    match string_field(item, &["type"]).as_deref() {
        Some("function_call") => {
            string_field(item, &["arguments"]).or_else(|| item.get("arguments").map(json_string))
        }
        Some("custom_tool_call") => {
            string_field(item, &["input"]).or_else(|| item.get("input").map(json_string))
        }
        Some("web_search_call") => item.get("action").map(json_string),
        Some("function_call_output" | "custom_tool_call_output" | "tool_search_output") => None,
        _ => Some(json_string(item)),
    }
}

fn codex_tool_output(item: &Value) -> Vec<ActionOutputDelta> {
    let value = [
        "output",
        "result",
        "content",
        "aggregatedOutput",
        "stdout",
        "stderr",
    ]
    .iter()
    .find_map(|key| item.get(*key));
    action_outputs_from_value(value.map(codex_raw_output_value).as_ref())
}

fn codex_raw_output_value(value: &Value) -> Value {
    let Some(text) = value.as_str() else {
        return value.clone();
    };
    let Ok(parsed) = serde_json::from_str::<Value>(text) else {
        return value.clone();
    };
    ["output", "stdout", "stderr", "content"]
        .iter()
        .find_map(|key| parsed.get(*key).cloned())
        .unwrap_or_else(|| value.clone())
}

fn is_codex_command_tool_name(name: Option<&str>) -> bool {
    matches!(name, Some("shell" | "exec_command" | "write_stdin"))
}

fn action_outputs_from_value(value: Option<&Value>) -> Vec<ActionOutputDelta> {
    let Some(value) = value else {
        return Vec::new();
    };
    match value {
        Value::Null => Vec::new(),
        Value::Array(items) => items
            .iter()
            .flat_map(|item| action_outputs_from_value(Some(item)))
            .collect(),
        Value::String(text) => vec![ActionOutputDelta::Text(text.clone())],
        Value::Bool(value) => vec![ActionOutputDelta::Text(value.to_string())],
        Value::Number(value) => vec![ActionOutputDelta::Text(value.to_string())],
        Value::Object(_) => action_output_from_object(value),
    }
}

fn action_output_from_object(value: &Value) -> Vec<ActionOutputDelta> {
    match string_field(value, &["type", "kind"]).as_deref() {
        Some("diff") => vec![ActionOutputDelta::Patch(acp_diff_text(value))],
        Some("terminal") => vec![ActionOutputDelta::Terminal(
            string_field(value, &["terminalId"]).unwrap_or_else(|| json_string(value)),
        )],
        Some("content") => value
            .get("content")
            .map(|content| action_outputs_from_value(Some(content)))
            .filter(|output| !output.is_empty())
            .unwrap_or_else(|| structured_output(value)),
        Some("patch") => vec![ActionOutputDelta::Patch(
            content_text(value).unwrap_or_else(|| json_string(value)),
        )],
        Some(_) | None => content_text(value)
            .map(|text| vec![ActionOutputDelta::Text(text)])
            .unwrap_or_else(|| structured_output(value)),
    }
}

fn structured_output(value: &Value) -> Vec<ActionOutputDelta> {
    vec![ActionOutputDelta::Structured(json_string(value))]
}

fn acp_tool_kind(kind: Option<&str>) -> ActionKind {
    match kind {
        Some("read") => ActionKind::Read,
        Some("edit" | "delete" | "move") => ActionKind::FileChange,
        Some("execute") => ActionKind::Command,
        Some("search") => ActionKind::WebSearch,
        Some("think") => ActionKind::Reasoning,
        Some("fetch") => ActionKind::DynamicTool,
        Some("switch_mode") => ActionKind::HostCapability,
        _ => ActionKind::McpTool,
    }
}

fn normalize_tool_phase(status: Option<&str>) -> ActionPhase {
    match status {
        Some("completed") => ActionPhase::Completed,
        Some("failed") => ActionPhase::Failed,
        Some("declined") => ActionPhase::Declined,
        Some("cancelled" | "canceled" | "interrupted") => ActionPhase::Cancelled,
        Some("pending" | "proposed") => ActionPhase::Proposed,
        Some("streamingResult") => ActionPhase::StreamingResult,
        Some("awaitingDecision") => ActionPhase::AwaitingDecision {
            elicitation_id: crate::ElicitationId::new("history-elicitation".to_string()),
        },
        _ => ActionPhase::Running,
    }
}

fn turn_input_text(turn: &TurnState) -> String {
    turn.input
        .iter()
        .map(|input| input.content.as_str())
        .collect::<Vec<_>>()
        .join("\n")
}

fn buffer_text(chunks: &[ContentDelta]) -> String {
    chunks
        .iter()
        .filter_map(|chunk| match chunk {
            ContentDelta::Text(text) => Some(text.as_str()),
            ContentDelta::ResourceRef(_) | ContentDelta::Structured(_) => None,
        })
        .collect::<Vec<_>>()
        .join("")
}

fn content_delta_text(delta: &ContentDelta) -> String {
    match delta {
        ContentDelta::Text(text)
        | ContentDelta::ResourceRef(text)
        | ContentDelta::Structured(text) => text.clone(),
    }
}

fn action_output_text(chunks: &[ActionOutputDelta]) -> String {
    chunks
        .iter()
        .filter_map(|chunk| match chunk {
            ActionOutputDelta::Text(text) | ActionOutputDelta::Terminal(text) => {
                Some(text.as_str())
            }
            ActionOutputDelta::Patch(_) | ActionOutputDelta::Structured(_) => None,
        })
        .collect::<Vec<_>>()
        .join("")
}

fn content_text(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Array(items) => {
            let text = items.iter().filter_map(content_text).collect::<String>();
            (!text.is_empty()).then_some(text)
        }
        Value::Object(_) => ["text", "content", "summary", "delta", "message"]
            .iter()
            .find_map(|key| value.get(*key).and_then(content_text)),
        _ => None,
    }
}

fn acp_diff_text(value: &Value) -> String {
    let path = string_field(value, &["path"]).unwrap_or_else(|| "<unknown>".to_string());
    let old_text = string_field(value, &["oldText"]).unwrap_or_default();
    let new_text = string_field(value, &["newText"]).unwrap_or_default();
    format!("diff -- {path}\n--- old\n{old_text}\n+++ new\n{new_text}")
}

fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        value
            .get(*key)
            .and_then(Value::as_str)
            .filter(|text| !text.trim().is_empty())
            .map(str::to_string)
    })
}

fn json_string(value: &Value) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| value.to_string())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::{
        ConversationCapabilities, ConversationId, ConversationLifecycle, RemoteConversationId,
        RemoteTurnId, UserInputRef,
    };

    #[test]
    fn codex_hydrated_history_projects_tool_parts() {
        let mut conversation = conversation(ConversationCapabilities::codex_app_server());
        conversation.history.replay = vec![
            HistoryReplayEntry {
                role: HistoryRole::User,
                content: ContentDelta::Text("status".to_string()),
            },
            HistoryReplayEntry {
                role: HistoryRole::Tool,
                content: ContentDelta::Structured(
                    json!({
                        "type": "function_call",
                        "call_id": "call_1",
                        "name": "shell",
                        "arguments": "{\"command\":[\"zsh\",\"-lc\",\"git status -sb\"]}"
                    })
                    .to_string(),
                ),
            },
            HistoryReplayEntry {
                role: HistoryRole::Tool,
                content: ContentDelta::Structured(
                    json!({
                        "type": "function_call_output",
                        "call_id": "call_1",
                        "output": "{\"output\":\"## main\\n\",\"metadata\":{\"exit_code\":0}}"
                    })
                    .to_string(),
                ),
            },
            HistoryReplayEntry {
                role: HistoryRole::Assistant,
                content: ContentDelta::Text("done".to_string()),
            },
        ];

        let messages = conversation_display_messages(ProtocolFlavor::CodexAppServer, &conversation);

        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].role, DisplayMessageRole::User);
        assert!(matches!(
            messages[0].content.as_slice(),
            [DisplayMessagePart::Text { kind: DisplayTextPartKind::Text, text }]
                if text == "status"
        ));

        let assistant = &messages[1];
        let tool = assistant
            .content
            .iter()
            .find_map(|part| match part {
                DisplayMessagePart::ToolCall { action } => Some(action),
                DisplayMessagePart::Text { .. } => None,
            })
            .expect("tool action");
        assert_eq!(tool.id, "call_1");
        assert_eq!(tool.kind, Some(ActionKind::Command));
        assert_eq!(tool.phase, ActionPhase::Completed);
        assert_eq!(tool.output_text, "## main\n");
        assert!(matches!(
            assistant.content.last(),
            Some(DisplayMessagePart::Text { kind: DisplayTextPartKind::Text, text })
                if text == "done"
        ));
    }

    #[test]
    fn acp_hydrated_history_projects_tool_parts() {
        let mut conversation = conversation(ConversationCapabilities::acp_standard());
        conversation.history.replay = vec![
            HistoryReplayEntry {
                role: HistoryRole::User,
                content: ContentDelta::Text("run tests".to_string()),
            },
            HistoryReplayEntry {
                role: HistoryRole::Tool,
                content: ContentDelta::Structured(
                    json!({
                        "sessionUpdate": "tool_call",
                        "toolCallId": "tool-1",
                        "kind": "execute",
                        "title": "npm test",
                        "status": "in_progress",
                        "rawInput": {"command": "npm test"}
                    })
                    .to_string(),
                ),
            },
            HistoryReplayEntry {
                role: HistoryRole::Tool,
                content: ContentDelta::Structured(
                    json!({
                        "sessionUpdate": "tool_call_update",
                        "toolCallId": "tool-1",
                        "kind": "execute",
                        "title": "npm test",
                        "status": "completed",
                        "content": [
                            {
                                "type": "content",
                                "content": {"type": "text", "text": "ok\n"}
                            }
                        ]
                    })
                    .to_string(),
                ),
            },
        ];

        let messages = conversation_display_messages(ProtocolFlavor::Acp, &conversation);

        assert_eq!(messages.len(), 2);
        let tool = match &messages[1].content[0] {
            DisplayMessagePart::ToolCall { action } => action,
            DisplayMessagePart::Text { .. } => panic!("expected tool action"),
        };
        assert_eq!(tool.id, "tool-1");
        assert_eq!(tool.kind, Some(ActionKind::Command));
        assert_eq!(tool.phase, ActionPhase::Completed);
        assert_eq!(tool.title.as_deref(), Some("npm test"));
        assert_eq!(tool.output_text, "ok\n");
    }

    #[test]
    fn live_turn_projects_same_message_shape() {
        let mut conversation = conversation(ConversationCapabilities::codex_app_server());
        let turn_id = TurnId::new("turn-1");
        let mut turn = TurnState::new(
            turn_id.clone(),
            RemoteTurnId::Known("remote-turn-1".to_string()),
            0,
        );
        turn.input.push(UserInputRef {
            content: "status".to_string(),
        });
        turn.reasoning
            .chunks
            .push(ContentDelta::Text("thinking".to_string()));
        turn.output
            .chunks
            .push(ContentDelta::Text("done".to_string()));
        conversation.turns.insert(turn_id.clone(), turn);

        let mut action = ActionState::new(
            ActionId::new("call_1"),
            turn_id.clone(),
            ActionKind::Command,
        );
        action.phase = ActionPhase::Completed;
        action.title = Some("git status".to_string());
        action
            .output
            .chunks
            .push(ActionOutputDelta::Text("## main\n".to_string()));
        conversation.actions.insert(action.id.clone(), action);

        let messages = conversation_display_messages(ProtocolFlavor::CodexAppServer, &conversation);

        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].role, DisplayMessageRole::User);
        assert_eq!(messages[1].id, "turn-1:assistant");
        assert!(matches!(
            messages[1].content.as_slice(),
            [
                DisplayMessagePart::Text { kind: DisplayTextPartKind::Reasoning, text: reasoning },
                DisplayMessagePart::ToolCall { action },
                DisplayMessagePart::Text { kind: DisplayTextPartKind::Text, text }
            ] if reasoning == "thinking"
                && action.id == "call_1"
                && action.output_text == "## main\n"
                && text == "done"
        ));
    }

    fn conversation(capabilities: ConversationCapabilities) -> ConversationState {
        ConversationState::new(
            ConversationId::new("conversation-1"),
            RemoteConversationId::Known("remote-conversation-1".to_string()),
            ConversationLifecycle::Idle,
            capabilities,
        )
    }
}
