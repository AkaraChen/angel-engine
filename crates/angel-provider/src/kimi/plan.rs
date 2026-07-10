use angel_engine::AngelEngine;
use angel_engine::event::EngineEvent;
use angel_engine::ids::ConversationId;
use angel_engine::state::{ActionOutputDelta, ActionState, ContentDelta};
use serde_json::Value;

pub(super) fn kimi_plan_file_event(
    engine: &AngelEngine,
    event: &EngineEvent,
) -> Option<Vec<EngineEvent>> {
    match event {
        EngineEvent::ActionObserved {
            conversation_id,
            action,
        } => kimi_plan_file_events_from_action(engine, conversation_id, action, None),
        EngineEvent::ActionUpdated {
            conversation_id,
            action_id,
            patch,
        } => {
            let action = engine
                .conversations
                .get(conversation_id)
                .and_then(|conversation| conversation.actions.get(action_id))?;
            kimi_plan_file_events_from_action(
                engine,
                conversation_id,
                action,
                patch.output_delta.as_ref(),
            )
        }
        _ => None,
    }
}

fn kimi_plan_file_events_from_action(
    engine: &AngelEngine,
    conversation_id: &ConversationId,
    action: &ActionState,
    output_delta: Option<&ActionOutputDelta>,
) -> Option<Vec<EngineEvent>> {
    if !action
        .title
        .as_deref()
        .is_some_and(kimi_write_plan_tool_title)
    {
        return None;
    }

    let args = action_output_text_with_delta(&action.output.chunks, output_delta);
    let args = serde_json::from_str::<Value>(&args).ok()?;
    let path = args.get("path").and_then(Value::as_str)?;
    if !is_kimi_plan_file_path(path) {
        return None;
    }

    let mut events = vec![EngineEvent::PlanPathUpdated {
        conversation_id: conversation_id.clone(),
        turn_id: action.turn_id.clone(),
        path: path.to_string(),
    }];

    if let Some(content) = args.get("content").and_then(Value::as_str)
        && let Some(delta) = kimi_plan_text_delta(engine, conversation_id, action, content)
    {
        events.push(EngineEvent::PlanDelta {
            conversation_id: conversation_id.clone(),
            turn_id: action.turn_id.clone(),
            delta: ContentDelta::Text(delta),
        });
    }

    Some(events)
}

fn kimi_write_plan_tool_title(title: &str) -> bool {
    title == "WriteFile" || title.starts_with("WriteFile:")
}

fn is_kimi_plan_file_path(path: &str) -> bool {
    path.ends_with(".md")
        && (path.contains("/.kimi/plans/")
            || path.starts_with("~/.kimi/plans/")
            || path.starts_with(".kimi/plans/"))
}

fn action_output_text_with_delta(
    chunks: &[ActionOutputDelta],
    output_delta: Option<&ActionOutputDelta>,
) -> String {
    chunks
        .iter()
        .chain(output_delta)
        .filter_map(action_output_text)
        .collect::<Vec<_>>()
        .join("")
}

fn action_output_text(delta: &ActionOutputDelta) -> Option<&str> {
    match delta {
        ActionOutputDelta::Text(text)
        | ActionOutputDelta::Terminal(text)
        | ActionOutputDelta::Structured(text) => Some(text),
        ActionOutputDelta::Patch(_) => None,
    }
}

fn kimi_plan_text_delta(
    engine: &AngelEngine,
    conversation_id: &ConversationId,
    action: &ActionState,
    content: &str,
) -> Option<String> {
    let previous = engine
        .conversations
        .get(conversation_id)
        .and_then(|conversation| conversation.turns.get(&action.turn_id))
        .map(|turn| content_delta_text(&turn.plan_text.chunks))
        .unwrap_or_default();
    content
        .strip_prefix(previous.as_str())
        .filter(|delta| !delta.is_empty())
        .map(ToString::to_string)
}

fn content_delta_text(chunks: &[ContentDelta]) -> String {
    chunks
        .iter()
        .filter_map(|chunk| match chunk {
            ContentDelta::Text(text) => Some(text.as_str()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("")
}
