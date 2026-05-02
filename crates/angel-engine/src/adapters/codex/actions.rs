use super::*;

pub(crate) fn action_from_item(item: &Value, turn_id: &TurnId) -> Option<ActionState> {
    let item_type = item.get("type").and_then(Value::as_str)?;
    let id = item.get("id").and_then(Value::as_str)?;
    let kind = match item_type {
        "commandExecution" => ActionKind::Command,
        "fileChange" => ActionKind::FileChange,
        "mcpToolCall" => ActionKind::McpTool,
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
        "dynamicToolCall" => Some(format!(
            "{}{}",
            item.get("namespace")
                .and_then(Value::as_str)
                .map(|namespace| format!("{namespace}."))
                .unwrap_or_default(),
            item.get("tool").and_then(Value::as_str).unwrap_or("tool")
        )),
        "webSearch" => item
            .get("query")
            .and_then(Value::as_str)
            .map(str::to_string),
        other => Some(other.to_string()),
    }
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

pub(crate) fn action_kind_for_request(method: &str) -> ActionKind {
    match method {
        "item/commandExecution/requestApproval" => ActionKind::Command,
        "item/fileChange/requestApproval" => ActionKind::FileChange,
        "item/tool/call" => ActionKind::DynamicTool,
        "mcpServer/elicitation/request" => ActionKind::McpTool,
        _ => ActionKind::HostCapability,
    }
}
