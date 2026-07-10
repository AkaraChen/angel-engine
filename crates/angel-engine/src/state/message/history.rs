use crate::ids::TurnId;

use super::super::{ActionKind, HistoryReplayEntry, HistoryReplayToolAction, HistoryRole};
use super::parts::{append_display_parts, append_display_text_part, upsert_display_tool_part};
use super::text_plan::{content_delta_display_parts, content_delta_text};
use super::types::{
    DisplayMessage, DisplayMessagePart, DisplayMessageRole, DisplayTextPartKind, DisplayToolAction,
};

pub(super) fn append_history_display_message(
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
            let (turn_id, parts) = ensure_history_assistant_message(messages, index);
            let action = history_tool_action(entry, turn_id);
            upsert_display_tool_part(parts, action);
        }
        HistoryRole::Reasoning => {
            let (_, parts) = ensure_history_assistant_message(messages, index);
            append_display_text_part(parts, DisplayTextPartKind::Reasoning, text);
        }
        HistoryRole::Assistant => {
            let (_, assistant_parts) = ensure_history_assistant_message(messages, index);
            append_display_parts(assistant_parts, parts);
        }
        HistoryRole::Unknown(role) => {
            let (_, parts) = ensure_history_assistant_message(messages, index);
            append_display_text_part(parts, DisplayTextPartKind::Unknown(role.clone()), text);
        }
    }
}

fn ensure_history_assistant_message(
    messages: &mut Vec<DisplayMessage>,
    index: usize,
) -> (TurnId, &mut Vec<DisplayMessagePart>) {
    if messages
        .last()
        .is_some_and(|message| message.role == DisplayMessageRole::Assistant)
    {
        let message = messages.last_mut().expect("last message");
        return (TurnId::new(message.id.clone()), &mut message.content);
    }

    let id = format!("history-{index}");
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

fn history_tool_action(entry: &HistoryReplayEntry, turn_id: TurnId) -> DisplayToolAction {
    if let Some(tool) = &entry.tool {
        return DisplayToolAction::from_history(tool, turn_id);
    }
    panic!("history tool replay entry must include tool action");
}

pub(super) fn history_tool_title(tool: &HistoryReplayToolAction) -> Option<String> {
    non_empty(tool.title.as_deref())
        .or_else(|| non_empty(tool.input_summary.as_deref()))
        .map(ToString::to_string)
        .or_else(|| tool.kind.as_ref().map(action_kind_title))
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
