use super::super::helpers::acp_session_id;
use super::super::*;

pub(super) fn start_conversation_params(
    engine: &AngelEngine,
    effect: &angel_engine::ProtocolEffect,
) -> Value {
    let mut params = serde_json::Map::new();
    params.insert("cwd".to_string(), json!(acp_effect_cwd(engine, effect)));
    insert_additional_directories(&mut params, effect);
    params.insert("mcpServers".to_string(), json!([]));
    Value::Object(params)
}

pub(super) fn resume_conversation_params(
    engine: &AngelEngine,
    effect: &angel_engine::ProtocolEffect,
) -> Value {
    let mut params = serde_json::Map::new();
    params.insert(
        "sessionId".to_string(),
        json!(
            effect
                .payload
                .fields
                .get("remoteConversationId")
                .or_else(|| effect.payload.fields.get("sessionId"))
                .cloned()
                .unwrap_or_default()
        ),
    );
    params.insert("cwd".to_string(), json!(acp_effect_cwd(engine, effect)));
    insert_additional_directories(&mut params, effect);
    params.insert("mcpServers".to_string(), json!([]));
    Value::Object(params)
}

pub(super) fn session_id_params(
    engine: &AngelEngine,
    effect: &angel_engine::ProtocolEffect,
) -> Result<Value, angel_engine::EngineError> {
    Ok(json!({
        "sessionId": acp_session_id(engine, effect)?,
    }))
}

pub(super) fn list_conversations_params(effect: &angel_engine::ProtocolEffect) -> Value {
    let mut params = serde_json::Map::new();
    if let Some(cwd) = effect.payload.fields.get("cwd") {
        params.insert("cwd".to_string(), json!(cwd));
    }
    if let Some(cursor) = effect.payload.fields.get("cursor") {
        params.insert("cursor".to_string(), json!(cursor));
    }
    insert_additional_directories(&mut params, effect);
    Value::Object(params)
}

pub(super) fn acp_fork_params(
    engine: &AngelEngine,
    effect: &angel_engine::ProtocolEffect,
) -> Result<Value, angel_engine::EngineError> {
    let source_id = effect
        .payload
        .fields
        .get("sourceConversationId")
        .ok_or_else(|| angel_engine::EngineError::InvalidCommand {
            message: "missing source conversation id for ACP fork".to_string(),
        })?;
    let source = engine
        .conversations
        .get(&ConversationId::new(source_id.clone()))
        .ok_or_else(|| angel_engine::EngineError::ConversationNotFound {
            conversation_id: source_id.clone(),
        })?;
    let session_id =
        source
            .remote
            .as_protocol_id()
            .ok_or_else(|| angel_engine::EngineError::InvalidState {
                expected: "source ACP session id".to_string(),
                actual: format!("{:?}", source.remote),
            })?;
    let cwd = source
        .context
        .cwd
        .effective()
        .and_then(|cwd| cwd.as_ref())
        .map(|cwd| cwd.display().to_string())
        .unwrap_or_else(|| acp_effect_cwd(engine, effect));
    let mut params = serde_json::Map::new();
    params.insert("sessionId".to_string(), json!(session_id));
    params.insert("cwd".to_string(), json!(cwd));
    insert_additional_directories(&mut params, effect);
    params.insert("mcpServers".to_string(), json!([]));
    Ok(Value::Object(params))
}

fn acp_effect_cwd(engine: &AngelEngine, effect: &angel_engine::ProtocolEffect) -> String {
    if let Some(cwd) = effect.payload.fields.get("cwd") {
        return cwd.clone();
    }
    if let Some(cwd) = effect
        .conversation_id
        .as_ref()
        .and_then(|id| engine.conversations.get(id))
        .and_then(|conversation| conversation.context.cwd.effective())
        .and_then(|cwd| cwd.as_ref())
    {
        return cwd.display().to_string();
    }
    std::env::current_dir()
        .map(|path| path.display().to_string())
        .unwrap_or_else(|_| ".".to_string())
}

fn acp_additional_directories(effect: &angel_engine::ProtocolEffect) -> Vec<Value> {
    let count = effect
        .payload
        .fields
        .get("additionalDirectoryCount")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(0);
    (0..count)
        .filter_map(|index| {
            effect
                .payload
                .fields
                .get(&format!("additionalDirectory.{index}"))
                .map(|directory| json!(directory))
        })
        .collect()
}

fn insert_additional_directories(
    target: &mut serde_json::Map<String, Value>,
    effect: &angel_engine::ProtocolEffect,
) {
    let additional_directories = acp_additional_directories(effect);
    if !additional_directories.is_empty() {
        target.insert(
            "additionalDirectories".to_string(),
            Value::Array(additional_directories),
        );
    }
}
