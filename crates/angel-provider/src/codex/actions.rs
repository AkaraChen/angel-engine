use super::*;

pub(crate) fn action_from_item(item: &Value, turn_id: &TurnId) -> Option<ActionState> {
    let item_type = item.get("type").and_then(Value::as_str)?;
    let id = item.get("id").and_then(Value::as_str)?;
    let kind = match item_type {
        "commandExecution" => ActionKind::Command,
        "fileChange" => ActionKind::FileChange,
        "mcpToolCall" => ActionKind::McpTool,
        "dynamicToolCall" if dynamic_tool_is_host_capability(item) => ActionKind::HostCapability,
        "dynamicToolCall" => ActionKind::DynamicTool,
        "webSearch" => ActionKind::WebSearch,
        "imageView" | "imageGeneration" => ActionKind::Media,
        "contextCompaction" => ActionKind::Reasoning,
        _ => return None,
    };
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
    let status = item.get("status").and_then(Value::as_str)?;
    Some(match status {
        "inProgress" => ActionPhase::Running,
        "completed" => ActionPhase::Completed,
        "failed" => ActionPhase::Failed,
        "declined" => ActionPhase::Declined,
        "interrupted" => ActionPhase::Cancelled,
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
            .is_some_and(|item_type| item_type == "imageGeneration")
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
    matches!(
        item.get("type").and_then(Value::as_str),
        Some("webSearch" | "imageView" | "imageGeneration" | "contextCompaction")
    ) || action_kind == &ActionKind::WebSearch
}

pub(crate) fn action_title(item: &Value) -> Option<String> {
    match item.get("type").and_then(Value::as_str)? {
        "commandExecution" => item
            .get("command")
            .and_then(Value::as_str)
            .map(str::to_string),
        "mcpToolCall" => Some(format!(
            "{}.{}",
            item.get("server").and_then(Value::as_str).unwrap_or("mcp"),
            item.get("tool").and_then(Value::as_str).unwrap_or("tool")
        )),
        "dynamicToolCall" if dynamic_tool_is_output_only(item) => None,
        "dynamicToolCall" => item
            .get("title")
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| {
                Some(format!(
                    "{}{}",
                    item.get("namespace")
                        .and_then(Value::as_str)
                        .map(|namespace| format!("{namespace}."))
                        .unwrap_or_default(),
                    item.get("tool").and_then(Value::as_str).unwrap_or("tool")
                ))
            }),
        "webSearch" => item
            .get("query")
            .and_then(Value::as_str)
            .map(str::to_string),
        other => Some(other.to_string()),
    }
}

pub(crate) fn dynamic_tool_has_input_payload(item: &Value) -> bool {
    item.get("arguments").is_some()
        || item.get("title").is_some()
        || item.get("inputSummary").is_some()
        || item.get("rawInput").is_some()
}

pub(crate) fn dynamic_tool_is_output_only(item: &Value) -> bool {
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
