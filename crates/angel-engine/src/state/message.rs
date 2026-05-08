use std::collections::BTreeSet;

use serde_json::Value;

use crate::error::ErrorInfo;
use crate::ids::{ActionId, TurnId};
use crate::protocol::ProtocolFlavor;

use super::{
    ActionKind, ActionOutputDelta, ActionPhase, ActionState, ContentDelta, ContentPart,
    ConversationState, ElicitationState, HistoryReplayEntry, HistoryRole, PlanEntry,
    PlanEntryStatus, TurnDisplayContentKind, TurnDisplayPart, TurnState,
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
    Image {
        data: String,
        mime_type: String,
        name: Option<String>,
    },
    File {
        data: String,
        mime_type: String,
        name: Option<String>,
    },
    Plan {
        entries: Vec<PlanEntry>,
        text: String,
        path: Option<String>,
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

    pub fn image(
        data: impl Into<String>,
        mime_type: impl Into<String>,
        name: Option<String>,
    ) -> Self {
        Self::Image {
            data: data.into(),
            mime_type: mime_type.into(),
            name,
        }
    }

    pub fn file(
        data: impl Into<String>,
        mime_type: impl Into<String>,
        name: Option<String>,
    ) -> Self {
        Self::File {
            data: data.into(),
            mime_type: mime_type.into(),
            name,
        }
    }

    pub fn plan(entries: Vec<PlanEntry>, text: impl Into<String>, path: Option<String>) -> Self {
        Self::Plan {
            entries,
            text: text.into(),
            path,
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
        let input_content = turn_input_display_parts(turn);
        if !input_content.is_empty() {
            messages.push(DisplayMessage {
                id: format!("{}:user", turn.id),
                role: DisplayMessageRole::User,
                content: input_content,
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
    if !turn.display_parts.is_empty() {
        return ordered_display_content_from_turn(turn, actions);
    }

    let mut parts = Vec::new();
    append_display_text_part(
        &mut parts,
        DisplayTextPartKind::Reasoning,
        buffer_text(&turn.reasoning.chunks),
    );
    append_display_plan_part(&mut parts, turn);
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

fn ordered_display_content_from_turn(
    turn: &TurnState,
    actions: &[&ActionState],
) -> Vec<DisplayMessagePart> {
    let mut parts = Vec::new();
    let mut rendered_actions = BTreeSet::new();

    for part in &turn.display_parts {
        match part {
            TurnDisplayPart::Content { kind, chunk_index } => {
                let delta = match kind {
                    TurnDisplayContentKind::Assistant => turn.output.chunks.get(*chunk_index),
                    TurnDisplayContentKind::Reasoning => turn.reasoning.chunks.get(*chunk_index),
                };
                let Some(delta) = delta else {
                    continue;
                };
                match kind {
                    TurnDisplayContentKind::Assistant => {
                        append_display_parts(&mut parts, content_delta_display_parts(delta));
                    }
                    TurnDisplayContentKind::Reasoning => append_display_text_part(
                        &mut parts,
                        DisplayTextPartKind::Reasoning,
                        content_delta_text(delta),
                    ),
                }
            }
            TurnDisplayPart::Plan => append_display_plan_part(&mut parts, turn),
            TurnDisplayPart::Action { action_id } => {
                if let Some(action) = actions.iter().find(|action| action.id == *action_id) {
                    parts.push(DisplayMessagePart::tool(DisplayToolAction::from_action(
                        action,
                    )));
                    rendered_actions.insert(action_id.clone());
                }
            }
        }
    }

    for action in actions {
        if !rendered_actions.contains(&action.id) {
            parts.push(DisplayMessagePart::tool(DisplayToolAction::from_action(
                action,
            )));
        }
    }

    parts
}

fn append_history_display_message(
    messages: &mut Vec<DisplayMessage>,
    protocol: ProtocolFlavor,
    entry: &HistoryReplayEntry,
    index: usize,
) {
    let text = content_delta_text(&entry.content);
    let parts = content_delta_display_parts(&entry.content);
    if parts.is_empty() {
        return;
    }

    match &entry.role {
        HistoryRole::User => messages.push(DisplayMessage {
            id: format!("history-{index}"),
            role: DisplayMessageRole::User,
            content: parts,
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
        HistoryRole::Assistant => {
            append_display_parts(ensure_history_assistant_message(messages), parts)
        }
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

fn append_display_plan_part(parts: &mut Vec<DisplayMessagePart>, turn: &TurnState) {
    let entries = turn
        .plan
        .as_ref()
        .map(|plan| plan.entries.clone())
        .unwrap_or_default();
    let text = buffer_text(&turn.plan_text.chunks);
    let path = turn.plan_path.clone();
    if entries.is_empty() && text.trim().is_empty() && path.is_none() {
        return;
    }
    parts.push(DisplayMessagePart::plan(entries, text, path));
}

fn append_display_parts(parts: &mut Vec<DisplayMessagePart>, next: Vec<DisplayMessagePart>) {
    for part in next {
        match part {
            DisplayMessagePart::Text { kind, text } => append_display_text_part(parts, kind, text),
            DisplayMessagePart::Image {
                data,
                mime_type,
                name,
            } => parts.push(DisplayMessagePart::image(data, mime_type, name)),
            DisplayMessagePart::File {
                data,
                mime_type,
                name,
            } => parts.push(DisplayMessagePart::file(data, mime_type, name)),
            DisplayMessagePart::Plan {
                entries,
                text,
                path,
            } => parts.push(DisplayMessagePart::plan(entries, text, path)),
            DisplayMessagePart::ToolCall { action } => parts.push(DisplayMessagePart::tool(action)),
        }
    }
}

fn upsert_display_tool_part(parts: &mut Vec<DisplayMessagePart>, next: DisplayToolAction) {
    let Some(index) = parts.iter().position(|part| match part {
        DisplayMessagePart::ToolCall { action } => action.id == next.id,
        DisplayMessagePart::Text { .. } => false,
        DisplayMessagePart::Image { .. } => false,
        DisplayMessagePart::File { .. } => false,
        DisplayMessagePart::Plan { .. } => false,
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
        input_summary: codex_tool_input_summary(item).or_else(|| codex_tool_title(item)),
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
        "dynamicToolCall" if codex_dynamic_tool_is_host_capability(item) => {
            ActionKind::HostCapability
        }
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

fn codex_dynamic_tool_is_host_capability(item: &Value) -> bool {
    matches!(
        string_field(item, &["kind"]).as_deref(),
        Some("hostCapability")
    ) || matches!(
        string_field(item, &["tool"]).as_deref(),
        Some("hostCapability" | "request_user_input" | "requestUserInput")
    )
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
            if let Some(title) = string_field(item, &["title"]) {
                return Some(title);
            }
            if codex_dynamic_tool_is_host_capability(item) {
                return if item.get("arguments").is_some() {
                    Some("User input requested".to_string())
                } else {
                    None
                };
            }
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

fn codex_tool_input_summary(item: &Value) -> Option<String> {
    string_field(item, &["inputSummary", "input_summary"])
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
    if let Some(raw_input) = item.get("rawInput").or_else(|| item.get("raw_input")) {
        return raw_input
            .as_str()
            .map(str::to_string)
            .or_else(|| Some(json_string(raw_input)));
    }
    match string_field(item, &["type"]).as_deref() {
        Some("function_call") => {
            string_field(item, &["arguments"]).or_else(|| item.get("arguments").map(json_string))
        }
        Some("custom_tool_call") => {
            string_field(item, &["input"]).or_else(|| item.get("input").map(json_string))
        }
        Some("web_search_call") => item.get("action").map(json_string),
        Some("dynamicToolCall")
            if codex_dynamic_tool_is_host_capability(item) && item.get("arguments").is_none() =>
        {
            None
        }
        Some("function_call_output" | "custom_tool_call_output" | "tool_search_output") => None,
        _ => Some(json_string(item)),
    }
}

fn codex_tool_output(item: &Value) -> Vec<ActionOutputDelta> {
    let value = [
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

fn turn_input_display_parts(turn: &TurnState) -> Vec<DisplayMessagePart> {
    let mut parts = Vec::new();
    for input in &turn.input {
        if let Some(image) = &input.image {
            parts.push(DisplayMessagePart::image(
                image.data.clone(),
                image.mime_type.clone(),
                image.name.clone(),
            ));
        } else if let Some(file) = &input.file {
            parts.push(DisplayMessagePart::file(
                file.data.clone(),
                file.mime_type.clone(),
                file.name.clone(),
            ));
        } else if !input.content.trim().is_empty() {
            parts.push(DisplayMessagePart::text(
                DisplayTextPartKind::Text,
                input.content.clone(),
            ));
        }
    }
    parts
}

fn buffer_text(chunks: &[ContentDelta]) -> String {
    chunks
        .iter()
        .filter_map(|chunk| match chunk {
            ContentDelta::Text(text) => Some(text.clone()),
            ContentDelta::Parts(parts) => Some(
                parts
                    .iter()
                    .filter_map(|part| match part {
                        ContentPart::Text(text) => Some(text.as_str()),
                        ContentPart::Image { .. } | ContentPart::File { .. } => None,
                    })
                    .collect::<Vec<_>>()
                    .join(""),
            ),
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
        ContentDelta::Parts(parts) => parts
            .iter()
            .filter_map(|part| match part {
                ContentPart::Text(text) => Some(text.as_str()),
                ContentPart::Image { .. } | ContentPart::File { .. } => None,
            })
            .collect::<Vec<_>>()
            .join(""),
    }
}

fn content_delta_display_parts(delta: &ContentDelta) -> Vec<DisplayMessagePart> {
    match delta {
        ContentDelta::Structured(text) => {
            if let Some(plan) = structured_plan_display_part(text) {
                return vec![plan];
            }
            if text.trim().is_empty() {
                Vec::new()
            } else {
                vec![DisplayMessagePart::text(
                    DisplayTextPartKind::Text,
                    text.clone(),
                )]
            }
        }
        ContentDelta::Text(text) | ContentDelta::ResourceRef(text) => {
            if text.trim().is_empty() {
                Vec::new()
            } else {
                vec![DisplayMessagePart::text(
                    DisplayTextPartKind::Text,
                    text.clone(),
                )]
            }
        }
        ContentDelta::Parts(parts) => parts
            .iter()
            .filter_map(|part| match part {
                ContentPart::Text(text) => (!text.trim().is_empty())
                    .then(|| DisplayMessagePart::text(DisplayTextPartKind::Text, text.clone())),
                ContentPart::Image {
                    data,
                    mime_type,
                    name,
                } => (!data.is_empty() && mime_type.starts_with("image/")).then(|| {
                    DisplayMessagePart::image(data.clone(), mime_type.clone(), name.clone())
                }),
                ContentPart::File {
                    data,
                    mime_type,
                    name,
                } => (!data.is_empty()).then(|| {
                    DisplayMessagePart::file(data.clone(), mime_type.clone(), name.clone())
                }),
            })
            .collect(),
    }
}

fn structured_plan_display_part(text: &str) -> Option<DisplayMessagePart> {
    let value = serde_json::from_str::<Value>(text).ok()?;
    if string_field(&value, &["type"]).as_deref() != Some("plan") {
        return None;
    }

    let entries = ["entries", "plan", "steps"]
        .iter()
        .find_map(|key| value.get(*key).and_then(Value::as_array))
        .map(|entries| {
            entries
                .iter()
                .filter_map(structured_plan_entry)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let plan_text = string_field(&value, &["text", "content", "markdown"]).unwrap_or_default();
    let path = string_field(
        &value,
        &["path", "savedPath", "saved_path", "filePath", "file_path"],
    );

    if entries.is_empty() && plan_text.trim().is_empty() && path.is_none() {
        return None;
    }
    Some(DisplayMessagePart::plan(entries, plan_text, path))
}

fn structured_plan_entry(value: &Value) -> Option<PlanEntry> {
    let content = match value {
        Value::String(content) => content.clone(),
        Value::Object(_) => string_field(value, &["content", "text", "step"])?,
        _ => return None,
    };
    if content.trim().is_empty() {
        return None;
    }
    Some(PlanEntry {
        content,
        status: structured_plan_entry_status(
            value
                .get("status")
                .and_then(Value::as_str)
                .unwrap_or_default(),
        ),
    })
}

fn structured_plan_entry_status(status: &str) -> PlanEntryStatus {
    match status {
        "completed" => PlanEntryStatus::Completed,
        "in_progress" | "inProgress" => PlanEntryStatus::InProgress,
        _ => PlanEntryStatus::Pending,
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
        ConversationCapabilities, ConversationId, ConversationLifecycle, PlanEntryStatus,
        PlanState, RemoteConversationId, RemoteTurnId, UserImageInputRef, UserInputRef,
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
                DisplayMessagePart::Image { .. } => None,
                DisplayMessagePart::File { .. } => None,
                DisplayMessagePart::Plan { .. } => None,
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
            DisplayMessagePart::Image { .. } => panic!("expected tool action"),
            DisplayMessagePart::File { .. } => panic!("expected tool action"),
            DisplayMessagePart::Plan { .. } => panic!("expected tool action"),
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
            file: None,
            image: None,
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

    #[test]
    fn live_turn_projects_plan_as_independent_part() {
        let mut conversation = conversation(ConversationCapabilities::codex_app_server());
        let turn_id = TurnId::new("turn-1");
        let mut turn = TurnState::new(
            turn_id.clone(),
            RemoteTurnId::Known("remote-turn-1".to_string()),
            0,
        );
        turn.reasoning
            .chunks
            .push(ContentDelta::Text("thinking".to_string()));
        turn.plan_text
            .chunks
            .push(ContentDelta::Text("draft plan".to_string()));
        turn.plan_path = Some("/tmp/plan.md".to_string());
        turn.plan = Some(PlanState {
            entries: vec![
                PlanEntry {
                    content: "Inspect protocol".to_string(),
                    status: PlanEntryStatus::Completed,
                },
                PlanEntry {
                    content: "Implement UI".to_string(),
                    status: PlanEntryStatus::InProgress,
                },
            ],
        });
        turn.output
            .chunks
            .push(ContentDelta::Text("done".to_string()));
        conversation.turns.insert(turn_id, turn);

        let messages = conversation_display_messages(ProtocolFlavor::CodexAppServer, &conversation);

        assert_eq!(messages.len(), 1);
        assert!(matches!(
            messages[0].content.as_slice(),
            [
                DisplayMessagePart::Text { kind: DisplayTextPartKind::Reasoning, text: reasoning },
                DisplayMessagePart::Plan { entries, text: plan_text, path },
                DisplayMessagePart::Text { kind: DisplayTextPartKind::Text, text }
            ] if reasoning == "thinking"
                && entries.len() == 2
                && entries[0].content == "Inspect protocol"
                && entries[0].status == PlanEntryStatus::Completed
                && plan_text == "draft plan"
                && path.as_deref() == Some("/tmp/plan.md")
                && text == "done"
        ));
    }

    #[test]
    fn live_turn_projects_image_input_parts() {
        let mut conversation = conversation(ConversationCapabilities::codex_app_server());
        let turn_id = TurnId::new("turn-1");
        let mut turn = TurnState::new(
            turn_id.clone(),
            RemoteTurnId::Known("remote-turn-1".to_string()),
            0,
        );
        turn.input.push(UserInputRef {
            content: "describe this".to_string(),
            file: None,
            image: None,
        });
        turn.input.push(UserInputRef {
            content: "sample.png".to_string(),
            file: None,
            image: Some(UserImageInputRef {
                data: "ZmFrZQ==".to_string(),
                mime_type: "image/png".to_string(),
                name: Some("sample.png".to_string()),
            }),
        });
        conversation.turns.insert(turn_id, turn);

        let messages = conversation_display_messages(ProtocolFlavor::CodexAppServer, &conversation);

        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].role, DisplayMessageRole::User);
        assert!(matches!(
            messages[0].content.as_slice(),
            [
                DisplayMessagePart::Text { kind: DisplayTextPartKind::Text, text },
                DisplayMessagePart::Image { data, mime_type, name }
            ] if text == "describe this"
                && data == "ZmFrZQ=="
                && mime_type == "image/png"
                && name.as_deref() == Some("sample.png")
        ));
    }

    #[test]
    fn hydrated_history_projects_image_parts() {
        let mut conversation = conversation(ConversationCapabilities::codex_app_server());
        conversation.history.replay = vec![HistoryReplayEntry {
            role: HistoryRole::User,
            content: ContentDelta::Parts(vec![
                ContentPart::text("look"),
                ContentPart::image("ZmFrZQ==", "image/png", Some("sample.png".to_string())),
            ]),
        }];

        let messages = conversation_display_messages(ProtocolFlavor::CodexAppServer, &conversation);

        assert_eq!(messages.len(), 1);
        assert!(matches!(
            messages[0].content.as_slice(),
            [
                DisplayMessagePart::Text { kind: DisplayTextPartKind::Text, text },
                DisplayMessagePart::Image { data, mime_type, name }
            ] if text == "look"
                && data == "ZmFrZQ=="
                && mime_type == "image/png"
                && name.as_deref() == Some("sample.png")
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
