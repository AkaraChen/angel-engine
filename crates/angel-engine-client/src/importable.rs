//! Pure helpers that project engine conversation snapshots into importable
//! session DTOs used by desktop/daemon import flows.

use crate::snapshot::ConversationSnapshot;
use crate::{ImportableSession, ListImportableSessionsResult};

/// Project a conversation snapshot into an importable session when it has a
/// known remote id. List-discovered entries are the primary source; idle/ready
/// sessions that already carry remote identity also qualify. Local/pending
/// remotes and in-flight lifecycles are skipped.
pub fn importable_session_from_conversation(
    conversation: &ConversationSnapshot,
) -> Option<ImportableSession> {
    let remote_id = conversation.remote_id.as_ref()?;
    if remote_id.trim().is_empty() {
        return None;
    }
    if conversation.remote_kind != "known" {
        return None;
    }
    // Discovery only marks listed sessions as `discovered`. Idle conversations
    // are currently open threads and must not pollute the import picker.
    if conversation.lifecycle != "discovered" {
        return None;
    }

    Some(ImportableSession {
        remote_id: remote_id.clone(),
        title: conversation
            .context
            .raw
            .get("conversation.title")
            .cloned()
            .filter(|value| !value.is_empty()),
        cwd: conversation.context.cwd.clone(),
        updated_at: conversation
            .context
            .raw
            .get("conversation.updatedAt")
            .cloned()
            .filter(|value| !value.is_empty()),
    })
}

/// Collect importable sessions from a client snapshot's conversations.
/// Dedupes by remote id, keeping the first occurrence.
pub fn importable_sessions_from_conversations(
    conversations: &[ConversationSnapshot],
) -> Vec<ImportableSession> {
    let mut seen = std::collections::HashSet::new();
    let mut sessions = Vec::new();
    for conversation in conversations {
        let Some(session) = importable_session_from_conversation(conversation) else {
            continue;
        };
        if !seen.insert(session.remote_id.clone()) {
            continue;
        }
        sessions.push(session);
    }
    sessions
}

pub fn list_importable_sessions_result(
    conversations: &[ConversationSnapshot],
    next_cursor: Option<String>,
    unsupported_reason: Option<String>,
) -> ListImportableSessionsResult {
    ListImportableSessionsResult {
        sessions: importable_sessions_from_conversations(conversations),
        next_cursor,
        unsupported_reason,
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::*;
    use crate::settings::{
        AvailableModeSettingSnapshot, AvailablePermissionModeSettingSnapshot,
        ModelListSettingSnapshot, ReasoningLevelSettingSnapshot, ThreadSettingsSnapshot,
    };
    use crate::snapshot::{
        AgentStateSnapshot, ContextSnapshot, ConversationSnapshot, HistorySnapshot, SkillsSnapshot,
    };

    fn conversation(
        remote_id: Option<&str>,
        remote_kind: &str,
        lifecycle: &str,
        title: Option<&str>,
        cwd: Option<&str>,
        updated_at: Option<&str>,
    ) -> ConversationSnapshot {
        let mut raw = BTreeMap::new();
        if let Some(title) = title {
            raw.insert("conversation.title".to_string(), title.to_string());
        }
        if let Some(updated_at) = updated_at {
            raw.insert("conversation.updatedAt".to_string(), updated_at.to_string());
        }
        ConversationSnapshot {
            id: "local-1".to_string(),
            remote_id: remote_id.map(str::to_string),
            remote_kind: remote_kind.to_string(),
            lifecycle: lifecycle.to_string(),
            active_turn_ids: Vec::new(),
            focused_turn_id: None,
            context: ContextSnapshot {
                cwd: cwd.map(str::to_string),
                raw,
                ..ContextSnapshot::default()
            },
            turns: Vec::new(),
            actions: Vec::new(),
            messages: Vec::new(),
            elicitations: Vec::new(),
            history: HistorySnapshot {
                hydrated: false,
                turn_count: 0,
                replay: Vec::new(),
            },
            agent_state: AgentStateSnapshot::default(),
            settings: ThreadSettingsSnapshot {
                reasoning_level: ReasoningLevelSettingSnapshot {
                    current_level: None,
                    available_levels: Vec::new(),
                    available_options: Vec::new(),
                    source: "none".to_string(),
                    config_option_id: None,
                    can_set: false,
                },
                model_list: ModelListSettingSnapshot {
                    current_model_id: None,
                    available_models: Vec::new(),
                    config_option_id: None,
                    can_set: false,
                },
                available_modes: AvailableModeSettingSnapshot {
                    current_mode_id: None,
                    available_modes: Vec::new(),
                    config_option_id: None,
                    can_set: false,
                },
                permission_modes: AvailablePermissionModeSettingSnapshot {
                    current_mode_id: None,
                    available_modes: Vec::new(),
                    config_option_id: None,
                    can_set: false,
                },
            },
            available_commands: Vec::new(),
            skills: SkillsSnapshot {
                can_list: false,
                can_mention: false,
                can_inject: false,
                can_inject_mcp: false,
                skills: Vec::new(),
            },
            usage: None,
        }
    }

    #[test]
    fn projects_discovered_session_with_metadata() {
        let snap = conversation(
            Some("thread_1"),
            "known",
            "discovered",
            Some("Fix tests"),
            Some("/tmp/project"),
            Some("1777770000"),
        );
        let session = importable_session_from_conversation(&snap).expect("session");
        assert_eq!(session.remote_id, "thread_1");
        assert_eq!(session.title.as_deref(), Some("Fix tests"));
        assert_eq!(session.cwd.as_deref(), Some("/tmp/project"));
        assert_eq!(session.updated_at.as_deref(), Some("1777770000"));
    }

    #[test]
    fn skips_missing_or_pending_remote_ids() {
        assert!(
            importable_session_from_conversation(&conversation(
                None,
                "known",
                "discovered",
                None,
                None,
                None
            ))
            .is_none()
        );
        assert!(
            importable_session_from_conversation(&conversation(
                Some("pending-1"),
                "pending",
                "discovered",
                None,
                None,
                None,
            ))
            .is_none()
        );
        assert!(
            importable_session_from_conversation(&conversation(
                Some(""),
                "known",
                "discovered",
                None,
                None,
                None,
            ))
            .is_none()
        );
    }

    #[test]
    fn collects_and_dedupes_by_remote_id() {
        let sessions = importable_sessions_from_conversations(&[
            conversation(Some("s1"), "known", "discovered", Some("A"), None, None),
            conversation(Some("s1"), "known", "discovered", Some("B"), None, None),
            conversation(Some("s2"), "known", "discovered", Some("C"), None, None),
        ]);
        assert_eq!(
            sessions
                .iter()
                .map(|s| s.remote_id.as_str())
                .collect::<Vec<_>>(),
            vec!["s1", "s2"]
        );
        assert_eq!(sessions[0].title.as_deref(), Some("A"));
    }
}
