use super::super::*;

pub(super) fn content_delta_is_empty(content: &ContentDelta) -> bool {
    match content {
        ContentDelta::Text(text)
        | ContentDelta::ResourceRef(text)
        | ContentDelta::Structured(text) => text.trim().is_empty(),
        ContentDelta::Parts(parts) => parts.iter().all(|part| match part {
            ContentPart::Text(text) => text.trim().is_empty(),
            ContentPart::Image {
                data, mime_type, ..
            } => data.is_empty() || !mime_type.starts_with("image/"),
            ContentPart::File { data, .. } => data.is_empty(),
        }),
    }
}

pub(super) fn codex_content_delta(item: &Value) -> ContentDelta {
    let parts = codex_content_parts(item);
    if parts
        .iter()
        .any(|part| matches!(part, ContentPart::Image { .. } | ContentPart::File { .. }))
    {
        return ContentDelta::Parts(parts);
    }
    ContentDelta::Text(codex_content_text(item))
}

pub(super) fn codex_content_text(item: &Value) -> String {
    item.get("content")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(codex_content_text_fragment)
        .collect::<Vec<_>>()
        .join("")
}

fn codex_content_text_fragment(part: &Value) -> Option<String> {
    match part.get("type").and_then(Value::as_str) {
        Some("skill") => {
            let name = part.get("name").and_then(Value::as_str)?;
            Some(format!("${name} "))
        }
        _ => part.get("text").and_then(Value::as_str).map(str::to_string),
    }
}

fn codex_content_parts(item: &Value) -> Vec<ContentPart> {
    item.get("content")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(codex_content_part)
        .collect()
}

fn codex_content_part(part: &Value) -> Option<ContentPart> {
    match part.get("type").and_then(Value::as_str) {
        Some("text") | Some("input_text") | Some("output_text") => {
            let text = part.get("text").and_then(Value::as_str)?;
            Some(
                codex_file_part_from_text(text)
                    .unwrap_or_else(|| ContentPart::text(text.to_string())),
            )
        }
        Some("image") | Some("input_image") => codex_image_part(part),
        Some("skill") => {
            let name = part.get("name").and_then(Value::as_str)?;
            Some(ContentPart::text(format!("${name} ")))
        }
        _ => None,
    }
}

fn codex_file_part_from_text(text: &str) -> Option<ContentPart> {
    parse_codex_blob_resource_text(text).or_else(|| parse_codex_text_resource_text(text))
}

fn parse_codex_blob_resource_text(text: &str) -> Option<ContentPart> {
    let (header, data) = text.split_once("\n\n")?;
    let mut lines = header.lines();
    let name = lines.next()?.strip_prefix("Attached file: ")?;
    let _uri = lines.next()?.strip_prefix("URI: ")?;
    let mut mime_type = "application/octet-stream";
    let mut encoding = None;
    for line in lines {
        if let Some(value) = line.strip_prefix("MIME type: ") {
            mime_type = value;
        } else if let Some(value) = line.strip_prefix("Encoding: ") {
            encoding = Some(value);
        }
    }
    if encoding != Some("base64") || data.trim().is_empty() {
        return None;
    }
    Some(ContentPart::file(
        data.to_string(),
        mime_type.to_string(),
        non_empty_name(name),
    ))
}

fn parse_codex_text_resource_text(text: &str) -> Option<ContentPart> {
    let (header, data) = text.split_once("\n\n")?;
    let mut lines = header.lines();
    let uri = lines.next()?.strip_prefix("Attached text resource: ")?;
    let mut mime_type = "text/plain";
    for line in lines {
        if let Some(value) = line.strip_prefix("MIME type: ") {
            mime_type = value;
        }
    }
    if data.is_empty() {
        return None;
    }
    Some(ContentPart::file(
        data.to_string(),
        mime_type.to_string(),
        non_empty_name(&decoded_file_name_from_uri(uri)),
    ))
}

fn file_name_from_uri(uri: &str) -> &str {
    uri.rsplit('/')
        .find(|part| !part.trim().is_empty())
        .unwrap_or(uri)
}

fn decoded_file_name_from_uri(uri: &str) -> String {
    percent_decode(file_name_from_uri(uri)).unwrap_or_else(|| file_name_from_uri(uri).to_string())
}

fn non_empty_name(name: &str) -> Option<String> {
    (!name.trim().is_empty()).then(|| name.to_string())
}

fn percent_decode(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%'
            && index + 2 < bytes.len()
            && let (Some(high), Some(low)) =
                (hex_digit(bytes[index + 1]), hex_digit(bytes[index + 2]))
        {
            decoded.push((high << 4) | low);
            index += 3;
            continue;
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

fn codex_image_part(part: &Value) -> Option<ContentPart> {
    let raw_url = part
        .get("url")
        .or_else(|| part.get("image_url"))
        .or_else(|| part.get("image"))
        .and_then(Value::as_str)?;
    let (mime_type, data) = data_image_url(raw_url)?;
    let name = part
        .get("name")
        .or_else(|| part.get("filename"))
        .and_then(Value::as_str)
        .filter(|name| !name.trim().is_empty())
        .map(str::to_string);
    Some(ContentPart::image(data, mime_type, name))
}

fn data_image_url(value: &str) -> Option<(String, String)> {
    let rest = value.strip_prefix("data:")?;
    let (meta, data) = rest.split_once(',')?;
    let mime_type = meta.split(';').next()?.to_string();
    if !mime_type.starts_with("image/") || data.is_empty() || !meta.contains(";base64") {
        return None;
    }
    Some((mime_type, data.to_string()))
}

pub(super) fn codex_reasoning_text(item: &Value) -> String {
    let summary = item
        .get("summary")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .collect::<Vec<_>>()
        .join("\n\n");
    if summary.trim().is_empty() {
        codex_content_text(item)
    } else {
        summary
    }
}
