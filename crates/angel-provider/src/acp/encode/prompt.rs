use super::super::helpers::acp_session_id;
use super::super::*;

pub(super) fn start_turn_params(
    engine: &AngelEngine,
    effect: &angel_engine::ProtocolEffect,
) -> Result<Value, angel_engine::EngineError> {
    Ok(json!({
        "sessionId": acp_session_id(engine, effect)?,
        "prompt": acp_prompt_blocks(effect),
    }))
}

fn acp_prompt_blocks(effect: &angel_engine::ProtocolEffect) -> Vec<Value> {
    let Some(count) = effect
        .payload
        .fields
        .get("inputCount")
        .and_then(|value| value.parse::<usize>().ok())
    else {
        return vec![json!({
            "type": "text",
            "text": effect.payload.fields.get("input").cloned().unwrap_or_default(),
        })];
    };
    let mut blocks = Vec::new();
    for index in 0..count {
        let prefix = format!("input.{index}");
        let block_type = effect
            .payload
            .fields
            .get(&format!("{prefix}.type"))
            .map(String::as_str)
            .unwrap_or("text");
        let content = effect
            .payload
            .fields
            .get(&format!("{prefix}.content"))
            .cloned()
            .unwrap_or_default();
        let block = match block_type {
            "resource_link" => {
                let mut block = serde_json::Map::new();
                block.insert("type".to_string(), json!("resource_link"));
                block.insert(
                    "name".to_string(),
                    json!(
                        effect
                            .payload
                            .fields
                            .get(&format!("{prefix}.name"))
                            .cloned()
                            .unwrap_or_else(|| content.clone())
                    ),
                );
                block.insert(
                    "uri".to_string(),
                    json!(
                        effect
                            .payload
                            .fields
                            .get(&format!("{prefix}.uri"))
                            .cloned()
                            .unwrap_or(content)
                    ),
                );
                insert_optional_prompt_field(effect, &prefix, &mut block, "mimeType");
                insert_optional_prompt_field(effect, &prefix, &mut block, "title");
                insert_optional_prompt_field(effect, &prefix, &mut block, "description");
                Value::Object(block)
            }
            "file_mention" => {
                let path = effect
                    .payload
                    .fields
                    .get(&format!("{prefix}.path"))
                    .cloned()
                    .unwrap_or_else(|| content.clone());
                let name = effect
                    .payload
                    .fields
                    .get(&format!("{prefix}.name"))
                    .cloned()
                    .unwrap_or_else(|| file_name_from_path(&path).unwrap_or_else(|| path.clone()));
                let mut block = serde_json::Map::new();
                block.insert("type".to_string(), json!("resource_link"));
                block.insert("name".to_string(), json!(name));
                block.insert("uri".to_string(), json!(file_uri_from_path(&path)));
                insert_optional_prompt_field(effect, &prefix, &mut block, "mimeType");
                Value::Object(block)
            }
            // ACP has no skill input type: pass the mention through as the
            // `$name` prompt text the runtime's own skill loader understands.
            "skill_mention" => {
                let name = effect
                    .payload
                    .fields
                    .get(&format!("{prefix}.name"))
                    .cloned()
                    .unwrap_or_else(|| content.clone());
                json!({
                    "type": "text",
                    "text": format!("${name}"),
                })
            }
            "resource" => {
                let mut resource = serde_json::Map::new();
                resource.insert(
                    "uri".to_string(),
                    json!(
                        effect
                            .payload
                            .fields
                            .get(&format!("{prefix}.uri"))
                            .cloned()
                            .unwrap_or_else(|| content.clone())
                    ),
                );
                resource.insert("text".to_string(), json!(content));
                insert_optional_prompt_field(effect, &prefix, &mut resource, "mimeType");
                json!({
                    "type": "resource",
                    "resource": Value::Object(resource),
                })
            }
            "resource_blob" => {
                let mut resource = serde_json::Map::new();
                resource.insert(
                    "uri".to_string(),
                    json!(
                        effect
                            .payload
                            .fields
                            .get(&format!("{prefix}.uri"))
                            .cloned()
                            .unwrap_or_else(|| content.clone())
                    ),
                );
                resource.insert(
                    "blob".to_string(),
                    json!(
                        effect
                            .payload
                            .fields
                            .get(&format!("{prefix}.data"))
                            .cloned()
                            .unwrap_or_default()
                    ),
                );
                insert_optional_prompt_field(effect, &prefix, &mut resource, "mimeType");
                json!({
                    "type": "resource",
                    "resource": Value::Object(resource),
                })
            }
            "image" => json!({
                "type": "image",
                "data": effect
                    .payload
                    .fields
                    .get(&format!("{prefix}.data"))
                    .cloned()
                    .unwrap_or(content),
                "mimeType": effect
                    .payload
                    .fields
                    .get(&format!("{prefix}.mimeType"))
                    .cloned()
                    .unwrap_or_else(|| "image/png".to_string()),
            }),
            "raw" => effect
                .payload
                .fields
                .get(&format!("{prefix}.raw"))
                .and_then(|raw| serde_json::from_str::<Value>(raw).ok())
                .filter(Value::is_object)
                .unwrap_or_else(|| json!({"type": "text", "text": content})),
            _ => json!({
                "type": "text",
                "text": content,
            }),
        };
        blocks.push(block);
    }
    if blocks.is_empty() {
        blocks.push(json!({
            "type": "text",
            "text": effect.payload.fields.get("input").cloned().unwrap_or_default(),
        }));
    }
    blocks
}

fn insert_optional_prompt_field(
    effect: &angel_engine::ProtocolEffect,
    prefix: &str,
    target: &mut serde_json::Map<String, Value>,
    field: &str,
) {
    if let Some(value) = effect.payload.fields.get(&format!("{prefix}.{field}")) {
        target.insert(field.to_string(), json!(value));
    }
}

fn file_name_from_path(path: &str) -> Option<String> {
    std::path::Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .map(str::to_string)
}

fn file_uri_from_path(path: &str) -> String {
    if path.starts_with("file://") {
        return path.to_string();
    }
    let normalized_windows_path = path.replace('\\', "/");
    if is_windows_drive_path(&normalized_windows_path) {
        return format!("file:///{}", percent_encode_path(&normalized_windows_path));
    }
    if normalized_windows_path.starts_with("//") {
        return format!("file:{}", percent_encode_path(&normalized_windows_path));
    }
    if path.starts_with('/') {
        return format!("file://{}", percent_encode_path(path));
    }
    path.to_string()
}

fn is_windows_drive_path(path: &str) -> bool {
    let bytes = path.as_bytes();
    bytes.len() >= 3 && bytes[1] == b':' && bytes[2] == b'/' && bytes[0].is_ascii_alphabetic()
}

fn percent_encode_path(path: &str) -> String {
    let mut encoded = String::with_capacity(path.len());
    for byte in path.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'/' | b':' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char)
            }
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }
    encoded
}
