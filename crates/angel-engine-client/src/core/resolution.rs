use angel_engine::{
    AvailableModeState, AvailablePermissionModeState, ConversationId, SessionMode,
    SessionPermissionMode, TurnId,
};

use crate::error::{ClientError, ClientResult};

pub(super) fn to_conversation_id(id: impl Into<String>) -> ConversationId {
    ConversationId::new(id.into())
}

pub(super) fn to_turn_id(id: impl Into<String>) -> TurnId {
    TurnId::new(id.into())
}

pub(super) fn resolve_mode_request(
    settings: &AvailableModeState,
    requested: &str,
) -> ClientResult<String> {
    let requested = requested.trim();
    if requested.is_empty() {
        return Err(ClientError::InvalidInput {
            message: "mode is required".to_string(),
        });
    }
    if settings.available_modes.is_empty() {
        return Err(ClientError::InvalidInput {
            message: "conversation has no available modes".to_string(),
        });
    }
    if settings
        .available_modes
        .iter()
        .any(|mode| mode.id == requested)
    {
        return Ok(requested.to_string());
    }

    let normalized = normalized_mode_key(requested);
    settings
        .available_modes
        .iter()
        .find(|mode| mode_matches_request(mode, &normalized))
        .map(|mode| mode.id.clone())
        .ok_or_else(|| ClientError::InvalidInput {
            message: format!("unknown mode: {requested}"),
        })
}

pub(super) fn resolve_permission_mode_request(
    settings: &AvailablePermissionModeState,
    requested: &str,
) -> ClientResult<String> {
    let requested = requested.trim();
    if requested.is_empty() {
        return Err(ClientError::InvalidInput {
            message: "permission mode is required".to_string(),
        });
    }
    if settings.available_modes.is_empty() {
        return Err(ClientError::InvalidInput {
            message: "conversation has no available permission modes".to_string(),
        });
    }
    if settings
        .available_modes
        .iter()
        .any(|mode| mode.id == requested)
    {
        return Ok(requested.to_string());
    }

    let normalized = normalized_mode_key(requested);
    settings
        .available_modes
        .iter()
        .find(|mode| permission_mode_matches_request(mode, &normalized))
        .map(|mode| mode.id.clone())
        .ok_or_else(|| ClientError::InvalidInput {
            message: format!("unknown permission mode: {requested}"),
        })
}

fn mode_matches_request(mode: &SessionMode, requested: &str) -> bool {
    normalized_mode_key(&mode.name) == requested
        || mode
            .id
            .rsplit(['#', '/', ':'])
            .next()
            .is_some_and(|suffix| normalized_mode_key(suffix) == requested)
}

fn permission_mode_matches_request(mode: &SessionPermissionMode, requested: &str) -> bool {
    normalized_mode_key(&mode.name) == requested
        || mode
            .id
            .rsplit(['#', '/', ':'])
            .next()
            .is_some_and(|suffix| normalized_mode_key(suffix) == requested)
}

fn normalized_mode_key(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}
