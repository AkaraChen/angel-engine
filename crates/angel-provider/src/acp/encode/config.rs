use super::super::helpers::{acp_outbound_summary, acp_session_id};
use super::super::*;

pub(super) fn update_context_effect(
    engine: &AngelEngine,
    effect: &angel_engine::ProtocolEffect,
) -> Result<TransportOutput, angel_engine::EngineError> {
    let Some((method, params)) = acp_update_context_message(engine, effect)? else {
        let mut output = TransportOutput::default().log(
            TransportLogKind::State,
            "ACP context update has no supported write",
        );
        if let Some(request_id) = &effect.request_id {
            output.completed_requests.push(request_id.clone());
        }
        return Ok(output);
    };

    let mut output = TransportOutput::default().log(
        TransportLogKind::Send,
        format!("{} {}", method, acp_outbound_summary(&method, &params)),
    );
    let message = if let Some(request_id) = &effect.request_id {
        JsonRpcMessage::request(request_id.clone(), method, params)
    } else {
        JsonRpcMessage::notification(method, params)
    };
    output.messages.push(message);
    Ok(output)
}

pub(super) fn set_config_option_params(
    engine: &AngelEngine,
    effect: &angel_engine::ProtocolEffect,
) -> Result<Value, angel_engine::EngineError> {
    Ok(json!({
        "sessionId": acp_session_id(engine, effect)?,
        "configId": effect.payload.fields.get("configId").cloned().unwrap_or_default(),
        "value": effect.payload.fields.get("value").cloned().unwrap_or_default(),
    }))
}

pub(super) fn set_mode_params(
    engine: &AngelEngine,
    effect: &angel_engine::ProtocolEffect,
) -> Result<Value, angel_engine::EngineError> {
    Ok(json!({
        "sessionId": acp_session_id(engine, effect)?,
        "modeId": effect.payload.fields.get("modeId").cloned().unwrap_or_default(),
    }))
}

pub(super) fn set_model_params(
    engine: &AngelEngine,
    effect: &angel_engine::ProtocolEffect,
) -> Result<Value, angel_engine::EngineError> {
    Ok(json!({
        "sessionId": acp_session_id(engine, effect)?,
        "modelId": effect.payload.fields.get("modelId").cloned().unwrap_or_default(),
    }))
}

fn acp_update_context_message(
    engine: &AngelEngine,
    effect: &angel_engine::ProtocolEffect,
) -> Result<Option<(String, Value)>, angel_engine::EngineError> {
    let session_id = acp_session_id(engine, effect)?;
    let Some(update) = acp_context_update(effect) else {
        return Ok(None);
    };
    let conversation_id = effect.conversation_id.as_ref().ok_or_else(|| {
        angel_engine::EngineError::InvalidCommand {
            message: "missing conversation id".to_string(),
        }
    })?;
    let conversation = engine.conversations.get(conversation_id).ok_or_else(|| {
        angel_engine::EngineError::ConversationNotFound {
            conversation_id: conversation_id.to_string(),
        }
    })?;

    let message = match update {
        AcpContextUpdate::Model(model) => {
            if let Some(option) = acp_find_model_config_option(&conversation.config_options) {
                acp_set_config_option_message(&session_id, option, model)
            } else {
                Some((
                    "session/set_model".to_string(),
                    json!({
                        "sessionId": session_id,
                        "modelId": model,
                    }),
                ))
            }
        }
        AcpContextUpdate::Mode(mode) => {
            if let Some(option) = acp_find_mode_config_option(&conversation.config_options) {
                acp_set_config_option_message(&session_id, option, mode)
            } else {
                Some((
                    "session/set_mode".to_string(),
                    json!({
                        "sessionId": session_id,
                        "modeId": mode,
                    }),
                ))
            }
        }
        AcpContextUpdate::PermissionMode(mode) => {
            acp_find_permission_mode_config_option(&conversation.config_options)
                .and_then(|option| acp_set_config_option_message(&session_id, option, mode))
        }
        AcpContextUpdate::Reasoning(effort) => {
            acp_find_reasoning_config_option(&conversation.config_options)
                .and_then(|option| acp_set_config_option_message(&session_id, option, effort))
        }
        AcpContextUpdate::Approval(approval) => acp_find_config_option(
            &conversation.config_options,
            "approval",
            &[
                "approval",
                "approvals",
                "approval_policy",
                "permission",
                "permissions",
            ],
        )
        .and_then(|option| {
            acp_set_config_option_message(&session_id, option, acp_approval_value(&approval))
        }),
        AcpContextUpdate::Sandbox(sandbox) => {
            acp_find_config_option(&conversation.config_options, "sandbox", &["sandbox"]).and_then(
                |option| {
                    acp_set_config_option_message(&session_id, option, acp_sandbox_value(&sandbox))
                },
            )
        }
        AcpContextUpdate::Permissions(permissions) => acp_find_config_option(
            &conversation.config_options,
            "permission",
            &["permission", "permissions", "permission_profile"],
        )
        .and_then(|option| acp_set_config_option_message(&session_id, option, permissions)),
    };
    Ok(message)
}

fn acp_set_config_option_message(
    session_id: &str,
    option: &SessionConfigOption,
    value: String,
) -> Option<(String, Value)> {
    Some((
        "session/set_config_option".to_string(),
        json!({
            "sessionId": session_id,
            "configId": option.id.clone(),
            "value": value,
        }),
    ))
}

enum AcpContextUpdate {
    Model(String),
    Mode(String),
    PermissionMode(String),
    Reasoning(String),
    Approval(String),
    Sandbox(String),
    Permissions(String),
}

fn acp_context_update(effect: &angel_engine::ProtocolEffect) -> Option<AcpContextUpdate> {
    let fields = &effect.payload.fields;
    match fields.get("contextUpdate").map(String::as_str) {
        Some("model") => fields.get("model").cloned().map(AcpContextUpdate::Model),
        Some("mode") => fields.get("mode").cloned().map(AcpContextUpdate::Mode),
        Some("permissionMode") => fields
            .get("permissionMode")
            .cloned()
            .map(AcpContextUpdate::PermissionMode),
        Some("reasoning") | Some("effort") => fields
            .get("reasoning")
            .or_else(|| fields.get("reasoningEffort"))
            .or_else(|| fields.get("effort"))
            .cloned()
            .map(AcpContextUpdate::Reasoning),
        Some("approval") | Some("approvalPolicy") => fields
            .get("approval")
            .or_else(|| fields.get("approvalPolicy"))
            .cloned()
            .map(AcpContextUpdate::Approval),
        Some("sandbox") => fields
            .get("sandbox")
            .cloned()
            .map(AcpContextUpdate::Sandbox),
        Some("permissions") => fields
            .get("permissions")
            .cloned()
            .map(AcpContextUpdate::Permissions),
        _ => fields
            .get("model")
            .cloned()
            .map(AcpContextUpdate::Model)
            .or_else(|| fields.get("mode").cloned().map(AcpContextUpdate::Mode))
            .or_else(|| {
                fields
                    .get("permissionMode")
                    .cloned()
                    .map(AcpContextUpdate::PermissionMode)
            })
            .or_else(|| {
                fields
                    .get("reasoning")
                    .or_else(|| fields.get("reasoningEffort"))
                    .or_else(|| fields.get("effort"))
                    .cloned()
                    .map(AcpContextUpdate::Reasoning)
            })
            .or_else(|| {
                fields
                    .get("approval")
                    .or_else(|| fields.get("approvalPolicy"))
                    .cloned()
                    .map(AcpContextUpdate::Approval)
            })
            .or_else(|| {
                fields
                    .get("sandbox")
                    .cloned()
                    .map(AcpContextUpdate::Sandbox)
            })
            .or_else(|| {
                fields
                    .get("permissions")
                    .cloned()
                    .map(AcpContextUpdate::Permissions)
            }),
    }
}

fn acp_find_model_config_option(options: &[SessionConfigOption]) -> Option<&SessionConfigOption> {
    acp_find_config_option(options, "model", &["model"])
}

fn acp_find_mode_config_option(options: &[SessionConfigOption]) -> Option<&SessionConfigOption> {
    acp_find_config_option(options, "mode", &["mode"])
}

fn acp_find_permission_mode_config_option(
    options: &[SessionConfigOption],
) -> Option<&SessionConfigOption> {
    acp_find_config_option(
        options,
        "permissionMode",
        &[
            "permission_mode",
            "permissions_mode",
            "permission_mode_id",
            "approval_mode",
        ],
    )
}

fn acp_find_reasoning_config_option(
    options: &[SessionConfigOption],
) -> Option<&SessionConfigOption> {
    acp_find_config_option(
        options,
        "thought_level",
        &[
            "thought_level",
            "reasoning",
            "reasoning_effort",
            "effort",
            "thinking",
            "thought",
        ],
    )
}

fn acp_find_config_option<'a>(
    options: &'a [SessionConfigOption],
    category: &str,
    ids: &[&str],
) -> Option<&'a SessionConfigOption> {
    let targets = ids
        .iter()
        .map(|id| normalize_config_id(id))
        .collect::<Vec<_>>();
    options
        .iter()
        .find(|option| {
            let id = normalize_config_id(&option.id);
            let name = normalize_config_id(&option.name);
            targets
                .iter()
                .any(|target| target == &id || target == &name)
        })
        .or_else(|| {
            options
                .iter()
                .find(|option| option.category.as_deref() == Some(category))
        })
}

fn normalize_config_id(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn acp_approval_value(value: &str) -> String {
    match normalize_config_id(value).as_str() {
        "onrequest" => "on-request".to_string(),
        "onfailure" => "on-failure".to_string(),
        "unlesstrusted" => "untrusted".to_string(),
        "never" => "never".to_string(),
        _ => value.to_string(),
    }
}

fn acp_sandbox_value(value: &str) -> String {
    match normalize_config_id(value).as_str() {
        "readonly" => "read-only".to_string(),
        "workspacewrite" => "workspace-write".to_string(),
        "fullaccess" | "dangerfullaccess" => "danger-full-access".to_string(),
        _ => value.to_string(),
    }
}
