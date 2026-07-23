use std::collections::BTreeSet;

use super::super::{
    ActionState, ContentDelta, ConversationState, PlanDisplayKind, TurnDisplayContentKind,
    TurnDisplayPart, TurnState, UserInputRef,
};
use super::history::append_history_display_message;
use super::parts::{append_display_parts, append_display_plan_part, append_display_text_part};
use super::text_plan::{buffer_text, content_delta_display_parts, content_delta_text};
use super::types::{
    DisplayMessage, DisplayMessagePart, DisplayMessageRole, DisplayTextPartKind, DisplayToolAction,
};

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
    // Streaming deltas can split on arbitrary token boundaries, leaving chunks
    // that are only whitespace (the newline after a code-fence language tag,
    // the space between words). Folding consecutive text chunks into one
    // pending buffer keeps that whitespace; emitting per chunk would drop it,
    // because a whitespace-only part is treated as empty.
    let mut pending_text = String::new();
    fn flush_pending(parts: &mut Vec<DisplayMessagePart>, pending: &mut String) {
        if pending.trim().is_empty() {
            pending.clear();
            return;
        }
        append_display_text_part(parts, DisplayTextPartKind::Text, std::mem::take(pending));
    }

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
                match (kind, delta) {
                    (TurnDisplayContentKind::Assistant, ContentDelta::Text(text))
                    | (TurnDisplayContentKind::Assistant, ContentDelta::ResourceRef(text)) => {
                        pending_text.push_str(text);
                    }
                    (TurnDisplayContentKind::Assistant, _) => {
                        flush_pending(&mut parts, &mut pending_text);
                        append_display_parts(&mut parts, content_delta_display_parts(delta));
                    }
                    (TurnDisplayContentKind::Reasoning, _) => {
                        flush_pending(&mut parts, &mut pending_text);
                        append_display_text_part(
                            &mut parts,
                            DisplayTextPartKind::Reasoning,
                            content_delta_text(delta),
                        );
                    }
                }
            }
            TurnDisplayPart::Plan { kind } => {
                flush_pending(&mut parts, &mut pending_text);
                append_display_plan_part(&mut parts, turn, *kind);
            }
            TurnDisplayPart::Action { action_id } => {
                flush_pending(&mut parts, &mut pending_text);
                if let Some(action) = actions.iter().find(|action| action.id == *action_id) {
                    parts.push(DisplayMessagePart::tool(DisplayToolAction::from_action(
                        action,
                    )));
                    rendered_actions.insert(action_id.clone());
                }
            }
        }
    }
    flush_pending(&mut parts, &mut pending_text);

    for action in actions {
        if !rendered_actions.contains(&action.id) {
            parts.push(DisplayMessagePart::tool(DisplayToolAction::from_action(
                action,
            )));
        }
    }

    parts
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
    if input.reference {
        return None;
    }
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
