use std::collections::BTreeSet;

use serde_json::Value;

use crate::error::ErrorInfo;
use crate::ids::{ActionId, TurnId};

use super::{
    ActionKind, ActionOutputDelta, ActionPhase, ActionState, ContentDelta, ContentPart,
    ConversationState, ElicitationState, HistoryReplayEntry, HistoryReplayToolAction, HistoryRole,
    PlanDisplayKind, PlanEntry, PlanEntryStatus, TurnDisplayContentKind, TurnDisplayPart,
    TurnState, UserInputRef,
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
        kind: PlanDisplayKind,
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

    pub fn plan(
        kind: PlanDisplayKind,
        entries: Vec<PlanEntry>,
        text: impl Into<String>,
        path: Option<String>,
    ) -> Self {
        Self::Plan {
            kind,
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
            input_summary: elicitation_input_summary(elicitation),
            raw_input: None,
            output_text: String::new(),
            output: Vec::new(),
            error: None,
        }
    }

    pub fn from_history(
        tool: &HistoryReplayToolAction,
        fallback_id: String,
        turn_id: TurnId,
    ) -> Self {
        let output = tool.output.clone();
        Self {
            id: tool.id.clone().unwrap_or(fallback_id),
            turn_id: Some(turn_id),
            kind: tool.kind.clone(),
            phase: tool.phase.clone(),
            title: Some(history_tool_title(tool)),
            input_summary: tool.input_summary.clone(),
            raw_input: tool.raw_input.clone(),
            output_text: action_output_text(&output),
            output,
            error: tool.error.clone(),
        }
    }
}

fn elicitation_input_summary(elicitation: &ElicitationState) -> Option<String> {
    elicitation.options.body.clone().or_else(|| {
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
    })
}

pub fn conversation_display_messages(conversation: &ConversationState) -> Vec<DisplayMessage> {
    let mut messages = Vec::new();

    for (index, entry) in conversation.history.replay.iter().enumerate() {
        append_history_display_message(&mut messages, entry, index);
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
    append_display_plan_part(&mut parts, turn, PlanDisplayKind::Review);
    append_display_plan_part(&mut parts, turn, PlanDisplayKind::Todo);
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
            TurnDisplayPart::Plan { kind } => append_display_plan_part(&mut parts, turn, *kind),
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
    entry: &HistoryReplayEntry,
    index: usize,
) {
    let text = content_delta_text(&entry.content);
    let parts = content_delta_display_parts(&entry.content);
    if parts.is_empty() && entry.role != HistoryRole::Tool {
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
            let (turn_id, parts) = ensure_history_assistant_message(messages);
            let action = history_tool_action(entry, fallback_id, turn_id);
            upsert_display_tool_part(parts, action);
        }
        HistoryRole::Reasoning => {
            let (_, parts) = ensure_history_assistant_message(messages);
            append_display_text_part(parts, DisplayTextPartKind::Reasoning, text);
        }
        HistoryRole::Assistant => {
            let (_, assistant_parts) = ensure_history_assistant_message(messages);
            append_display_parts(assistant_parts, parts);
        }
        HistoryRole::Unknown(role) => {
            let (_, parts) = ensure_history_assistant_message(messages);
            append_display_text_part(parts, DisplayTextPartKind::Unknown(role.clone()), text);
        }
    }
}

fn ensure_history_assistant_message(
    messages: &mut Vec<DisplayMessage>,
) -> (TurnId, &mut Vec<DisplayMessagePart>) {
    if messages
        .last()
        .is_some_and(|message| message.role == DisplayMessageRole::Assistant)
    {
        let message = messages.last_mut().expect("last message");
        return (TurnId::new(message.id.clone()), &mut message.content);
    }

    let id = format!("history-{}", messages.len());
    let turn_id = TurnId::new(id.clone());
    messages.push(DisplayMessage {
        id,
        role: DisplayMessageRole::Assistant,
        content: Vec::new(),
    });
    (
        turn_id,
        &mut messages.last_mut().expect("inserted message").content,
    )
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
    {
        if *last_kind == kind {
            existing.push_str(&text);
            return;
        }
    }
    parts.push(DisplayMessagePart::text(kind, text));
}

fn append_display_plan_part(
    parts: &mut Vec<DisplayMessagePart>,
    turn: &TurnState,
    kind: PlanDisplayKind,
) {
    let (entries, text, path) = match kind {
        PlanDisplayKind::Review => (
            turn.plan
                .as_ref()
                .map(|plan| plan.entries.clone())
                .unwrap_or_default(),
            buffer_text(&turn.plan_text.chunks),
            turn.plan_path.clone(),
        ),
        PlanDisplayKind::Todo => (
            turn.todo
                .as_ref()
                .map(|todo| todo.entries.clone())
                .unwrap_or_default(),
            String::new(),
            None,
        ),
    };
    if entries.is_empty() && text.trim().is_empty() && path.is_none() {
        return;
    }
    parts.push(DisplayMessagePart::plan(kind, entries, text, path));
}

fn append_display_parts(parts: &mut Vec<DisplayMessagePart>, next: Vec<DisplayMessagePart>) {
    for part in next {
        match part {
            DisplayMessagePart::Text { kind, text } => append_display_text_part(parts, kind, text),
            other => parts.push(other),
        }
    }
}

fn upsert_display_tool_part(parts: &mut Vec<DisplayMessagePart>, next: DisplayToolAction) {
    let Some(index) = parts.iter().position(|part| match part {
        DisplayMessagePart::ToolCall { action } => action.id == next.id,
        _ => false,
    }) else {
        parts.push(DisplayMessagePart::tool(next));
        return;
    };

    let DisplayMessagePart::ToolCall { action } = &mut parts[index] else {
        unreachable!("tool action position should contain a tool action");
    };
    let previous = action.clone();
    *action = merge_display_tool_actions(previous, next);
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
    entry: &HistoryReplayEntry,
    fallback_id: String,
    turn_id: TurnId,
) -> DisplayToolAction {
    if let Some(tool) = &entry.tool {
        return DisplayToolAction::from_history(tool, fallback_id, turn_id);
    }
    let raw = content_delta_text(&entry.content);
    DisplayToolAction {
        id: fallback_id,
        turn_id: Some(turn_id),
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

fn history_tool_title(tool: &HistoryReplayToolAction) -> String {
    non_empty(tool.title.as_deref())
        .or_else(|| non_empty(tool.input_summary.as_deref()))
        .map(ToString::to_string)
        .or_else(|| tool.kind.as_ref().map(action_kind_title))
        .unwrap_or_else(|| "Tool call".to_string())
}

fn non_empty(value: Option<&str>) -> Option<&str> {
    value.filter(|value| !value.trim().is_empty())
}

fn action_kind_title(kind: &ActionKind) -> String {
    match kind {
        ActionKind::Command => "Command",
        ActionKind::FileChange => "File change",
        ActionKind::Read => "Read",
        ActionKind::Write => "Write",
        ActionKind::McpTool => "MCP tool",
        ActionKind::DynamicTool => "Dynamic tool",
        ActionKind::SubAgent => "Subagent",
        ActionKind::WebSearch => "Web search",
        ActionKind::Media => "Media",
        ActionKind::Reasoning => "Reasoning",
        ActionKind::Plan => "Plan",
        ActionKind::HostCapability => "Host capability",
    }
    .to_string()
}

fn turn_input_display_parts(turn: &TurnState) -> Vec<DisplayMessagePart> {
    let mut parts = Vec::new();
    for input in &turn.input {
        if let Some(part) = input_display_part(input) {
            parts.push(part);
        }
    }
    parts
}

fn input_display_part(input: &UserInputRef) -> Option<DisplayMessagePart> {
    if let Some(image) = &input.image {
        return Some(DisplayMessagePart::image(
            image.data.clone(),
            image.mime_type.clone(),
            image.name.clone(),
        ));
    }
    if let Some(file) = &input.file {
        return Some(DisplayMessagePart::file(
            file.data.clone(),
            file.mime_type.clone(),
            file.name.clone(),
        ));
    }
    if input.content.trim().is_empty() {
        return None;
    }
    Some(DisplayMessagePart::text(
        DisplayTextPartKind::Text,
        input.content.clone(),
    ))
}

fn buffer_text(chunks: &[ContentDelta]) -> String {
    let mut text = String::new();
    for chunk in chunks {
        match chunk {
            ContentDelta::Text(chunk_text) => text.push_str(chunk_text),
            ContentDelta::Parts(parts) => text.push_str(&content_parts_text(parts)),
            ContentDelta::ResourceRef(_) | ContentDelta::Structured(_) => {}
        }
    }
    text
}

fn content_delta_text(delta: &ContentDelta) -> String {
    match delta {
        ContentDelta::Text(text)
        | ContentDelta::ResourceRef(text)
        | ContentDelta::Structured(text) => text.clone(),
        ContentDelta::Parts(parts) => content_parts_text(parts),
    }
}

fn content_parts_text(parts: &[ContentPart]) -> String {
    let mut text = String::new();
    for part in parts {
        if let ContentPart::Text(part_text) = part {
            text.push_str(part_text);
        }
    }
    text
}

fn content_delta_display_parts(delta: &ContentDelta) -> Vec<DisplayMessagePart> {
    match delta {
        ContentDelta::Structured(text) => {
            if let Some(plan) = structured_plan_display_part(text) {
                return vec![plan];
            }
            text_display_parts(text)
        }
        ContentDelta::Text(text) | ContentDelta::ResourceRef(text) => text_display_parts(text),
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

fn text_display_parts(text: &str) -> Vec<DisplayMessagePart> {
    if text.trim().is_empty() {
        Vec::new()
    } else {
        vec![DisplayMessagePart::text(
            DisplayTextPartKind::Text,
            text.to_string(),
        )]
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
    let kind = match string_field(&value, &["kind"]).as_deref() {
        Some("todo") | Some("todos") => PlanDisplayKind::Todo,
        _ => PlanDisplayKind::Review,
    };

    if entries.is_empty() && plan_text.trim().is_empty() && path.is_none() {
        return None;
    }
    Some(DisplayMessagePart::plan(kind, entries, plan_text, path))
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
    let status = match value.get("status").and_then(Value::as_str) {
        Some("completed" | "Completed") => PlanEntryStatus::Completed,
        Some("in_progress" | "inProgress" | "InProgress") => PlanEntryStatus::InProgress,
        _ => PlanEntryStatus::Pending,
    };
    Some(PlanEntry { content, status })
}

fn action_output_text(chunks: &[ActionOutputDelta]) -> String {
    let mut text = String::new();
    for chunk in chunks {
        match chunk {
            ActionOutputDelta::Text(chunk_text) | ActionOutputDelta::Terminal(chunk_text) => {
                text.push_str(chunk_text);
            }
            ActionOutputDelta::Patch(_) | ActionOutputDelta::Structured(_) => {}
        }
    }
    text
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

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::{
        ConversationCapabilities, ConversationId, ConversationLifecycle, PlanEntryStatus,
        PlanState, RemoteConversationId, RemoteTurnId, UserImageInputRef, UserInputRef,
    };

    #[test]
    fn hydrated_history_projects_neutral_tool_parts() {
        let mut conversation = conversation(ConversationCapabilities::unknown());
        conversation.history.replay = vec![
            HistoryReplayEntry {
                role: HistoryRole::User,
                content: ContentDelta::Text("status".to_string()),
                tool: None,
            },
            HistoryReplayEntry {
                role: HistoryRole::Tool,
                content: ContentDelta::Text(String::new()),
                tool: Some(HistoryReplayToolAction {
                    id: Some("call_1".to_string()),
                    kind: Some(ActionKind::Command),
                    phase: ActionPhase::Running,
                    title: Some("git status".to_string()),
                    input_summary: Some("git status -sb".to_string()),
                    raw_input: Some("git status -sb".to_string()),
                    output: Vec::new(),
                    error: None,
                }),
            },
            HistoryReplayEntry {
                role: HistoryRole::Tool,
                content: ContentDelta::Text(String::new()),
                tool: Some(HistoryReplayToolAction {
                    id: Some("call_1".to_string()),
                    kind: Some(ActionKind::Command),
                    phase: ActionPhase::Completed,
                    title: Some("git status".to_string()),
                    input_summary: None,
                    raw_input: None,
                    output: vec![ActionOutputDelta::Text("## main\n".to_string())],
                    error: None,
                }),
            },
            HistoryReplayEntry {
                role: HistoryRole::Assistant,
                content: ContentDelta::Text("done".to_string()),
                tool: None,
            },
        ];

        let messages = conversation_display_messages(&conversation);

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
        assert_eq!(
            tool.turn_id.as_ref().map(ToString::to_string),
            Some(assistant.id.clone())
        );
        assert_eq!(tool.title.as_deref(), Some("git status"));
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
    fn hydrated_history_projects_generic_tool_fallback() {
        let mut conversation = conversation(ConversationCapabilities::unknown());
        conversation.history.replay = vec![
            HistoryReplayEntry {
                role: HistoryRole::User,
                content: ContentDelta::Text("run tests".to_string()),
                tool: None,
            },
            HistoryReplayEntry {
                role: HistoryRole::Tool,
                content: ContentDelta::Text("npm test".to_string()),
                tool: None,
            },
        ];

        let messages = conversation_display_messages(&conversation);

        assert_eq!(messages.len(), 2);
        let tool = match &messages[1].content[0] {
            DisplayMessagePart::ToolCall { action } => action,
            DisplayMessagePart::Text { .. } => panic!("expected tool action"),
            DisplayMessagePart::Image { .. } => panic!("expected tool action"),
            DisplayMessagePart::File { .. } => panic!("expected tool action"),
            DisplayMessagePart::Plan { .. } => panic!("expected tool action"),
        };
        assert_eq!(tool.id, "history-tool-1");
        assert_eq!(
            tool.turn_id.as_ref().map(ToString::to_string),
            Some(messages[1].id.clone())
        );
        assert_eq!(tool.kind, None);
        assert_eq!(tool.phase, ActionPhase::Completed);
        assert_eq!(tool.title.as_deref(), Some("Tool call"));
        assert_eq!(tool.raw_input.as_deref(), Some("npm test"));
    }

    #[test]
    fn hydrated_history_projects_missing_tool_title_from_kind() {
        let mut conversation = conversation(ConversationCapabilities::unknown());
        conversation.history.replay = vec![
            HistoryReplayEntry {
                role: HistoryRole::User,
                content: ContentDelta::Text("search".to_string()),
                tool: None,
            },
            HistoryReplayEntry {
                role: HistoryRole::Tool,
                content: ContentDelta::Text(String::new()),
                tool: Some(HistoryReplayToolAction {
                    id: Some("call_1".to_string()),
                    kind: Some(ActionKind::WebSearch),
                    phase: ActionPhase::Completed,
                    title: None,
                    input_summary: None,
                    raw_input: None,
                    output: Vec::new(),
                    error: None,
                }),
            },
        ];

        let messages = conversation_display_messages(&conversation);

        let tool = match &messages[1].content[0] {
            DisplayMessagePart::ToolCall { action } => action,
            DisplayMessagePart::Text { .. } => panic!("expected tool action"),
            DisplayMessagePart::Image { .. } => panic!("expected tool action"),
            DisplayMessagePart::File { .. } => panic!("expected tool action"),
            DisplayMessagePart::Plan { .. } => panic!("expected tool action"),
        };
        assert_eq!(tool.title.as_deref(), Some("Web search"));
        assert_eq!(
            tool.turn_id.as_ref().map(ToString::to_string),
            Some(messages[1].id.clone())
        );
    }

    #[test]
    fn hydrated_history_keeps_review_plan_and_todo_plan_separate() {
        let mut conversation = conversation(ConversationCapabilities::unknown());
        conversation.history.replay = vec![
            HistoryReplayEntry {
                role: HistoryRole::Assistant,
                content: ContentDelta::Structured(
                    json!({
                        "type": "plan",
                        "kind": "review",
                        "entries": [{"content": "Review theme options", "status": "pending"}],
                        "text": "Review theme options"
                    })
                    .to_string(),
                ),
                tool: None,
            },
            HistoryReplayEntry {
                role: HistoryRole::Assistant,
                content: ContentDelta::Structured(
                    json!({
                        "type": "plan",
                        "kind": "todo",
                        "entries": [{"content": "Apply blue theme", "status": "Completed"}]
                    })
                    .to_string(),
                ),
                tool: None,
            },
        ];

        let messages = conversation_display_messages(&conversation);

        assert_eq!(messages.len(), 1);
        assert!(matches!(
            messages[0].content.as_slice(),
            [
                DisplayMessagePart::Plan { kind: PlanDisplayKind::Review, entries: review, .. },
                DisplayMessagePart::Plan { kind: PlanDisplayKind::Todo, entries: todo, .. },
            ] if review[0].content == "Review theme options"
                && review[0].status == PlanEntryStatus::Pending
                && todo[0].content == "Apply blue theme"
                && todo[0].status == PlanEntryStatus::Completed
        ));
    }

    #[test]
    fn live_turn_projects_same_message_shape() {
        let mut conversation = conversation(ConversationCapabilities::unknown());
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

        let messages = conversation_display_messages(&conversation);

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
        let mut conversation = conversation(ConversationCapabilities::unknown());
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

        let messages = conversation_display_messages(&conversation);

        assert_eq!(messages.len(), 1);
        assert!(matches!(
            messages[0].content.as_slice(),
            [
                DisplayMessagePart::Text { kind: DisplayTextPartKind::Reasoning, text: reasoning },
                DisplayMessagePart::Plan { entries, text: plan_text, path, .. },
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
        let mut conversation = conversation(ConversationCapabilities::unknown());
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

        let messages = conversation_display_messages(&conversation);

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
        let mut conversation = conversation(ConversationCapabilities::unknown());
        conversation.history.replay = vec![HistoryReplayEntry {
            role: HistoryRole::User,
            content: ContentDelta::Parts(vec![
                ContentPart::text("look"),
                ContentPart::image("ZmFrZQ==", "image/png", Some("sample.png".to_string())),
            ]),
            tool: None,
        }];

        let messages = conversation_display_messages(&conversation);

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
