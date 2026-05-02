use super::actions::action_title;
use super::*;

pub(crate) fn summarize_item(item: &Value, completed: bool) -> String {
    let verb = if completed { "completed" } else { "started" };
    let item_type = item.get("type").and_then(Value::as_str).unwrap_or("item");
    match action_title(item) {
        Some(title) => format!("{item_type} {verb}: {title}"),
        None => format!("{item_type} {verb}"),
    }
}

pub(crate) fn summarize_outbound(method: &str, params: &Value) -> String {
    match method {
        "turn/start" | "turn/steer" => params
            .get("input")
            .and_then(Value::as_array)
            .and_then(|items| items.first())
            .and_then(|item| item.get("text"))
            .and_then(Value::as_str)
            .map(|text| format!("({})", one_line(text, 80)))
            .unwrap_or_default(),
        "thread/shellCommand" => params
            .get("command")
            .and_then(Value::as_str)
            .map(|command| format!("({})", one_line(command, 80)))
            .unwrap_or_default(),
        _ => String::new(),
    }
}

pub(crate) fn summarize_inbound(method: &str, params: &Value) -> String {
    match method {
        "account/rateLimits/updated" => "rate limits updated".to_string(),
        _ => {
            if params.is_null() {
                String::new()
            } else {
                "(details hidden)".to_string()
            }
        }
    }
}

pub(crate) fn one_line(value: &str, limit: usize) -> String {
    let mut text = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if text.len() > limit {
        text.truncate(limit.saturating_sub(1));
        text.push_str("...");
    }
    text
}
