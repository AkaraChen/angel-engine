use super::super::{PlanDisplayKind, TurnState};
use super::text_plan::buffer_text;
use super::types::{DisplayMessagePart, DisplayTextPartKind, DisplayToolAction};

pub(super) fn append_display_text_part(
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

pub(super) fn append_display_plan_part(
    parts: &mut Vec<DisplayMessagePart>,
    turn: &TurnState,
    kind: PlanDisplayKind,
) {
    let (entries, text, path) = match kind {
        PlanDisplayKind::Review => {
            let entries = match turn.plan.as_ref() {
                Some(plan) => plan.entries.clone(),
                None => Vec::new(),
            };
            (
                entries,
                buffer_text(&turn.plan_text.chunks),
                turn.plan_path.clone(),
            )
        }
        PlanDisplayKind::Todo => {
            let entries = match turn.todo.as_ref() {
                Some(todo) => todo.entries.clone(),
                None => Vec::new(),
            };
            (entries, String::new(), None)
        }
    };
    if entries.is_empty() && text.trim().is_empty() && path.is_none() {
        return;
    }
    parts.push(DisplayMessagePart::plan(kind, entries, text, path));
}

pub(super) fn append_display_parts(
    parts: &mut Vec<DisplayMessagePart>,
    next: Vec<DisplayMessagePart>,
) {
    for part in next {
        match part {
            DisplayMessagePart::Text { kind, text } => append_display_text_part(parts, kind, text),
            other => parts.push(other),
        }
    }
}

pub(super) fn upsert_display_tool_part(
    parts: &mut Vec<DisplayMessagePart>,
    next: DisplayToolAction,
) {
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
