use super::*;

pub(super) fn append_codex_default_settings(
    output: &mut TransportOutput,
    engine: &AngelEngine,
    conversation_id: &ConversationId,
) {
    let conversation = engine.conversations.get(conversation_id);
    if conversation
        .and_then(|conversation| conversation.mode_state.as_ref())
        .is_none()
    {
        output.events.push(EngineEvent::SessionModesUpdated {
            conversation_id: conversation_id.clone(),
            modes: SessionModeState {
                current_mode_id: codex_current_collaboration_mode(conversation),
                available_modes: CodexCollaborationMode::ALL
                    .into_iter()
                    .map(|mode| SessionMode {
                        id: mode.id().to_string(),
                        name: mode.name().to_string(),
                        description: mode.description().map(str::to_string),
                    })
                    .collect(),
            },
        });
    }

    if conversation
        .and_then(|conversation| conversation.permission_mode_state.as_ref())
        .is_none()
    {
        output
            .events
            .push(EngineEvent::SessionPermissionModesUpdated {
                conversation_id: conversation_id.clone(),
                modes: SessionPermissionModeState {
                    current_mode_id: codex_current_permission_mode(conversation),
                    available_modes: CodexPermissionMode::ALL
                        .into_iter()
                        .map(|mode| SessionPermissionMode {
                            id: mode.id().to_string(),
                            name: mode.name().to_string(),
                            description: mode.description().map(str::to_string),
                        })
                        .collect(),
                },
            });
    }

    if conversation.map_or(true, |conversation| {
        !codex_has_reasoning_option(conversation)
    }) {
        let mut options = conversation
            .map(|conversation| conversation.config_options.clone())
            .unwrap_or_default();
        options.push(codex_reasoning_config_option(
            conversation
                .and_then(|conversation| {
                    conversation
                        .context
                        .reasoning
                        .effective()
                        .and_then(Option::as_ref)
                        .and_then(|reasoning| reasoning.effort.clone())
                })
                .unwrap_or_else(|| "none".to_string()),
        ));
        output
            .events
            .push(EngineEvent::SessionConfigOptionsUpdated {
                conversation_id: conversation_id.clone(),
                options,
            });
    }
}

fn codex_current_collaboration_mode(
    conversation: Option<&angel_engine::state::ConversationState>,
) -> String {
    conversation
        .and_then(|conversation| {
            conversation
                .context
                .mode
                .effective()
                .and_then(Option::as_ref)
                .and_then(|mode| CodexCollaborationMode::from_id(&mode.id))
        })
        .unwrap_or(CodexCollaborationMode::Default)
        .id()
        .to_string()
}

fn codex_current_permission_mode(
    conversation: Option<&angel_engine::state::ConversationState>,
) -> String {
    conversation
        .and_then(|conversation| {
            conversation
                .context
                .permission_mode
                .effective()
                .and_then(Option::as_ref)
                .and_then(|mode| CodexPermissionMode::from_id(&mode.id))
        })
        .or_else(|| {
            conversation.and_then(|conversation| {
                conversation
                    .context
                    .approvals
                    .effective()
                    .map(CodexPermissionMode::from_approval_policy)
            })
        })
        .unwrap_or(CodexPermissionMode::OnRequest)
        .id()
        .to_string()
}

fn codex_has_reasoning_option(conversation: &angel_engine::state::ConversationState) -> bool {
    conversation.config_options.iter().any(|option| {
        option.category.as_deref() == Some("reasoning")
            || codex_config_name_matches(&option.id, &["reasoning", "effort"])
            || codex_config_name_matches(&option.name, &["reasoning", "effort"])
    })
}

fn codex_reasoning_config_option(current_value: String) -> SessionConfigOption {
    SessionConfigOption {
        id: "reasoning".to_string(),
        name: "Reasoning".to_string(),
        description: None,
        category: Some("reasoning".to_string()),
        current_value,
        values: ["none", "low", "medium", "high", "xhigh"]
            .into_iter()
            .map(|value| SessionConfigValue {
                value: value.to_string(),
                name: codex_setting_label(value),
                description: None,
            })
            .collect(),
    }
}

fn codex_setting_label(value: &str) -> String {
    value
        .split(['_', '-'])
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => format!("{}{}", first.to_ascii_uppercase(), chars.as_str()),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn codex_config_name_matches(value: &str, targets: &[&str]) -> bool {
    let normalized = codex_normalized_config_name(value);
    targets
        .iter()
        .any(|target| normalized == codex_normalized_config_name(target))
}

fn codex_normalized_config_name(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}
