use serde_json::Value;

use super::super::{
    ActionOutputDelta, ContentDelta, ContentPart, PlanDisplayKind, PlanEntry, PlanEntryStatus,
};
use super::types::{DisplayMessagePart, DisplayTextPartKind};

pub(super) fn buffer_text(chunks: &[ContentDelta]) -> String {
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

pub(super) fn content_delta_text(delta: &ContentDelta) -> String {
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

pub(super) fn content_delta_display_parts(delta: &ContentDelta) -> Vec<DisplayMessagePart> {
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
    if value.get("type").and_then(Value::as_str) != Some("plan") {
        return None;
    }

    let entries = value
        .get("entries")
        .and_then(Value::as_array)
        .map(|entries| {
            entries
                .iter()
                .filter_map(structured_plan_entry)
                .collect::<Vec<_>>()
        })?;
    let plan_text = value
        .get("text")
        .and_then(Value::as_str)
        .filter(|text| !text.trim().is_empty())
        .map(str::to_string);
    let path = value
        .get("path")
        .and_then(Value::as_str)
        .filter(|path| !path.trim().is_empty())
        .map(str::to_string);
    let kind = match value.get("kind").and_then(Value::as_str) {
        Some("todo") => PlanDisplayKind::Todo,
        Some("review") | None => PlanDisplayKind::Review,
        _ => PlanDisplayKind::Review,
    };

    if entries.is_empty() && plan_text.is_none() && path.is_none() {
        return None;
    }
    let plan_text = match plan_text {
        Some(text) => text,
        None => String::new(),
    };
    Some(DisplayMessagePart::plan(kind, entries, plan_text, path))
}

fn structured_plan_entry(value: &Value) -> Option<PlanEntry> {
    let content = value.get("content").and_then(Value::as_str)?.to_string();
    if content.trim().is_empty() {
        return None;
    }
    let status = match value.get("status").and_then(Value::as_str) {
        Some("completed") => PlanEntryStatus::Completed,
        Some("in_progress") => PlanEntryStatus::InProgress,
        Some("pending") | None => PlanEntryStatus::Pending,
        _ => return None,
    };
    Some(PlanEntry { content, status })
}

pub(super) fn action_output_text(chunks: &[ActionOutputDelta]) -> String {
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
