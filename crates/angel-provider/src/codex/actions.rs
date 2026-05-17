use super::*;

pub(crate) fn action_from_item(item: &Value, turn_id: &TurnId) -> Option<ActionState> {
    let item = action_item(item);
    let item_type = item.get("type").and_then(Value::as_str)?;
    let id = action_id_from_item(item)?;
    let kind = action_kind_from_item(item_type, item)?;
    let mut action = ActionState::new(ActionId::new(id.to_string()), turn_id.clone(), kind);
    action.remote = Some(RemoteActionId::Known(id.to_string()));
    action.title = action_title(item);
    action.input = ActionInput {
        summary: action.title.clone(),
        raw: Some(item.to_string()),
    };
    if let Some(phase) = phase_from_item(item) {
        action.phase = phase;
    }
    Some(action)
}

pub(crate) fn fallback_action(
    action_id: ActionId,
    turn_id: TurnId,
    kind: ActionKind,
) -> ActionState {
    let mut action = ActionState::new(action_id.clone(), turn_id, kind);
    action.remote = Some(RemoteActionId::Known(action_id.to_string()));
    action.phase = ActionPhase::Running;
    let title = action_kind_title(&action.kind);
    action.title = Some(title.clone());
    action.input = ActionInput {
        summary: Some(title),
        raw: Some(json!({ "id": action_id.as_str(), "kind": action.kind }).to_string()),
    };
    action
}

pub(crate) fn action_exists(
    engine: &AngelEngine,
    conversation_id: &ConversationId,
    action_id: &ActionId,
) -> bool {
    engine
        .conversations
        .get(conversation_id)
        .map(|conversation| conversation.actions.contains_key(action_id))
        .unwrap_or(false)
}

pub(crate) fn append_completed_implicit_live_actions(
    engine: &AngelEngine,
    conversation_id: &ConversationId,
    turn_id: &TurnId,
    except_action_id: Option<&ActionId>,
    output: &mut TransportOutput,
) {
    let Some(conversation) = engine.conversations.get(conversation_id) else {
        return;
    };
    for action in conversation.actions.values() {
        if action.turn_id != *turn_id || !action_is_implicit_live_item(action) {
            continue;
        }
        if except_action_id.is_some_and(|id| id == &action.id)
            || action_phase_is_terminal(&action.phase)
        {
            continue;
        }
        output.events.push(EngineEvent::ActionUpdated {
            conversation_id: conversation_id.clone(),
            action_id: action.id.clone(),
            patch: ActionPatch::phase(ActionPhase::Completed),
        });
    }
}

pub(crate) fn phase_from_item(item: &Value) -> Option<ActionPhase> {
    let item = action_item(item);
    let status = item.get("status").and_then(Value::as_str)?;
    Some(match status {
        "inProgress" | "in_progress" | "incomplete" => ActionPhase::Running,
        "completed" => ActionPhase::Completed,
        "failed" => ActionPhase::Failed,
        "declined" => ActionPhase::Declined,
        "interrupted" | "cancelled" | "canceled" => ActionPhase::Cancelled,
        _ => ActionPhase::Running,
    })
}

pub(crate) fn completed_phase_from_item(
    item: &Value,
    action_kind: &ActionKind,
) -> Option<ActionPhase> {
    phase_from_item(item).or_else(|| {
        item_completes_without_status(item, action_kind).then_some(ActionPhase::Completed)
    })
}

pub(crate) fn dynamic_tool_is_host_capability(value: &Value) -> bool {
    matches!(
        value.get("tool").and_then(Value::as_str),
        Some("hostCapability" | "request_user_input" | "requestUserInput")
    )
}

fn action_phase_is_terminal(phase: &ActionPhase) -> bool {
    matches!(
        phase,
        ActionPhase::Completed
            | ActionPhase::Failed
            | ActionPhase::Declined
            | ActionPhase::Cancelled
    )
}

fn action_is_implicit_live_item(action: &ActionState) -> bool {
    action.kind == ActionKind::WebSearch
        || action
            .input
            .raw
            .as_deref()
            .and_then(codex_item_type_from_raw)
            .is_some_and(|item_type| {
                item_type == "imageGeneration" || item_type == "image_generation_call"
            })
}

fn codex_item_type_from_raw(raw: &str) -> Option<String> {
    serde_json::from_str::<Value>(raw).ok().and_then(|value| {
        value
            .get("type")
            .and_then(Value::as_str)
            .map(str::to_string)
    })
}

fn item_completes_without_status(item: &Value, action_kind: &ActionKind) -> bool {
    let item = action_item(item);
    matches!(
        item.get("type").and_then(Value::as_str),
        Some(
            "webSearch"
                | "web_search_call"
                | "imageView"
                | "imageGeneration"
                | "image_generation_call"
                | "contextCompaction"
                | "compaction"
        )
    ) || action_kind == &ActionKind::WebSearch
}

pub(crate) fn action_title(item: &Value) -> Option<String> {
    let item = action_item(item);
    let item_type = item.get("type").and_then(Value::as_str)?;
    if item_type == "dynamicToolCall"
        && dynamic_tool_is_host_capability(item)
        && dynamic_tool_is_output_only(item)
    {
        return None;
    }
    if matches!(
        item_type,
        "function_call_output" | "custom_tool_call_output" | "tool_search_output"
    ) {
        return None;
    }
    let title = match item_type {
        "commandExecution" => command_title(item.get("command")),
        "local_shell_call" => item
            .get("action")
            .and_then(|action| command_title(action.get("command"))),
        "fileChange" => first_non_empty_string(item, &["title", "path"])
            .or_else(|| Some(action_kind_title(&ActionKind::FileChange))),
        "mcpToolCall" => Some(format!(
            "{}.{}",
            item.get("server").and_then(Value::as_str).unwrap_or("mcp"),
            item.get("tool").and_then(Value::as_str).unwrap_or("tool")
        )),
        "mcp_call" => first_non_empty_string(item, &["name"]),
        "dynamicToolCall" => first_non_empty_string(item, &["title"])
            .or_else(|| dynamic_tool_title(item))
            .or_else(|| Some(action_kind_title(&ActionKind::DynamicTool))),
        "webSearch" | "web_search_call" => web_search_title(item),
        "imageView" => first_non_empty_string(item, &["path"])
            .map(|path| format!("View image: {path}"))
            .or_else(|| Some(action_kind_title(&ActionKind::Media))),
        "imageGeneration" => first_non_empty_string(item, &["revisedPrompt", "prompt"])
            .or_else(|| Some("Image generation".to_string())),
        "image_generation_call" => first_non_empty_string(item, &["revised_prompt", "prompt"])
            .or_else(|| Some("Image generation".to_string())),
        "contextCompaction" | "compaction" => Some("Context compaction".to_string()),
        "function_call" | "custom_tool_call" => tool_name_title(item),
        "tool_search_call" => Some("tool_search".to_string()),
        _ => None,
    }
    .filter(|title| !title.trim().is_empty());
    title.or_else(|| action_kind_from_item(item_type, item).map(|kind| action_kind_title(&kind)))
}

pub(crate) fn dynamic_tool_has_input_payload(item: &Value) -> bool {
    let item = action_item(item);
    item.get("arguments").is_some()
        || item.get("title").is_some()
        || item.get("inputSummary").is_some()
        || item.get("rawInput").is_some()
}

pub(crate) fn dynamic_tool_is_output_only(item: &Value) -> bool {
    let item = action_item(item);
    item.get("type").and_then(Value::as_str) == Some("dynamicToolCall")
        && !dynamic_tool_has_input_payload(item)
        && [
            "contentItems",
            "content_items",
            "output",
            "result",
            "content",
            "aggregatedOutput",
        ]
        .iter()
        .any(|key| item.get(*key).is_some())
}

pub(crate) fn normalize_action_item_title(item: &mut Value) {
    let Some(title) = action_title(item).filter(|title| !title.trim().is_empty()) else {
        return;
    };
    let item = action_item_mut(item);
    let Value::Object(fields) = item else {
        return;
    };
    let has_title = fields
        .get("title")
        .and_then(Value::as_str)
        .is_some_and(|title| !title.trim().is_empty());
    if !has_title {
        fields.insert("title".to_string(), Value::String(title));
    }
}

pub(crate) fn action_id_from_item(item: &Value) -> Option<&str> {
    let item = action_item(item);
    let item_type = item.get("type").and_then(Value::as_str)?;
    let keys = match item_type {
        "dynamicToolCall"
        | "function_call"
        | "function_call_output"
        | "custom_tool_call"
        | "custom_tool_call_output"
        | "tool_search_call"
        | "tool_search_output"
        | "local_shell_call" => &["callId", "call_id", "id", "itemId"][..],
        _ => &["id", "callId", "call_id", "itemId"][..],
    };
    keys.iter()
        .filter_map(|key| item.get(*key).and_then(Value::as_str))
        .find(|value| !value.trim().is_empty())
}

fn action_item(item: &Value) -> &Value {
    if item.get("type").and_then(Value::as_str) == Some("response_item")
        && let Some(payload) = item.get("payload").filter(|payload| payload.is_object())
    {
        return payload;
    }
    item
}

fn action_item_mut(item: &mut Value) -> &mut Value {
    if item.get("type").and_then(Value::as_str) == Some("response_item")
        && item
            .get("payload")
            .is_some_and(|payload| payload.is_object())
    {
        return item
            .get_mut("payload")
            .expect("payload existence checked above");
    }
    item
}

fn action_kind_from_item(item_type: &str, item: &Value) -> Option<ActionKind> {
    let kind = match item_type {
        "commandExecution" | "local_shell_call" => ActionKind::Command,
        "fileChange" => ActionKind::FileChange,
        "mcpToolCall" | "mcp_call" => ActionKind::McpTool,
        "dynamicToolCall" if dynamic_tool_is_host_capability(item) => ActionKind::HostCapability,
        "dynamicToolCall" | "tool_search_call" => ActionKind::DynamicTool,
        "webSearch" | "web_search_call" => ActionKind::WebSearch,
        "imageView" | "imageGeneration" | "image_generation_call" => ActionKind::Media,
        "contextCompaction" | "compaction" => ActionKind::Reasoning,
        "function_call" => {
            if is_codex_command_tool_name(first_non_empty_string(item, &["name"]).as_deref()) {
                ActionKind::Command
            } else {
                ActionKind::DynamicTool
            }
        }
        "custom_tool_call" => {
            if first_non_empty_string(item, &["name"]).as_deref() == Some("apply_patch") {
                ActionKind::FileChange
            } else {
                ActionKind::DynamicTool
            }
        }
        _ => return None,
    };
    Some(kind)
}

fn first_non_empty_string(item: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| item.get(*key).and_then(Value::as_str))
        .find(|value| !value.trim().is_empty())
        .map(str::to_string)
}

fn command_title(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::String(command) if !command.trim().is_empty() => Some(command.clone()),
        Value::Array(parts) => {
            let command = parts
                .iter()
                .filter_map(Value::as_str)
                .filter(|part| !part.trim().is_empty())
                .collect::<Vec<_>>()
                .join(" ");
            (!command.is_empty()).then_some(command)
        }
        _ => None,
    }
}

fn dynamic_tool_title(item: &Value) -> Option<String> {
    item.get("tool")
        .and_then(Value::as_str)
        .filter(|tool| !tool.trim().is_empty())
        .map(|tool| {
            item.get("namespace")
                .and_then(Value::as_str)
                .filter(|namespace| !namespace.trim().is_empty())
                .map(|namespace| format!("{namespace}.{tool}"))
                .unwrap_or_else(|| tool.to_string())
        })
}

fn tool_name_title(item: &Value) -> Option<String> {
    item.get("name")
        .and_then(Value::as_str)
        .filter(|name| !name.trim().is_empty())
        .map(|name| {
            item.get("namespace")
                .and_then(Value::as_str)
                .filter(|namespace| !namespace.trim().is_empty())
                .map(|namespace| format!("{namespace}.{name}"))
                .unwrap_or_else(|| name.to_string())
        })
}

fn web_search_title(item: &Value) -> Option<String> {
    first_non_empty_string(item, &["query"])
        .or_else(|| item.get("action").and_then(web_search_action_title))
        .or_else(|| Some(action_kind_title(&ActionKind::WebSearch)))
}

fn web_search_action_title(action: &Value) -> Option<String> {
    match action.get("type").and_then(Value::as_str) {
        Some("search") => first_non_empty_string(action, &["query"])
            .or_else(|| {
                let queries = action
                    .get("queries")
                    .and_then(Value::as_array)?
                    .iter()
                    .filter_map(Value::as_str)
                    .filter(|query| !query.trim().is_empty())
                    .collect::<Vec<_>>();
                (!queries.is_empty()).then(|| queries.join(", "))
            })
            .or_else(|| Some(action_kind_title(&ActionKind::WebSearch))),
        Some("openPage") => first_non_empty_string(action, &["url"])
            .map(|url| format!("Open page: {url}"))
            .or_else(|| Some("Open page".to_string())),
        Some("findInPage") => {
            let pattern = first_non_empty_string(action, &["pattern"]);
            let url = first_non_empty_string(action, &["url"]);
            match (pattern, url) {
                (Some(pattern), Some(url)) => Some(format!("Find in page: {pattern} ({url})")),
                (Some(pattern), None) => Some(format!("Find in page: {pattern}")),
                (None, Some(url)) => Some(format!("Find in page: {url}")),
                (None, None) => Some("Find in page".to_string()),
            }
        }
        Some("other") | None => None,
        Some(other) => Some(other.to_string()),
    }
}

fn action_kind_title(kind: &ActionKind) -> String {
    match kind {
        ActionKind::Command => "Command",
        ActionKind::FileChange => "File change",
        ActionKind::Read => "Read",
        ActionKind::Write => "Write",
        ActionKind::McpTool => "MCP tool",
        ActionKind::DynamicTool => "Dynamic tool",
        ActionKind::SubAgent => "Subagent",
        ActionKind::WebSearch => "Web search",
        ActionKind::Media => "Media",
        ActionKind::Reasoning => "Reasoning",
        ActionKind::Plan => "Plan",
        ActionKind::HostCapability => "Host capability",
    }
    .to_string()
}

fn is_codex_command_tool_name(name: Option<&str>) -> bool {
    matches!(name, Some("shell" | "exec_command" | "write_stdin"))
}

pub(crate) fn turn_error(turn: Option<&Value>) -> Option<ErrorInfo> {
    let error = turn?.get("error").filter(|value| !value.is_null())?;
    Some(ErrorInfo::new(
        "codex.turn_failed",
        error
            .get("message")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| error.to_string()),
    ))
}

pub(crate) fn approval_body(method: &str, params: &Value) -> Option<String> {
    match method {
        "item/commandExecution/requestApproval" => params
            .get("command")
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| {
                params
                    .get("reason")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            }),
        "item/fileChange/requestApproval" | "item/permissions/requestApproval" => params
            .get("reason")
            .and_then(Value::as_str)
            .map(str::to_string),
        "item/tool/requestUserInput" => params
            .get("questions")
            .and_then(Value::as_array)
            .and_then(|questions| questions.first())
            .and_then(|question| question.get("question"))
            .and_then(Value::as_str)
            .map(str::to_string),
        "mcpServer/elicitation/request" => params
            .get("message")
            .and_then(Value::as_str)
            .map(str::to_string),
        "item/tool/call" => Some(format!(
            "{}{}",
            params
                .get("namespace")
                .and_then(Value::as_str)
                .map(|namespace| format!("{namespace}."))
                .unwrap_or_default(),
            params.get("tool").and_then(Value::as_str).unwrap_or("tool")
        )),
        _ => None,
    }
}

pub(crate) fn action_kind_for_request(method: &str, params: &Value) -> ActionKind {
    if method == "item/tool/call" && dynamic_tool_is_host_capability(params) {
        return ActionKind::HostCapability;
    }

    match method {
        "item/commandExecution/requestApproval" => ActionKind::Command,
        "item/fileChange/requestApproval" => ActionKind::FileChange,
        "item/tool/call" => ActionKind::DynamicTool,
        "mcpServer/elicitation/request" => ActionKind::McpTool,
        _ => ActionKind::HostCapability,
    }
}
