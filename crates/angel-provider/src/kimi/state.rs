use angel_engine::event::EngineEvent;
use angel_engine::ids::ConversationId;
use angel_engine::state::{
    AvailableCommand, ConversationState, SessionMode, SessionModeState, SessionPermissionMode,
    SessionPermissionModeState,
};
use angel_engine::{AngelEngine, EngineError, ProtocolEffect};

use crate::acp::permission_modes::{decode_permission_mode, permission_mode_wire_id};

pub(super) fn conversation_has_plan_mode(engine: &AngelEngine, effect: &ProtocolEffect) -> bool {
    effect
        .conversation_id
        .as_ref()
        .and_then(|conversation_id| engine.conversations.get(conversation_id))
        .and_then(|conversation| conversation.mode_state.as_ref())
        .is_some_and(|modes| modes.available_modes.iter().any(|mode| mode.id == "plan"))
}

pub(super) fn conversation_has_yolo_permission_mode(
    engine: &AngelEngine,
    effect: &ProtocolEffect,
) -> bool {
    effect
        .conversation_id
        .as_ref()
        .and_then(|conversation_id| engine.conversations.get(conversation_id))
        .and_then(|conversation| conversation.permission_mode_state.as_ref())
        .is_some_and(|modes| {
            let yolo_mode_id = permission_mode_wire_id(KimiPermissionMode::Yolo);
            modes
                .available_modes
                .iter()
                .any(|mode| mode.id == yolo_mode_id.as_str())
        })
}

fn is_plan_command(command: &AvailableCommand) -> bool {
    command.name == "plan"
}

pub(super) fn kimi_filter_plan_command(
    commands: Vec<AvailableCommand>,
) -> (Vec<AvailableCommand>, bool) {
    let mut had_plan_command = false;
    let commands = commands
        .into_iter()
        .filter(|command| {
            if is_plan_command(command) {
                had_plan_command = true;
                false
            } else {
                true
            }
        })
        .collect();
    (commands, had_plan_command)
}

fn is_yolo_command(command: &AvailableCommand) -> bool {
    command.name == "yolo"
}

pub(super) fn kimi_filter_yolo_command(
    commands: Vec<AvailableCommand>,
) -> (Vec<AvailableCommand>, bool) {
    let mut had_yolo_command = false;
    let commands = commands
        .into_iter()
        .filter(|command| {
            if is_yolo_command(command) {
                had_yolo_command = true;
                false
            } else {
                true
            }
        })
        .collect();
    (commands, had_yolo_command)
}

pub(super) fn needs_kimi_plan_modes(
    engine: &AngelEngine,
    pending_events: &[EngineEvent],
    conversation_id: &ConversationId,
) -> bool {
    if pending_events.iter().any(|event| {
        matches!(
            event,
            EngineEvent::SessionConfigOptionsUpdated {
                conversation_id: id,
                options,
            } if id == conversation_id && options.iter().any(is_mode_config_option)
        )
    }) {
        return false;
    }

    let Some(conversation) = engine.conversations.get(conversation_id) else {
        return false;
    };
    if conversation
        .config_options
        .iter()
        .any(is_mode_config_option)
    {
        return false;
    }

    match &conversation.mode_state {
        Some(modes) => !modes.available_modes.iter().any(|mode| mode.id == "plan"),
        None => true,
    }
}

pub(super) fn needs_kimi_permission_modes(
    engine: &AngelEngine,
    pending_events: &[EngineEvent],
    conversation_id: &ConversationId,
) -> bool {
    if pending_events.iter().any(|event| {
        matches!(
            event,
            EngineEvent::SessionPermissionModesUpdated {
                conversation_id: id,
                ..
            } if id == conversation_id
        )
    }) {
        return false;
    }

    let Some(conversation) = engine.conversations.get(conversation_id) else {
        return false;
    };
    let yolo_mode_id = permission_mode_wire_id(KimiPermissionMode::Yolo);
    match &conversation.permission_mode_state {
        Some(modes) => !modes
            .available_modes
            .iter()
            .any(|mode| mode.id == yolo_mode_id.as_str()),
        None => true,
    }
}

fn is_mode_config_option(option: &angel_engine::SessionConfigOption) -> bool {
    option
        .category
        .as_deref()
        .is_some_and(|category| category == "mode")
        || option.id == "mode"
}

pub(super) fn kimi_plan_mode_state(
    engine: &AngelEngine,
    conversation_id: &ConversationId,
) -> SessionModeState {
    let current_mode_id = engine
        .conversations
        .get(conversation_id)
        .and_then(current_mode)
        .unwrap_or_else(|| "default".to_string());

    kimi_plan_mode_state_for(current_mode_id)
}

pub(super) fn kimi_plan_mode_state_for(current_mode_id: String) -> SessionModeState {
    SessionModeState {
        current_mode_id,
        available_modes: vec![
            SessionMode {
                id: "default".to_string(),
                name: "Default".to_string(),
                description: Some("Kimi default mode.".to_string()),
            },
            SessionMode {
                id: "plan".to_string(),
                name: "Plan".to_string(),
                description: Some("Kimi plan mode via /plan.".to_string()),
            },
        ],
    }
}

pub(super) fn kimi_permission_mode_state(
    engine: &AngelEngine,
    conversation_id: &ConversationId,
    startup_permission_mode: KimiPermissionMode,
) -> SessionPermissionModeState {
    let current_mode_id = engine
        .conversations
        .get(conversation_id)
        .and_then(current_permission_mode)
        .unwrap_or_else(|| permission_mode_wire_id(startup_permission_mode));

    kimi_permission_mode_state_for(current_mode_id)
}

pub(super) fn kimi_permission_mode_state_for(
    current_mode_id: String,
) -> SessionPermissionModeState {
    SessionPermissionModeState {
        current_mode_id,
        available_modes: vec![
            SessionPermissionMode {
                id: permission_mode_wire_id(KimiPermissionMode::Default),
                name: "Default".to_string(),
                description: Some("Prompt before protected Kimi actions.".to_string()),
            },
            SessionPermissionMode {
                id: permission_mode_wire_id(KimiPermissionMode::Yolo),
                name: "YOLO".to_string(),
                description: Some("Auto-approve Kimi actions via /yolo.".to_string()),
            },
        ],
    }
}

fn current_mode(conversation: &ConversationState) -> Option<String> {
    conversation
        .context
        .mode
        .effective()
        .and_then(Option::as_ref)
        .map(|mode| mode.id.clone())
        .or_else(|| {
            conversation
                .mode_state
                .as_ref()
                .map(|modes| modes.current_mode_id.clone())
        })
}

fn current_permission_mode(conversation: &ConversationState) -> Option<String> {
    conversation
        .context
        .permission_mode
        .effective()
        .and_then(Option::as_ref)
        .map(|mode| mode.id.clone())
        .or_else(|| {
            conversation
                .permission_mode_state
                .as_ref()
                .map(|modes| modes.current_mode_id.clone())
        })
}

pub(super) fn current_kimi_permission_mode(
    engine: &AngelEngine,
    effect: &ProtocolEffect,
) -> Result<Option<KimiPermissionMode>, EngineError> {
    let Some(conversation_id) = &effect.conversation_id else {
        return Ok(None);
    };
    let Some(conversation) = engine.conversations.get(conversation_id) else {
        return Ok(None);
    };
    conversation
        .permission_mode_state
        .as_ref()
        .map(|modes| decode_permission_mode::<KimiPermissionMode>(&modes.current_mode_id, "Kimi"))
        .transpose()
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
pub(super) enum KimiPermissionMode {
    #[serde(rename = "default")]
    Default,
    #[serde(rename = "yolo")]
    Yolo,
}

pub(super) fn kimi_startup_permission_mode(args: &[String]) -> KimiPermissionMode {
    if args
        .iter()
        .any(|arg| matches!(arg.as_str(), "--yolo" | "--yes" | "-y"))
    {
        KimiPermissionMode::Yolo
    } else {
        KimiPermissionMode::Default
    }
}
