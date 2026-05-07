use super::*;

pub(crate) enum DeltaKind {
    Assistant,
    Reasoning,
}

pub(crate) fn text_input(text: String) -> Value {
    json!([
        {
            "type": "text",
            "text": text,
            "text_elements": [],
        }
    ])
}

pub(crate) fn codex_user_input(effect: &ProtocolEffect) -> Value {
    let Some(count) = effect
        .payload
        .fields
        .get("inputCount")
        .and_then(|value| value.parse::<usize>().ok())
    else {
        return text_input(
            effect
                .payload
                .fields
                .get("input")
                .cloned()
                .unwrap_or_default(),
        );
    };

    let mut input = Vec::new();
    for index in 0..count {
        let prefix = format!("input.{index}");
        let input_type = effect
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
        match input_type {
            "image" => {
                let data = effect
                    .payload
                    .fields
                    .get(&format!("{prefix}.data"))
                    .cloned()
                    .unwrap_or_default();
                let mime_type = effect
                    .payload
                    .fields
                    .get(&format!("{prefix}.mimeType"))
                    .cloned()
                    .unwrap_or_else(|| "image/png".to_string());
                input.push(json!({
                    "type": "image",
                    "url": codex_image_url(&data, &mime_type),
                }));
            }
            "resource_link" => input.push(codex_resource_link_item(effect, &prefix, content)),
            "resource" => input.push(codex_text_item(codex_text_resource_text(
                effect, &prefix, content,
            ))),
            "resource_blob" => input.push(codex_text_item(codex_blob_resource_text(
                effect, &prefix, content,
            ))),
            "text" => input.push(codex_text_item(content)),
            "raw" => {
                let raw_text = effect
                    .payload
                    .fields
                    .get(&format!("{prefix}.raw"))
                    .cloned()
                    .unwrap_or(content);
                input.push(codex_text_item(raw_text));
            }
            _ => input.push(codex_text_item(content)),
        }
    }

    if input.is_empty() {
        text_input(
            effect
                .payload
                .fields
                .get("input")
                .cloned()
                .unwrap_or_default(),
        )
    } else {
        Value::Array(input)
    }
}

fn codex_text_item(text: String) -> Value {
    json!({
        "type": "text",
        "text": text,
        "text_elements": [],
    })
}

fn codex_resource_link_item(effect: &ProtocolEffect, prefix: &str, content: String) -> Value {
    let name = field(effect, prefix, "name").unwrap_or(content.as_str());
    let uri = field(effect, prefix, "uri").unwrap_or(content.as_str());
    if let Some(path) = local_file_path_from_uri(uri) {
        if is_image_mime_type(field(effect, prefix, "mimeType")) {
            return json!({
                "type": "localImage",
                "path": path,
            });
        }

        return json!({
            "type": "mention",
            "name": name,
            "path": path,
        });
    }

    codex_text_item(codex_resource_link_text(effect, prefix, content))
}

fn codex_resource_link_text(effect: &ProtocolEffect, prefix: &str, content: String) -> String {
    let name = field(effect, prefix, "name").unwrap_or(content.as_str());
    let uri = field(effect, prefix, "uri").unwrap_or(content.as_str());
    let mut text = format!("Attached resource link: {name}\nURI: {uri}");
    if let Some(mime_type) = field(effect, prefix, "mimeType") {
        text.push_str(&format!("\nMIME type: {mime_type}"));
    }
    if let Some(title) = field(effect, prefix, "title") {
        text.push_str(&format!("\nTitle: {title}"));
    }
    if let Some(description) = field(effect, prefix, "description") {
        text.push_str(&format!("\nDescription: {description}"));
    }
    text
}

fn is_image_mime_type(mime_type: Option<&str>) -> bool {
    mime_type.is_some_and(|mime_type| mime_type.to_ascii_lowercase().starts_with("image/"))
}

fn local_file_path_from_uri(uri: &str) -> Option<String> {
    let file_path = uri.strip_prefix("file://")?;
    let path = if let Some(path) = file_path.strip_prefix("localhost/") {
        format!("/{path}")
    } else if file_path.starts_with('/') {
        file_path.to_string()
    } else {
        return None;
    };

    percent_decode_path(&path)
}

fn percent_decode_path(path: &str) -> Option<String> {
    let bytes = path.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let (Some(high), Some(low)) =
                (hex_digit(bytes[index + 1]), hex_digit(bytes[index + 2]))
            {
                decoded.push((high << 4) | low);
                index += 3;
                continue;
            }
        }

        decoded.push(bytes[index]);
        index += 1;
    }

    String::from_utf8(decoded).ok()
}

fn hex_digit(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn codex_text_resource_text(effect: &ProtocolEffect, prefix: &str, content: String) -> String {
    let uri = field(effect, prefix, "uri").unwrap_or("attachment://text");
    let mut text = format!("Attached text resource: {uri}");
    if let Some(mime_type) = field(effect, prefix, "mimeType") {
        text.push_str(&format!("\nMIME type: {mime_type}"));
    }
    text.push_str("\n\n");
    text.push_str(&content);
    text
}

fn codex_blob_resource_text(effect: &ProtocolEffect, prefix: &str, content: String) -> String {
    let name = field(effect, prefix, "name").unwrap_or(content.as_str());
    let uri = field(effect, prefix, "uri").unwrap_or(content.as_str());
    let data = field(effect, prefix, "data").unwrap_or_default();
    let mut text = format!("Attached file: {name}\nURI: {uri}");
    if let Some(mime_type) = field(effect, prefix, "mimeType") {
        text.push_str(&format!("\nMIME type: {mime_type}"));
    }
    text.push_str("\nEncoding: base64\n\n");
    text.push_str(data);
    text
}

fn field<'a>(effect: &'a ProtocolEffect, prefix: &str, name: &str) -> Option<&'a str> {
    effect
        .payload
        .fields
        .get(&format!("{prefix}.{name}"))
        .map(String::as_str)
        .filter(|value| !value.trim().is_empty())
}

fn codex_image_url(data: &str, mime_type: &str) -> String {
    if data.starts_with("data:") {
        data.to_string()
    } else {
        format!("data:{mime_type};base64,{data}")
    }
}

pub(crate) fn codex_context_patch(result: &Value) -> ContextPatch {
    let mut patch = ContextPatch::empty();
    if let Some(model) = result.get("model").and_then(Value::as_str) {
        patch.updates.push(angel_engine::ContextUpdate::Model {
            scope: angel_engine::ContextScope::Conversation,
            model: Some(model.to_string()),
        });
    }
    if let Some(cwd) = result.get("cwd").and_then(Value::as_str) {
        patch.updates.push(angel_engine::ContextUpdate::Cwd {
            scope: angel_engine::ContextScope::Conversation,
            cwd: Some(cwd.to_string()),
        });
    }
    patch
}

pub(crate) fn codex_elicitation_response(
    elicitation: &ElicitationState,
    fields: &std::collections::BTreeMap<String, String>,
) -> Value {
    let decision = fields
        .get("decision")
        .map(String::as_str)
        .unwrap_or("Cancel");
    match &elicitation.kind {
        ElicitationKind::Approval => json!({
            "decision": match decision {
                "AllowForSession" => "acceptForSession",
                "Deny" => "decline",
                "Cancel" => "cancel",
                _ => "accept",
            }
        }),
        ElicitationKind::PermissionProfile => json!({
            "permissions": {},
            "scope": "turn",
        }),
        ElicitationKind::UserInput => {
            if elicitation.options.title.as_deref() == Some("mcpServer/elicitation/request") {
                mcp_elicitation_response(decision, fields)
            } else {
                json!({
                    "answers": tool_user_input_answers(fields),
                })
            }
        }
        ElicitationKind::ExternalFlow => json!({
            "action": if decision == "Cancel" { "cancel" } else { "accept" },
            "content": null,
            "_meta": null,
        }),
        ElicitationKind::DynamicToolCall => json!({
            "contentItems": [{"type": "inputText", "text": ""}],
            "success": !matches!(decision, "Deny" | "Cancel"),
        }),
    }
}

fn tool_user_input_answers(fields: &std::collections::BTreeMap<String, String>) -> Value {
    let answer_count = fields
        .get("answerCount")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(0);
    let mut grouped = serde_json::Map::new();
    for index in 0..answer_count {
        let Some(id) = fields.get(&format!("answer.{index}.id")) else {
            continue;
        };
        let value = fields
            .get(&format!("answer.{index}.value"))
            .cloned()
            .unwrap_or_default();
        let entry = grouped
            .entry(id.clone())
            .or_insert_with(|| json!({ "answers": [] }));
        if let Some(answers) = entry.get_mut("answers").and_then(Value::as_array_mut) {
            answers.push(json!(value));
        }
    }
    Value::Object(grouped)
}

fn mcp_elicitation_response(
    decision: &str,
    fields: &std::collections::BTreeMap<String, String>,
) -> Value {
    let action = match decision {
        "Deny" => "decline",
        "Cancel" => "cancel",
        _ => "accept",
    };
    let content = if action == "accept" {
        Value::Object(flat_answer_content(fields))
    } else {
        Value::Null
    };
    json!({
        "action": action,
        "content": content,
        "_meta": null,
    })
}

fn flat_answer_content(
    fields: &std::collections::BTreeMap<String, String>,
) -> serde_json::Map<String, Value> {
    let answer_count = fields
        .get("answerCount")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(0);
    let mut grouped: std::collections::BTreeMap<String, Vec<String>> =
        std::collections::BTreeMap::new();
    for index in 0..answer_count {
        let Some(id) = fields.get(&format!("answer.{index}.id")) else {
            continue;
        };
        grouped.entry(id.clone()).or_default().push(
            fields
                .get(&format!("answer.{index}.value"))
                .cloned()
                .unwrap_or_default(),
        );
    }
    grouped
        .into_iter()
        .map(|(id, values)| {
            let value = if values.len() == 1 {
                json!(values[0])
            } else {
                json!(values)
            };
            (id, value)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tool_request_user_input_response_groups_answers_by_question() {
        let mut elicitation = ElicitationState::new(
            ElicitationId::new("input"),
            RemoteRequestId::JsonRpc(JsonRpcRequestId::new("request")),
            ElicitationKind::UserInput,
        );
        elicitation.options.title = Some("item/tool/requestUserInput".to_string());
        let fields = std::collections::BTreeMap::from([
            ("decision".to_string(), "Answers".to_string()),
            ("answerCount".to_string(), "3".to_string()),
            ("answer.0.id".to_string(), "choice".to_string()),
            ("answer.0.value".to_string(), "first".to_string()),
            ("answer.1.id".to_string(), "choice".to_string()),
            ("answer.1.value".to_string(), "second".to_string()),
            ("answer.2.id".to_string(), "note".to_string()),
            ("answer.2.value".to_string(), "free text".to_string()),
        ]);

        let response = codex_elicitation_response(&elicitation, &fields);

        assert_eq!(
            response,
            json!({
                "answers": {
                    "choice": {"answers": ["first", "second"]},
                    "note": {"answers": ["free text"]},
                }
            })
        );
    }
}
