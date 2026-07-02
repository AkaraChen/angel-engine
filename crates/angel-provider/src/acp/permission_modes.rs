use angel_engine::{AngelEngine, EngineError, ProtocolEffect};
use serde::{Serialize, de::DeserializeOwned};
use serde_json::Value;

pub(crate) fn acp_permission_mode_session_id(
    engine: &AngelEngine,
    effect: &ProtocolEffect,
    provider: &str,
) -> Result<String, EngineError> {
    let conversation_id =
        effect
            .conversation_id
            .as_ref()
            .ok_or_else(|| EngineError::InvalidCommand {
                message: format!("missing conversation id for {provider} permission mode update"),
            })?;
    let conversation = engine.conversations.get(conversation_id).ok_or_else(|| {
        EngineError::ConversationNotFound {
            conversation_id: conversation_id.to_string(),
        }
    })?;
    conversation
        .remote
        .as_protocol_id()
        .map(str::to_string)
        .ok_or_else(|| EngineError::InvalidState {
            expected: format!("{provider} ACP session id"),
            actual: format!("{:?}", conversation.remote),
        })
}

pub(crate) fn decode_permission_mode<T: DeserializeOwned>(
    value: &str,
    provider: &str,
) -> Result<T, EngineError> {
    serde_json::from_value(Value::String(value.to_string())).map_err(|error| {
        EngineError::InvalidState {
            expected: format!("canonical {provider} permission mode id"),
            actual: format!("{value:?}: {error}"),
        }
    })
}

pub(crate) fn permission_mode_wire_id<T: Serialize>(mode: T) -> String {
    let value = serde_json::to_value(mode).expect("permission mode serializes to a string");
    let Value::String(id) = value else {
        unreachable!("permission mode serialized to non-string JSON");
    };
    id
}

pub(crate) fn permission_mode_effect<T: DeserializeOwned>(
    effect: &ProtocolEffect,
    provider: &str,
) -> Result<Option<T>, EngineError> {
    let fields = &effect.payload.fields;
    if fields.get("contextUpdate").map(String::as_str) != Some("permissionMode") {
        return Ok(None);
    }
    fields
        .get("permissionMode")
        .map(|mode| decode_permission_mode(mode, provider))
        .transpose()
}
