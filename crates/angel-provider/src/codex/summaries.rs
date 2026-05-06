use super::actions::action_title;
use super::*;

pub(crate) fn summarize_item(item: &Value, completed: bool) -> String {
    let verb = if completed { "completed" } else { "started" };
    let item_type = item.get("type").and_then(Value::as_str).unwrap_or("item");
    if item_type == "plan" {
        return summarize_plan_item(item, verb);
    }
    match action_title(item) {
        Some(title) => format!("{item_type} {verb}: {title}"),
        None => format!("{item_type} {verb}"),
    }
}

pub(crate) fn summarize_plan_item(item: &Value, verb: &str) -> String {
    match plan_item_saved_path(item) {
        Some(path) => format!("plan path: {path}"),
        None => format!("plan {verb}"),
    }
}

pub(crate) fn plan_item_saved_path(item: &Value) -> Option<String> {
    ["savedPath", "saved_path", "path", "filePath", "file_path"]
        .iter()
        .find_map(|key| item.get(*key).and_then(Value::as_str))
        .map(str::to_string)
}

pub(crate) fn plan_item_content(item: &Value) -> Option<String> {
    [
        "content",
        "fragments",
        "aggregatedOutput",
        "text",
        "markdown",
    ]
    .iter()
    .filter_map(|key| item.get(*key))
    .filter_map(text_from_value)
    .find(|text| !text.is_empty())
}

fn text_from_value(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Array(items) => {
            let text = items.iter().filter_map(text_from_value).collect::<String>();
            (!text.is_empty()).then_some(text)
        }
        Value::Object(object) => ["text", "content", "markdown", "delta"]
            .iter()
            .find_map(|key| object.get(*key).and_then(text_from_value)),
        _ => None,
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
        let new_len = text
            .char_indices()
            .map(|(index, _)| index)
            .take_while(|index| *index <= limit.saturating_sub(1))
            .last()
            .unwrap_or(0);
        text.truncate(new_len);
        text.push_str("...");
    }
    text
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn one_line_truncates_on_utf8_boundary() {
        let text = one_line("请检查当前仓库根目录的 Cargo.toml", 10);

        assert_eq!(text, "请检查...");
    }
}
