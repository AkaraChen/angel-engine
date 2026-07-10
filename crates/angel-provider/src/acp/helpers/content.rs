use super::super::*;

pub(in crate::acp) fn content_delta_from_update(update: &Value) -> ContentDelta {
    update
        .get("content")
        .map(content_delta)
        .or_else(|| update.get("text").map(content_delta))
        .unwrap_or_else(|| ContentDelta::Text(String::new()))
}

pub(in crate::acp) fn content_delta_log_text(delta: &ContentDelta) -> String {
    match delta {
        ContentDelta::Text(text) => text.clone(),
        ContentDelta::ResourceRef(uri) => format!("[resource] {uri}"),
        ContentDelta::Structured(value) => value.clone(),
        ContentDelta::Parts(parts) => parts
            .iter()
            .filter_map(|part| match part {
                ContentPart::Text(text) => Some(text.as_str()),
                ContentPart::Image { name, .. } => name.as_deref(),
                ContentPart::File { name, .. } => name.as_deref(),
            })
            .collect::<Vec<_>>()
            .join(""),
    }
}

pub(in crate::acp) fn content_text(value: &Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        return Some(text.to_string());
    }
    if value.get("type").and_then(Value::as_str) == Some("text") {
        return value
            .get("text")
            .and_then(Value::as_str)
            .map(str::to_string);
    }
    value
        .get("text")
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn content_delta(value: &Value) -> ContentDelta {
    if let Some(parts) = content_parts(value)
        && !parts.is_empty()
        && (value.is_array()
            || parts
                .iter()
                .any(|part| matches!(part, ContentPart::File { .. })))
    {
        return ContentDelta::Parts(parts);
    }
    if let Some(text) = content_text(value) {
        return ContentDelta::Text(text);
    }
    match value.get("type").and_then(Value::as_str) {
        Some("resource_link") => value
            .get("uri")
            .or_else(|| value.get("name"))
            .and_then(Value::as_str)
            .map(|uri| ContentDelta::ResourceRef(uri.to_string()))
            .unwrap_or_else(|| ContentDelta::Structured(json_string(value))),
        Some("resource") => value
            .get("resource")
            .and_then(resource_uri)
            .map(ContentDelta::ResourceRef)
            .unwrap_or_else(|| ContentDelta::Structured(json_string(value))),
        _ => ContentDelta::Structured(json_string(value)),
    }
}

fn content_parts(value: &Value) -> Option<Vec<ContentPart>> {
    if let Some(text) = value.as_str() {
        return acp_text_attachment_part(text).map(|part| vec![part]);
    }
    if let Some(items) = value.as_array() {
        return Some(items.iter().filter_map(content_part).collect());
    }
    content_part(value).map(|part| vec![part])
}

fn content_part(value: &Value) -> Option<ContentPart> {
    match value.get("type").and_then(Value::as_str) {
        Some("text") => value.get("text").and_then(Value::as_str).map(|text| {
            acp_text_attachment_part(text).unwrap_or_else(|| ContentPart::text(text.to_string()))
        }),
        Some("image") => {
            let data = value.get("data").and_then(Value::as_str)?.to_string();
            let mime_type = value
                .get("mimeType")
                .or_else(|| value.get("mime_type"))
                .and_then(Value::as_str)?
                .to_string();
            if !mime_type.starts_with("image/") || data.is_empty() {
                return None;
            }
            let name = value
                .get("name")
                .and_then(Value::as_str)
                .filter(|name| !name.trim().is_empty())
                .map(str::to_string);
            Some(ContentPart::image(data, mime_type, name))
        }
        Some("resource") => {
            let resource = value.get("resource")?;
            let data = resource
                .get("text")
                .or_else(|| resource.get("blob"))
                .and_then(Value::as_str)?
                .to_string();
            if data.is_empty() {
                return None;
            }
            let mime_type = resource_mime_type(resource);
            let name = resource
                .get("name")
                .and_then(Value::as_str)
                .filter(|name| !name.trim().is_empty())
                .map(str::to_string)
                .or_else(|| {
                    resource
                        .get("uri")
                        .and_then(Value::as_str)
                        .and_then(decoded_file_name_from_uri)
                });
            Some(ContentPart::file(data, mime_type, name))
        }
        _ => None,
    }
}

fn acp_text_attachment_part(text: &str) -> Option<ContentPart> {
    parse_attached_text_resource(text).or_else(|| parse_resource_text(text))
}

fn parse_attached_text_resource(text: &str) -> Option<ContentPart> {
    let (header, data) = text.split_once("\n\n")?;
    if data.is_empty() {
        return None;
    }
    let mut lines = header.lines();
    let uri = lines.next()?.strip_prefix("Attached text resource: ")?;
    let mut mime_type = "text/plain";
    for line in lines {
        if let Some(value) = line.strip_prefix("MIME type: ")
            && !value.trim().is_empty()
        {
            mime_type = value;
        }
    }
    Some(ContentPart::file(
        data.to_string(),
        mime_type.to_string(),
        decoded_file_name_from_uri(uri),
    ))
}

fn parse_resource_text(text: &str) -> Option<ContentPart> {
    let (header, data) = text.split_once("\n\n")?;
    if data.is_empty() {
        return None;
    }
    let uri = header.strip_prefix("Resource: ")?;
    let name = decoded_file_name_from_uri(uri);
    Some(ContentPart::file(data.to_string(), "text/plain", name))
}

fn resource_mime_type(resource: &Value) -> String {
    resource
        .get("mimeType")
        .or_else(|| resource.get("mime_type"))
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("application/octet-stream")
        .to_string()
}

fn decoded_file_name_from_uri(uri: &str) -> Option<String> {
    let raw_name = uri
        .rsplit('/')
        .find(|part| !part.trim().is_empty())
        .unwrap_or(uri);
    percent_encoding::percent_decode_str(raw_name)
        .decode_utf8()
        .ok()
        .map(|name| name.into_owned())
        .filter(|name| !name.trim().is_empty())
}

fn resource_uri(value: &Value) -> Option<String> {
    value.get("uri").and_then(Value::as_str).map(str::to_string)
}

pub(in crate::acp) fn json_string(value: &Value) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| value.to_string())
}
