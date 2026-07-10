use super::super::*;

pub(in crate::acp) fn session_config_options(value: &Value) -> Vec<SessionConfigOption> {
    value
        .get("configOptions")
        .and_then(Value::as_array)
        .map(|options| {
            options
                .iter()
                .filter_map(|option| {
                    let id = option.get("id").and_then(Value::as_str)?;
                    let name = option
                        .get("name")
                        .and_then(Value::as_str)
                        .unwrap_or(id)
                        .to_string();
                    let category = acp_config_category(
                        option.get("category").and_then(Value::as_str),
                        id,
                        &name,
                    );
                    Some(SessionConfigOption {
                        id: id.to_string(),
                        name,
                        description: option
                            .get("description")
                            .and_then(Value::as_str)
                            .map(str::to_string),
                        category,
                        current_value: config_current_value(option),
                        values: config_values(option),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn acp_config_category(raw_category: Option<&str>, id: &str, name: &str) -> Option<String> {
    let identity_candidates = [id, name];
    if identity_candidates
        .iter()
        .any(|value| config_name_matches(value, &["provider"]))
    {
        return Some("provider".to_string());
    }
    if identity_candidates
        .iter()
        .any(|value| config_name_matches(value, &["model"]))
    {
        return Some("model".to_string());
    }
    let candidates = [raw_category.unwrap_or_default(), id, name];
    if candidates
        .iter()
        .any(|value| config_name_matches(value, &["model"]))
    {
        return Some("model".to_string());
    }
    if candidates.iter().any(|value| {
        config_name_matches(
            value,
            &[
                "permission_mode",
                "permissions_mode",
                "permission_mode_id",
                "approval_mode",
            ],
        )
    }) {
        return Some("permissionMode".to_string());
    }
    if candidates
        .iter()
        .any(|value| config_name_matches(value, &["mode"]))
    {
        return Some("mode".to_string());
    }
    if candidates.iter().any(|value| {
        config_name_matches(
            value,
            &[
                "reasoning",
                "reasoning_effort",
                "effort",
                "thought",
                "thought_level",
                "thinking",
            ],
        )
    }) {
        return Some("reasoning".to_string());
    }
    raw_category.map(str::to_string)
}

fn config_name_matches(value: &str, targets: &[&str]) -> bool {
    let normalized = normalize_config_name(value);
    targets
        .iter()
        .any(|target| normalized == normalize_config_name(target))
}

fn normalize_config_name(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn config_current_value(option: &Value) -> String {
    option
        .get("currentValue")
        .map(|value| match value {
            Value::String(value) => value.clone(),
            Value::Bool(value) => value.to_string(),
            other => other.to_string(),
        })
        .unwrap_or_default()
}

fn config_values(option: &Value) -> Vec<SessionConfigValue> {
    let Some(options) = option.get("options").and_then(Value::as_array) else {
        return Vec::new();
    };
    let mut values = Vec::new();
    for item in options {
        if let Some(group_options) = item.get("options").and_then(Value::as_array) {
            values.extend(group_options.iter().filter_map(config_value));
        } else if let Some(value) = config_value(item) {
            values.push(value);
        }
    }
    values
}

fn config_value(value: &Value) -> Option<SessionConfigValue> {
    let id = value.get("value").and_then(Value::as_str)?;
    Some(SessionConfigValue {
        value: id.to_string(),
        name: value
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or(id)
            .to_string(),
        description: value
            .get("description")
            .and_then(Value::as_str)
            .map(str::to_string),
    })
}
