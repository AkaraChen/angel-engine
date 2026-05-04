use std::collections::BTreeMap;

use angel_engine::{
    ActionKind, ActionOutputDelta, ActionPhase, ActionState, AgentMode, AvailableCommand,
    ContentDelta, ConversationLifecycle, ConversationState, EffectiveContext, ElicitationKind,
    ElicitationPhase, ElicitationState, HistoryReplayEntry, HistoryRole, PlanEntryStatus,
    ProtocolFlavor, QuestionValueType, RuntimeState, SessionConfigOption, SessionMode,
    SessionModeState, SessionModel, SessionModelState, SessionUsageCost, SessionUsageState,
    TurnPhase, TurnState, UserQuestion, UserQuestionOption, UserQuestionSchema,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::event::RuntimeAuthMethod;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientSnapshot {
    pub runtime: RuntimeSnapshot,
    pub selected_conversation_id: Option<String>,
    pub conversations: Vec<ConversationSnapshot>,
}

impl From<&angel_engine::AngelEngine> for ClientSnapshot {
    fn from(engine: &angel_engine::AngelEngine) -> Self {
        Self {
            runtime: RuntimeSnapshot::from(&engine.runtime),
            selected_conversation_id: engine.selected.as_ref().map(ToString::to_string),
            conversations: engine
                .conversations
                .values()
                .map(|conversation| conversation_snapshot(engine.protocol, conversation))
                .collect(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum RuntimeSnapshot {
    Offline,
    Connecting,
    Negotiating,
    AwaitingAuth {
        methods: Vec<RuntimeAuthMethod>,
    },
    Available {
        name: String,
        version: Option<String>,
        metadata: BTreeMap<String, String>,
    },
    Faulted {
        code: String,
        message: String,
        recoverable: bool,
    },
}

impl From<&RuntimeState> for RuntimeSnapshot {
    fn from(runtime: &RuntimeState) -> Self {
        match runtime {
            RuntimeState::Offline => Self::Offline,
            RuntimeState::Connecting => Self::Connecting,
            RuntimeState::Negotiating => Self::Negotiating,
            RuntimeState::AwaitingAuth { methods } => Self::AwaitingAuth {
                methods: methods
                    .iter()
                    .map(|method| RuntimeAuthMethod {
                        id: method.id.to_string(),
                        label: method.label.clone(),
                    })
                    .collect(),
            },
            RuntimeState::Available { capabilities } => Self::Available {
                name: capabilities.name.clone(),
                version: capabilities.version.clone(),
                metadata: capabilities.metadata.clone(),
            },
            RuntimeState::Faulted(error) => Self::Faulted {
                code: error.code.clone(),
                message: error.message.clone(),
                recoverable: error.recoverable,
            },
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationSnapshot {
    pub id: String,
    pub remote_id: Option<String>,
    pub remote_kind: String,
    pub lifecycle: String,
    pub active_turn_ids: Vec<String>,
    pub focused_turn_id: Option<String>,
    pub context: ContextSnapshot,
    pub turns: Vec<TurnSnapshot>,
    pub actions: Vec<ActionSnapshot>,
    pub messages: Vec<DisplayMessageSnapshot>,
    pub elicitations: Vec<ElicitationSnapshot>,
    pub history: HistorySnapshot,
    pub reasoning: ReasoningOptionsSnapshot,
    pub available_commands: Vec<AvailableCommandSnapshot>,
    pub config_options: Vec<SessionConfigOptionSnapshot>,
    pub modes: Option<SessionModeStateSnapshot>,
    pub models: Option<SessionModelStateSnapshot>,
    pub usage: Option<SessionUsageSnapshot>,
}

pub(crate) fn conversation_snapshot(
    protocol: ProtocolFlavor,
    conversation: &ConversationState,
) -> ConversationSnapshot {
    let (remote_kind, remote_id) = match &conversation.remote {
        angel_engine::RemoteConversationId::Known(value) => {
            ("known".to_string(), Some(value.clone()))
        }
        angel_engine::RemoteConversationId::Pending(value) => {
            ("pending".to_string(), Some(value.clone()))
        }
        angel_engine::RemoteConversationId::Local(value) => {
            ("local".to_string(), Some(value.clone()))
        }
    };
    let turns = conversation
        .turns
        .values()
        .map(TurnSnapshot::from)
        .collect::<Vec<_>>();
    let actions = conversation
        .actions
        .values()
        .map(ActionSnapshot::from)
        .collect::<Vec<_>>();
    let history_replay = conversation
        .history
        .replay
        .iter()
        .map(HistoryReplaySnapshot::from)
        .collect::<Vec<_>>();
    ConversationSnapshot {
        id: conversation.id.to_string(),
        remote_id,
        remote_kind,
        lifecycle: lifecycle_label(&conversation.lifecycle),
        active_turn_ids: conversation
            .active_turns
            .iter()
            .map(ToString::to_string)
            .collect(),
        focused_turn_id: conversation.focused_turn.as_ref().map(ToString::to_string),
        context: ContextSnapshot::from(&conversation.context),
        messages: display_messages(protocol, &conversation.history.replay, &turns, &actions),
        turns,
        actions,
        elicitations: conversation
            .elicitations
            .values()
            .map(ElicitationSnapshot::from)
            .collect(),
        history: HistorySnapshot {
            hydrated: conversation.history.hydrated,
            turn_count: conversation.history.turn_count,
            replay: history_replay,
        },
        reasoning: ReasoningOptionsSnapshot::from_conversation(protocol, conversation),
        available_commands: conversation
            .available_commands
            .iter()
            .map(AvailableCommandSnapshot::from)
            .collect(),
        config_options: conversation
            .config_options
            .iter()
            .map(SessionConfigOptionSnapshot::from)
            .collect(),
        modes: conversation
            .mode_state
            .as_ref()
            .map(SessionModeStateSnapshot::from),
        models: conversation
            .model_state
            .as_ref()
            .map(SessionModelStateSnapshot::from),
        usage: conversation
            .usage_state
            .as_ref()
            .map(SessionUsageSnapshot::from),
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayMessageSnapshot {
    pub id: String,
    pub role: String,
    pub content: Vec<DisplayMessagePartSnapshot>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayMessagePartSnapshot {
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub action: Option<DisplayToolActionSnapshot>,
}

impl DisplayMessagePartSnapshot {
    pub(crate) fn text(kind: &str, text: impl Into<String>) -> Self {
        Self {
            kind: kind.to_string(),
            text: Some(text.into()),
            action: None,
        }
    }

    pub(crate) fn tool(action: DisplayToolActionSnapshot) -> Self {
        Self {
            kind: "tool-call".to_string(),
            text: None,
            action: Some(action),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayToolActionSnapshot {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    pub kind: String,
    pub phase: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub input_summary: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub raw_input: Option<String>,
    pub output_text: String,
    pub output: Vec<ActionOutputSnapshot>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<ErrorSnapshot>,
}

impl From<&ActionSnapshot> for DisplayToolActionSnapshot {
    fn from(action: &ActionSnapshot) -> Self {
        Self {
            id: action.id.clone(),
            turn_id: Some(action.turn_id.clone()),
            kind: action.kind.clone(),
            phase: action.phase.clone(),
            title: action.title.clone(),
            input_summary: action.input_summary.clone(),
            raw_input: action.raw_input.clone(),
            output_text: action.output_text.clone(),
            output: action.output.clone(),
            error: action.error.clone(),
        }
    }
}

impl DisplayToolActionSnapshot {
    pub(crate) fn from_output_delta(
        turn_id: String,
        action_id: String,
        content: ActionOutputSnapshot,
    ) -> Self {
        Self {
            id: action_id,
            turn_id: Some(turn_id),
            kind: "tool".to_string(),
            phase: "streamingResult".to_string(),
            title: Some("Tool call".to_string()),
            input_summary: None,
            raw_input: None,
            output_text: action_output_text(std::slice::from_ref(&content)),
            output: vec![content],
            error: None,
        }
    }

    pub(crate) fn from_elicitation(elicitation: &ElicitationSnapshot) -> Self {
        let input_summary = elicitation.body.clone().or_else(|| {
            let questions = elicitation
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
            id: elicitation.id.clone(),
            turn_id: elicitation.turn_id.clone(),
            kind: "elicitation".to_string(),
            phase: "awaitingDecision".to_string(),
            title: Some(
                elicitation
                    .title
                    .clone()
                    .unwrap_or_else(|| "User input requested".to_string()),
            ),
            input_summary,
            raw_input: serde_json::to_string(elicitation).ok(),
            output_text: String::new(),
            output: Vec::new(),
            error: None,
        }
    }
}

pub(crate) fn display_message_for_turn(
    turn: &TurnSnapshot,
    actions: &[ActionSnapshot],
) -> Option<DisplayMessageSnapshot> {
    let content = display_content_from_turn(turn, actions);
    (!content.is_empty()).then(|| DisplayMessageSnapshot {
        id: format!("{}:assistant", turn.id),
        role: "assistant".to_string(),
        content,
    })
}

pub(crate) fn display_message_from_parts(
    id: impl Into<String>,
    role: impl Into<String>,
    content: Vec<DisplayMessagePartSnapshot>,
) -> Option<DisplayMessageSnapshot> {
    (!content.is_empty()).then(|| DisplayMessageSnapshot {
        id: id.into(),
        role: role.into(),
        content,
    })
}

fn display_messages(
    protocol: ProtocolFlavor,
    replay: &[HistoryReplayEntry],
    turns: &[TurnSnapshot],
    actions: &[ActionSnapshot],
) -> Vec<DisplayMessageSnapshot> {
    let mut messages = Vec::new();

    for (index, entry) in replay.iter().enumerate() {
        append_history_display_message(&mut messages, protocol, entry, index);
    }

    for turn in turns {
        let input_text = turn.input_text.trim();
        if !input_text.is_empty() {
            messages.push(DisplayMessageSnapshot {
                id: format!("{}:user", turn.id),
                role: "user".to_string(),
                content: vec![DisplayMessagePartSnapshot::text(
                    "text",
                    input_text.to_string(),
                )],
            });
        }

        if let Some(message) = display_message_for_turn(
            turn,
            &actions
                .iter()
                .filter(|action| action.turn_id == turn.id)
                .cloned()
                .collect::<Vec<_>>(),
        ) {
            messages.push(message);
        }
    }

    messages
}

fn display_content_from_turn(
    turn: &TurnSnapshot,
    actions: &[ActionSnapshot],
) -> Vec<DisplayMessagePartSnapshot> {
    let mut parts = Vec::new();
    append_display_text_part(
        &mut parts,
        "reasoning",
        [turn.reasoning_text.as_str(), turn.plan_text.as_str()]
            .into_iter()
            .filter(|text| !text.trim().is_empty())
            .collect::<Vec<_>>()
            .join("\n"),
    );
    for action in actions {
        parts.push(DisplayMessagePartSnapshot::tool(action.into()));
    }
    append_display_text_part(&mut parts, "text", turn.output_text.clone());
    parts
}

fn append_history_display_message(
    messages: &mut Vec<DisplayMessageSnapshot>,
    protocol: ProtocolFlavor,
    entry: &HistoryReplayEntry,
    index: usize,
) {
    let text = content_delta_text(&entry.content);
    if text.trim().is_empty() {
        return;
    }

    match &entry.role {
        HistoryRole::User => messages.push(DisplayMessageSnapshot {
            id: format!("history-{index}"),
            role: "user".to_string(),
            content: vec![DisplayMessagePartSnapshot::text("text", text)],
        }),
        HistoryRole::Tool => {
            let fallback_id = format!("history-tool-{index}");
            let action = history_tool_action(protocol, &entry.content, fallback_id);
            upsert_display_tool_part(ensure_history_assistant_message(messages), action);
        }
        HistoryRole::Reasoning => append_display_text_part(
            ensure_history_assistant_message(messages),
            "reasoning",
            text,
        ),
        HistoryRole::Assistant | HistoryRole::Unknown(_) => {
            append_display_text_part(ensure_history_assistant_message(messages), "text", text)
        }
    }
}

fn ensure_history_assistant_message(
    messages: &mut Vec<DisplayMessageSnapshot>,
) -> &mut Vec<DisplayMessagePartSnapshot> {
    if messages
        .last()
        .map(|message| message.role.as_str() == "assistant")
        .unwrap_or(false)
    {
        return &mut messages.last_mut().expect("last message").content;
    }

    let id = format!("history-{}", messages.len());
    messages.push(DisplayMessageSnapshot {
        id,
        role: "assistant".to_string(),
        content: Vec::new(),
    });
    &mut messages.last_mut().expect("inserted message").content
}

fn append_display_text_part(parts: &mut Vec<DisplayMessagePartSnapshot>, kind: &str, text: String) {
    if text.is_empty() {
        return;
    }
    if let Some(last) = parts.last_mut()
        && last.kind == kind
        && let Some(existing) = last.text.as_mut()
    {
        existing.push_str(&text);
        return;
    }
    parts.push(DisplayMessagePartSnapshot::text(kind, text));
}

fn upsert_display_tool_part(
    parts: &mut Vec<DisplayMessagePartSnapshot>,
    next: DisplayToolActionSnapshot,
) {
    let Some(index) = parts.iter().position(|part| {
        part.kind == "tool-call"
            && part
                .action
                .as_ref()
                .map(|action| action.id.as_str() == next.id.as_str())
                .unwrap_or(false)
    }) else {
        parts.push(DisplayMessagePartSnapshot::tool(next));
        return;
    };

    let Some(previous) = parts[index].action.take() else {
        parts[index] = DisplayMessagePartSnapshot::tool(next);
        return;
    };
    parts[index] = DisplayMessagePartSnapshot::tool(merge_display_tool_actions(previous, next));
}

fn merge_display_tool_actions(
    previous: DisplayToolActionSnapshot,
    next: DisplayToolActionSnapshot,
) -> DisplayToolActionSnapshot {
    let output = if next.output.is_empty() {
        previous.output
    } else {
        next.output
    };
    DisplayToolActionSnapshot {
        id: next.id,
        turn_id: next.turn_id.or(previous.turn_id),
        kind: if next.kind.is_empty() || (next.kind == "tool" && previous.kind != "tool") {
            previous.kind
        } else {
            next.kind
        },
        phase: if next.phase.is_empty() {
            previous.phase
        } else {
            next.phase
        },
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
) -> DisplayToolActionSnapshot {
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
    DisplayToolActionSnapshot {
        id: fallback_id,
        turn_id: None,
        kind: "tool".to_string(),
        phase: "completed".to_string(),
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

fn acp_history_tool_action(value: &Value, fallback_id: String) -> DisplayToolActionSnapshot {
    let output = action_outputs_from_value(value.get("content").or_else(|| value.get("rawOutput")));
    let output_text = action_output_text(&output);
    let phase = normalize_tool_phase(string_field(value, &["status"]).as_deref());
    let error = if phase == "failed" {
        Some(ErrorSnapshot {
            code: "acp.tool_call_failed".to_string(),
            message: string_field(value, &["error"])
                .or_else(|| (!output_text.trim().is_empty()).then_some(output_text.clone()))
                .unwrap_or_else(|| "ACP tool call failed".to_string()),
            recoverable: false,
        })
    } else {
        None
    };
    DisplayToolActionSnapshot {
        id: string_field(value, &["toolCallId", "id"]).unwrap_or(fallback_id),
        turn_id: None,
        kind: acp_tool_kind(string_field(value, &["kind"]).as_deref()),
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

fn codex_history_tool_action(value: &Value, fallback_id: String) -> DisplayToolActionSnapshot {
    let item = codex_replay_value(value);
    let output = codex_tool_output(item);
    let output_text = action_output_text(&output);
    DisplayToolActionSnapshot {
        id: string_field(item, &["id", "callId", "call_id", "itemId"]).unwrap_or(fallback_id),
        turn_id: None,
        kind: codex_tool_kind(item).unwrap_or_else(|| "tool".to_string()),
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

fn codex_tool_kind(item: &Value) -> Option<String> {
    let kind = match string_field(item, &["type"]).as_deref()? {
        "commandExecution" | "local_shell_call" => "command",
        "fileChange" => "fileChange",
        "mcpToolCall" | "mcp_call" => "mcpTool",
        "dynamicToolCall" | "tool_search_call" => "dynamicTool",
        "webSearch" | "web_search_call" => "webSearch",
        "imageView" | "imageGeneration" => "media",
        "contextCompaction" => "reasoning",
        "function_call" => {
            if is_codex_command_tool_name(string_field(item, &["name"]).as_deref()) {
                "command"
            } else {
                "dynamicTool"
            }
        }
        "custom_tool_call" => {
            if string_field(item, &["name"]).as_deref() == Some("apply_patch") {
                "fileChange"
            } else {
                "dynamicTool"
            }
        }
        "computer_call" => "hostCapability",
        _ => return None,
    };
    Some(kind.to_string())
}

fn codex_tool_phase(item: &Value) -> String {
    if let Some(status) = string_field(item, &["status"]) {
        return normalize_tool_phase(Some(&status));
    }
    match string_field(item, &["type"]).as_deref() {
        Some("function_call_output" | "custom_tool_call_output" | "tool_search_output") => {
            "completed".to_string()
        }
        _ => "running".to_string(),
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

fn codex_tool_output(item: &Value) -> Vec<ActionOutputSnapshot> {
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

fn action_outputs_from_value(value: Option<&Value>) -> Vec<ActionOutputSnapshot> {
    let Some(value) = value else {
        return Vec::new();
    };
    match value {
        Value::Null => Vec::new(),
        Value::Array(items) => items
            .iter()
            .flat_map(|item| action_outputs_from_value(Some(item)))
            .collect(),
        Value::String(text) => vec![ActionOutputSnapshot {
            kind: "text".to_string(),
            text: text.clone(),
        }],
        Value::Bool(value) => vec![ActionOutputSnapshot {
            kind: "text".to_string(),
            text: value.to_string(),
        }],
        Value::Number(value) => vec![ActionOutputSnapshot {
            kind: "text".to_string(),
            text: value.to_string(),
        }],
        Value::Object(_) => action_output_from_object(value),
    }
}

fn action_output_from_object(value: &Value) -> Vec<ActionOutputSnapshot> {
    match string_field(value, &["type", "kind"]).as_deref() {
        Some("diff") => vec![ActionOutputSnapshot {
            kind: "patch".to_string(),
            text: acp_diff_text(value),
        }],
        Some("terminal") => vec![ActionOutputSnapshot {
            kind: "terminal".to_string(),
            text: string_field(value, &["terminalId"]).unwrap_or_else(|| json_string(value)),
        }],
        Some("content") => value
            .get("content")
            .map(|content| action_outputs_from_value(Some(content)))
            .filter(|output| !output.is_empty())
            .unwrap_or_else(|| structured_output(value)),
        Some("patch") => vec![ActionOutputSnapshot {
            kind: "patch".to_string(),
            text: content_text(value).unwrap_or_else(|| json_string(value)),
        }],
        Some(_) | None => content_text(value)
            .map(|text| {
                vec![ActionOutputSnapshot {
                    kind: "text".to_string(),
                    text,
                }]
            })
            .unwrap_or_else(|| structured_output(value)),
    }
}

fn structured_output(value: &Value) -> Vec<ActionOutputSnapshot> {
    vec![ActionOutputSnapshot {
        kind: "structured".to_string(),
        text: json_string(value),
    }]
}

fn acp_tool_kind(kind: Option<&str>) -> String {
    match kind {
        Some("read") => "read",
        Some("edit" | "delete" | "move") => "fileChange",
        Some("execute") => "command",
        Some("search") => "webSearch",
        Some("think") => "reasoning",
        Some("fetch") => "dynamicTool",
        Some("switch_mode") => "hostCapability",
        _ => "mcpTool",
    }
    .to_string()
}

fn normalize_tool_phase(status: Option<&str>) -> String {
    match status {
        Some("completed") => "completed",
        Some("failed") => "failed",
        Some("declined") => "declined",
        Some("cancelled" | "canceled" | "interrupted") => "cancelled",
        Some("pending" | "proposed") => "proposed",
        Some("streamingResult") => "streamingResult",
        Some("awaitingDecision") => "awaitingDecision",
        _ => "running",
    }
    .to_string()
}

fn content_delta_text(delta: &ContentDelta) -> String {
    match delta {
        ContentDelta::Text(text)
        | ContentDelta::ResourceRef(text)
        | ContentDelta::Structured(text) => text.clone(),
    }
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

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextSnapshot {
    pub model: Option<String>,
    pub mode: Option<String>,
    pub cwd: Option<String>,
    pub additional_directories: Vec<String>,
    pub approval_policy: Option<String>,
    pub sandbox: Option<String>,
    pub permission_profile: Option<String>,
    pub raw: BTreeMap<String, String>,
}

impl From<&EffectiveContext> for ContextSnapshot {
    fn from(context: &EffectiveContext) -> Self {
        Self {
            model: context.model.effective().and_then(Clone::clone),
            mode: context
                .mode
                .effective()
                .and_then(Option::as_ref)
                .map(|AgentMode { id }| id.clone()),
            cwd: context
                .cwd
                .effective()
                .and_then(Option::as_ref)
                .map(|path| path.display().to_string()),
            additional_directories: context
                .additional_directories
                .effective()
                .map(|directories| {
                    directories
                        .iter()
                        .map(|directory| directory.display().to_string())
                        .collect()
                })
                .unwrap_or_default(),
            approval_policy: context
                .approvals
                .effective()
                .map(|policy| format!("{policy:?}")),
            sandbox: context
                .sandbox
                .effective()
                .map(|sandbox| format!("{sandbox:?}")),
            permission_profile: context
                .permissions
                .effective()
                .map(|permissions| permissions.name.clone()),
            raw: context
                .raw
                .iter()
                .filter_map(|(key, value)| {
                    value.effective().map(|value| (key.clone(), value.clone()))
                })
                .collect(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReasoningOptionsSnapshot {
    pub current_effort: Option<String>,
    pub available_efforts: Vec<String>,
    pub source: String,
    pub config_option_id: Option<String>,
    pub can_set: bool,
}

impl ReasoningOptionsSnapshot {
    fn from_conversation(protocol: ProtocolFlavor, conversation: &ConversationState) -> Self {
        if let Some(option) = reasoning_config_option(&conversation.config_options) {
            return Self {
                current_effort: Some(option.current_value.clone()),
                available_efforts: option
                    .values
                    .iter()
                    .map(|value| value.value.clone())
                    .collect(),
                source: "configOption".to_string(),
                config_option_id: Some(option.id.clone()),
                can_set: true,
            };
        }

        let context_effort = conversation
            .context
            .reasoning
            .effective()
            .and_then(Option::as_ref)
            .and_then(|reasoning| reasoning.effort.clone());

        if protocol == ProtocolFlavor::CodexAppServer {
            return Self {
                current_effort: context_effort,
                available_efforts: CODEX_REASONING_EFFORTS
                    .iter()
                    .map(ToString::to_string)
                    .collect(),
                source: "codexDefaults".to_string(),
                config_option_id: None,
                can_set: true,
            };
        }

        if let Some(inferred_effort) = model_variant_reasoning_effort(conversation) {
            return Self {
                current_effort: context_effort.or(Some(inferred_effort)),
                available_efforts: vec!["none".to_string(), "thinking".to_string()],
                source: "modelVariant".to_string(),
                config_option_id: None,
                can_set: true,
            };
        }

        Self {
            current_effort: context_effort,
            available_efforts: Vec::new(),
            source: "unsupported".to_string(),
            config_option_id: None,
            can_set: false,
        }
    }
}

const CODEX_REASONING_EFFORTS: &[&str] = &["none", "minimal", "low", "medium", "high", "xhigh"];

fn reasoning_config_option(options: &[SessionConfigOption]) -> Option<&SessionConfigOption> {
    const IDS: &[&str] = &[
        "thought_level",
        "reasoning",
        "reasoning_effort",
        "effort",
        "thinking",
        "thought",
    ];
    options
        .iter()
        .find(|option| option.category.as_deref() == Some("thought_level"))
        .or_else(|| {
            options.iter().find(|option| {
                IDS.iter()
                    .any(|id| option.id.eq_ignore_ascii_case(id) || normalized_eq(&option.id, id))
            })
        })
        .or_else(|| {
            options.iter().find(|option| {
                let name = normalize_name(&option.name);
                IDS.iter().any(|id| name == normalize_name(id))
            })
        })
}

fn model_variant_reasoning_effort(conversation: &ConversationState) -> Option<String> {
    const THINKING_SUFFIX: &str = ",thinking";

    let models = conversation.model_state.as_ref()?;
    let current = models.current_model_id.as_str();
    if current.ends_with(THINKING_SUFFIX) {
        let base = current.strip_suffix(THINKING_SUFFIX)?;
        return models
            .available_models
            .iter()
            .any(|model| model.id == base)
            .then(|| "thinking".to_string());
    }

    models
        .available_models
        .iter()
        .any(|model| model.id == format!("{current}{THINKING_SUFFIX}"))
        .then(|| "none".to_string())
}

fn normalized_eq(left: &str, right: &str) -> bool {
    normalize_name(left) == normalize_name(right)
}

fn normalize_name(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnSnapshot {
    pub id: String,
    pub remote_id: Option<String>,
    pub remote_kind: String,
    pub phase: String,
    pub input_text: String,
    pub output_text: String,
    pub reasoning_text: String,
    pub plan_text: String,
    pub plan_path: Option<String>,
    pub outcome: Option<String>,
    pub output: Vec<ContentChunk>,
    pub reasoning: Vec<ContentChunk>,
    pub plan: Vec<PlanEntrySnapshot>,
}

impl From<&TurnState> for TurnSnapshot {
    fn from(turn: &TurnState) -> Self {
        let (remote_kind, remote_id) = match &turn.remote {
            angel_engine::RemoteTurnId::Known(value) => ("known".to_string(), Some(value.clone())),
            angel_engine::RemoteTurnId::Pending { request_id } => {
                ("pending".to_string(), Some(request_id.to_string()))
            }
            angel_engine::RemoteTurnId::Local(value) => ("local".to_string(), Some(value.clone())),
        };
        let output = turn
            .output
            .chunks
            .iter()
            .map(ContentChunk::from)
            .collect::<Vec<_>>();
        let reasoning = turn
            .reasoning
            .chunks
            .iter()
            .map(ContentChunk::from)
            .collect::<Vec<_>>();
        let plan_text_chunks = turn
            .plan_text
            .chunks
            .iter()
            .map(ContentChunk::from)
            .collect::<Vec<_>>();
        Self {
            id: turn.id.to_string(),
            remote_id,
            remote_kind,
            phase: turn_phase_label(&turn.phase),
            input_text: turn
                .input
                .iter()
                .map(|input| input.content.as_str())
                .collect::<Vec<_>>()
                .join("\n"),
            output_text: chunks_text(&output),
            reasoning_text: chunks_text(&reasoning),
            plan_text: chunks_text(&plan_text_chunks),
            plan_path: turn.plan_path.clone(),
            outcome: turn.outcome.as_ref().map(|outcome| format!("{outcome:?}")),
            output,
            reasoning,
            plan: turn
                .plan
                .as_ref()
                .map(|plan| plan.entries.iter().map(PlanEntrySnapshot::from).collect())
                .unwrap_or_default(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentChunk {
    pub kind: String,
    pub text: String,
}

impl From<&ContentDelta> for ContentChunk {
    fn from(delta: &ContentDelta) -> Self {
        match delta {
            ContentDelta::Text(text) => Self {
                kind: "text".to_string(),
                text: text.clone(),
            },
            ContentDelta::ResourceRef(uri) => Self {
                kind: "resourceRef".to_string(),
                text: uri.clone(),
            },
            ContentDelta::Structured(value) => Self {
                kind: "structured".to_string(),
                text: value.clone(),
            },
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanEntrySnapshot {
    pub content: String,
    pub status: String,
}

impl From<&angel_engine::PlanEntry> for PlanEntrySnapshot {
    fn from(entry: &angel_engine::PlanEntry) -> Self {
        Self {
            content: entry.content.clone(),
            status: match entry.status {
                PlanEntryStatus::Pending => "pending",
                PlanEntryStatus::InProgress => "inProgress",
                PlanEntryStatus::Completed => "completed",
            }
            .to_string(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionSnapshot {
    pub id: String,
    pub turn_id: String,
    pub kind: String,
    pub phase: String,
    pub title: Option<String>,
    pub input_summary: Option<String>,
    pub raw_input: Option<String>,
    pub output_text: String,
    pub output: Vec<ActionOutputSnapshot>,
    pub error: Option<ErrorSnapshot>,
}

impl From<&ActionState> for ActionSnapshot {
    fn from(action: &ActionState) -> Self {
        let output = action
            .output
            .chunks
            .iter()
            .map(ActionOutputSnapshot::from)
            .collect::<Vec<_>>();
        Self {
            id: action.id.to_string(),
            turn_id: action.turn_id.to_string(),
            kind: action_kind_label(&action.kind),
            phase: action_phase_label(&action.phase),
            title: action.title.clone(),
            input_summary: action.input.summary.clone(),
            raw_input: action.input.raw.clone(),
            output_text: action_output_text(&output),
            output,
            error: action.error.as_ref().map(ErrorSnapshot::from),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionOutputSnapshot {
    pub kind: String,
    pub text: String,
}

impl From<&ActionOutputDelta> for ActionOutputSnapshot {
    fn from(delta: &ActionOutputDelta) -> Self {
        match delta {
            ActionOutputDelta::Text(text) => Self {
                kind: "text".to_string(),
                text: text.clone(),
            },
            ActionOutputDelta::Patch(text) => Self {
                kind: "patch".to_string(),
                text: text.clone(),
            },
            ActionOutputDelta::Terminal(text) => Self {
                kind: "terminal".to_string(),
                text: text.clone(),
            },
            ActionOutputDelta::Structured(text) => Self {
                kind: "structured".to_string(),
                text: text.clone(),
            },
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElicitationSnapshot {
    pub id: String,
    pub turn_id: Option<String>,
    pub action_id: Option<String>,
    pub kind: String,
    pub phase: String,
    pub title: Option<String>,
    pub body: Option<String>,
    pub choices: Vec<String>,
    pub questions: Vec<QuestionSnapshot>,
}

impl From<&ElicitationState> for ElicitationSnapshot {
    fn from(elicitation: &ElicitationState) -> Self {
        Self {
            id: elicitation.id.to_string(),
            turn_id: elicitation.turn_id.as_ref().map(ToString::to_string),
            action_id: elicitation.action_id.as_ref().map(ToString::to_string),
            kind: elicitation_kind_label(&elicitation.kind),
            phase: elicitation_phase_label(&elicitation.phase),
            title: elicitation.options.title.clone(),
            body: elicitation.options.body.clone(),
            choices: elicitation.options.choices.clone(),
            questions: elicitation
                .options
                .questions
                .iter()
                .map(QuestionSnapshot::from)
                .collect(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionSnapshot {
    pub id: String,
    pub header: String,
    pub question: String,
    pub is_secret: bool,
    pub is_other: bool,
    pub options: Vec<QuestionOptionSnapshot>,
    pub schema: Option<QuestionSchemaSnapshot>,
}

impl From<&UserQuestion> for QuestionSnapshot {
    fn from(question: &UserQuestion) -> Self {
        Self {
            id: question.id.clone(),
            header: question.header.clone(),
            question: question.question.clone(),
            is_secret: question.is_secret,
            is_other: question.is_other,
            options: question
                .options
                .iter()
                .map(QuestionOptionSnapshot::from)
                .collect(),
            schema: question.schema.as_ref().map(QuestionSchemaSnapshot::from),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionOptionSnapshot {
    pub label: String,
    pub description: String,
}

impl From<&UserQuestionOption> for QuestionOptionSnapshot {
    fn from(option: &UserQuestionOption) -> Self {
        Self {
            label: option.label.clone(),
            description: option.description.clone(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionSchemaSnapshot {
    pub value_type: String,
    pub item_value_type: Option<String>,
    pub required: bool,
    pub multiple: bool,
    pub format: Option<String>,
    pub default_value: Option<String>,
    pub constraints: QuestionConstraintsSnapshot,
    pub raw_schema: Option<String>,
}

impl From<&UserQuestionSchema> for QuestionSchemaSnapshot {
    fn from(schema: &UserQuestionSchema) -> Self {
        Self {
            value_type: question_value_type(&schema.value_type),
            item_value_type: schema.item_value_type.as_ref().map(question_value_type),
            required: schema.required,
            multiple: schema.multiple,
            format: schema.format.clone(),
            default_value: schema.default_value.clone(),
            constraints: QuestionConstraintsSnapshot {
                pattern: schema.constraints.pattern.clone(),
                minimum: schema.constraints.minimum.clone(),
                maximum: schema.constraints.maximum.clone(),
                min_length: schema.constraints.min_length.clone(),
                max_length: schema.constraints.max_length.clone(),
                min_items: schema.constraints.min_items.clone(),
                max_items: schema.constraints.max_items.clone(),
                unique_items: schema.constraints.unique_items,
            },
            raw_schema: schema.raw_schema.clone(),
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionConstraintsSnapshot {
    pub pattern: Option<String>,
    pub minimum: Option<String>,
    pub maximum: Option<String>,
    pub min_length: Option<String>,
    pub max_length: Option<String>,
    pub min_items: Option<String>,
    pub max_items: Option<String>,
    pub unique_items: Option<bool>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailableCommandSnapshot {
    pub name: String,
    pub description: String,
    pub input_hint: Option<String>,
}

impl From<&AvailableCommand> for AvailableCommandSnapshot {
    fn from(command: &AvailableCommand) -> Self {
        Self {
            name: command.name.clone(),
            description: command.description.clone(),
            input_hint: command.input.as_ref().map(|input| input.hint.clone()),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionConfigOptionSnapshot {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub current_value: String,
    pub values: Vec<SessionConfigValueSnapshot>,
}

impl From<&SessionConfigOption> for SessionConfigOptionSnapshot {
    fn from(option: &SessionConfigOption) -> Self {
        Self {
            id: option.id.clone(),
            name: option.name.clone(),
            description: option.description.clone(),
            category: option.category.clone(),
            current_value: option.current_value.clone(),
            values: option
                .values
                .iter()
                .map(|value| SessionConfigValueSnapshot {
                    value: value.value.clone(),
                    name: value.name.clone(),
                    description: value.description.clone(),
                })
                .collect(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionConfigValueSnapshot {
    pub value: String,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionModeStateSnapshot {
    pub current_mode_id: String,
    pub available_modes: Vec<SessionModeSnapshot>,
}

impl From<&SessionModeState> for SessionModeStateSnapshot {
    fn from(state: &SessionModeState) -> Self {
        Self {
            current_mode_id: state.current_mode_id.clone(),
            available_modes: state
                .available_modes
                .iter()
                .map(SessionModeSnapshot::from)
                .collect(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionModeSnapshot {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

impl From<&SessionMode> for SessionModeSnapshot {
    fn from(mode: &SessionMode) -> Self {
        Self {
            id: mode.id.clone(),
            name: mode.name.clone(),
            description: mode.description.clone(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionModelStateSnapshot {
    pub current_model_id: String,
    pub available_models: Vec<SessionModelSnapshot>,
}

impl From<&SessionModelState> for SessionModelStateSnapshot {
    fn from(state: &SessionModelState) -> Self {
        Self {
            current_model_id: state.current_model_id.clone(),
            available_models: state
                .available_models
                .iter()
                .map(SessionModelSnapshot::from)
                .collect(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionModelSnapshot {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

impl From<&SessionModel> for SessionModelSnapshot {
    fn from(model: &SessionModel) -> Self {
        Self {
            id: model.id.clone(),
            name: model.name.clone(),
            description: model.description.clone(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionUsageSnapshot {
    pub used: u64,
    pub size: u64,
    pub cost: Option<SessionUsageCostSnapshot>,
}

impl From<&SessionUsageState> for SessionUsageSnapshot {
    fn from(usage: &SessionUsageState) -> Self {
        Self {
            used: usage.used,
            size: usage.size,
            cost: usage.cost.as_ref().map(SessionUsageCostSnapshot::from),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionUsageCostSnapshot {
    pub amount: String,
    pub currency: String,
}

impl From<&SessionUsageCost> for SessionUsageCostSnapshot {
    fn from(cost: &SessionUsageCost) -> Self {
        Self {
            amount: cost.amount.clone(),
            currency: cost.currency.clone(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistorySnapshot {
    pub hydrated: bool,
    pub turn_count: usize,
    pub replay: Vec<HistoryReplaySnapshot>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryReplaySnapshot {
    pub role: String,
    pub content: ContentChunk,
}

impl From<&HistoryReplayEntry> for HistoryReplaySnapshot {
    fn from(entry: &HistoryReplayEntry) -> Self {
        Self {
            role: match &entry.role {
                HistoryRole::User => "user".to_string(),
                HistoryRole::Assistant => "assistant".to_string(),
                HistoryRole::Reasoning => "reasoning".to_string(),
                HistoryRole::Tool => "tool".to_string(),
                HistoryRole::Unknown(value) => value.clone(),
            },
            content: ContentChunk::from(&entry.content),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorSnapshot {
    pub code: String,
    pub message: String,
    pub recoverable: bool,
}

impl From<&angel_engine::ErrorInfo> for ErrorSnapshot {
    fn from(error: &angel_engine::ErrorInfo) -> Self {
        Self {
            code: error.code.clone(),
            message: error.message.clone(),
            recoverable: error.recoverable,
        }
    }
}

pub(crate) fn runtime_auth_methods(runtime: &RuntimeState) -> Vec<RuntimeAuthMethod> {
    match runtime {
        RuntimeState::AwaitingAuth { methods } => methods
            .iter()
            .map(|method| RuntimeAuthMethod {
                id: method.id.to_string(),
                label: method.label.clone(),
            })
            .collect(),
        _ => Vec::new(),
    }
}

fn lifecycle_label(lifecycle: &ConversationLifecycle) -> String {
    match lifecycle {
        ConversationLifecycle::Discovered => "discovered".to_string(),
        ConversationLifecycle::Provisioning { op } => format!("provisioning:{op:?}"),
        ConversationLifecycle::Hydrating { source } => format!("hydrating:{source:?}"),
        ConversationLifecycle::Idle => "idle".to_string(),
        ConversationLifecycle::Active => "active".to_string(),
        ConversationLifecycle::Cancelling { .. } => "cancelling".to_string(),
        ConversationLifecycle::MutatingHistory { .. } => "mutatingHistory".to_string(),
        ConversationLifecycle::Archived => "archived".to_string(),
        ConversationLifecycle::Closing => "closing".to_string(),
        ConversationLifecycle::Closed => "closed".to_string(),
        ConversationLifecycle::Faulted(error) => format!("faulted:{}", error.code),
    }
}

fn turn_phase_label(phase: &TurnPhase) -> String {
    match phase {
        TurnPhase::Starting => "starting".to_string(),
        TurnPhase::Reasoning => "reasoning".to_string(),
        TurnPhase::StreamingOutput => "streamingOutput".to_string(),
        TurnPhase::Planning => "planning".to_string(),
        TurnPhase::Acting { .. } => "acting".to_string(),
        TurnPhase::AwaitingUser { .. } => "awaitingUser".to_string(),
        TurnPhase::Cancelling => "cancelling".to_string(),
        TurnPhase::Terminal(outcome) => format!("terminal:{outcome:?}"),
    }
}

fn action_kind_label(kind: &ActionKind) -> String {
    match kind {
        ActionKind::Command => "command",
        ActionKind::FileChange => "fileChange",
        ActionKind::Read => "read",
        ActionKind::Write => "write",
        ActionKind::McpTool => "mcpTool",
        ActionKind::DynamicTool => "dynamicTool",
        ActionKind::SubAgent => "subAgent",
        ActionKind::WebSearch => "webSearch",
        ActionKind::Media => "media",
        ActionKind::Reasoning => "reasoning",
        ActionKind::Plan => "plan",
        ActionKind::HostCapability => "hostCapability",
    }
    .to_string()
}

fn action_phase_label(phase: &ActionPhase) -> String {
    match phase {
        ActionPhase::Proposed => "proposed",
        ActionPhase::AwaitingDecision { .. } => "awaitingDecision",
        ActionPhase::Running => "running",
        ActionPhase::StreamingResult => "streamingResult",
        ActionPhase::Completed => "completed",
        ActionPhase::Failed => "failed",
        ActionPhase::Declined => "declined",
        ActionPhase::Cancelled => "cancelled",
    }
    .to_string()
}

fn elicitation_kind_label(kind: &ElicitationKind) -> String {
    match kind {
        ElicitationKind::Approval => "approval",
        ElicitationKind::UserInput => "userInput",
        ElicitationKind::ExternalFlow => "externalFlow",
        ElicitationKind::DynamicToolCall => "dynamicToolCall",
        ElicitationKind::PermissionProfile => "permissionProfile",
    }
    .to_string()
}

fn elicitation_phase_label(phase: &ElicitationPhase) -> String {
    match phase {
        ElicitationPhase::Open => "open".to_string(),
        ElicitationPhase::Resolving => "resolving".to_string(),
        ElicitationPhase::Resolved { decision } => format!("resolved:{decision:?}"),
        ElicitationPhase::Cancelled => "cancelled".to_string(),
    }
}

fn question_value_type(value_type: &QuestionValueType) -> String {
    match value_type {
        QuestionValueType::String => "string".to_string(),
        QuestionValueType::Number => "number".to_string(),
        QuestionValueType::Integer => "integer".to_string(),
        QuestionValueType::Boolean => "boolean".to_string(),
        QuestionValueType::Array => "array".to_string(),
        QuestionValueType::Object => "object".to_string(),
        QuestionValueType::Unknown(value) => value.clone(),
    }
}

fn chunks_text(chunks: &[ContentChunk]) -> String {
    chunks
        .iter()
        .filter(|chunk| chunk.kind == "text")
        .map(|chunk| chunk.text.as_str())
        .collect::<Vec<_>>()
        .join("")
}

fn action_output_text(chunks: &[ActionOutputSnapshot]) -> String {
    chunks
        .iter()
        .filter(|chunk| chunk.kind == "text" || chunk.kind == "terminal")
        .map(|chunk| chunk.text.as_str())
        .collect::<Vec<_>>()
        .join("")
}
