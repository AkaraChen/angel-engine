#[cfg(feature = "cursor-history")]
use std::path::PathBuf;

#[cfg(feature = "cursor-history")]
use angel_engine::PendingRequest;
use angel_engine::event::EngineEvent;
use angel_engine::ids::ConversationId;
#[cfg(feature = "cursor-history")]
use angel_engine::state::{ContentDelta, HistoryReplayEntry, HistoryRole};
use angel_engine::state::{SessionPermissionMode, SessionPermissionModeState};
#[cfg(feature = "cursor-history")]
use angel_engine::transport::TransportLogKind;
use angel_engine::transport::{JsonRpcMessage, TransportOptions, TransportOutput};
use angel_engine::{
    AngelEngine, ConversationCapabilities, EngineError, ProtocolEffect, ProtocolFlavor,
    SessionModelState, UserInput,
};
#[cfg(feature = "cursor-history")]
use rusqlite::Connection;
use serde_json::Value;

use crate::acp::{AcpAdapter, AcpAdapterCapabilities};
use crate::{InterpretedUserInput, ProtocolAdapter};

#[derive(Clone, Debug)]
pub struct CursorAdapter {
    acp: AcpAdapter,
    startup_permission_mode: CursorPermissionMode,
}

impl CursorAdapter {
    pub fn with_args(capabilities: AcpAdapterCapabilities, args: &[String]) -> Self {
        Self {
            acp: AcpAdapter::new(capabilities),
            startup_permission_mode: cursor_startup_permission_mode(args),
        }
    }

    pub fn standard_with_args(args: &[String]) -> Self {
        Self::with_args(AcpAdapterCapabilities::standard(), args)
    }

    pub fn without_authentication_with_args(args: &[String]) -> Self {
        Self::with_args(
            AcpAdapterCapabilities::standard().without_authentication(),
            args,
        )
    }

    fn normalize_cursor_output(
        &self,
        _engine: &AngelEngine,
        _message: &JsonRpcMessage,
        mut output: TransportOutput,
    ) -> TransportOutput {
        let permission_mode_updates = output
            .events
            .iter()
            .filter_map(|event| {
                let EngineEvent::ConversationReady { id, .. } = event else {
                    return None;
                };
                Some(EngineEvent::SessionPermissionModesUpdated {
                    conversation_id: id.clone(),
                    modes: cursor_permission_mode_state(self.startup_permission_mode),
                })
            })
            .collect::<Vec<_>>();
        output.events.extend(permission_mode_updates);
        #[cfg(feature = "cursor-history")]
        self.append_cursor_local_hydration(_engine, _message, &mut output);
        output
    }

    #[cfg(feature = "cursor-history")]
    fn append_cursor_local_hydration(
        &self,
        engine: &AngelEngine,
        message: &JsonRpcMessage,
        output: &mut TransportOutput,
    ) {
        if output
            .events
            .iter()
            .any(|event| matches!(event, EngineEvent::HistoryReplayChunk { .. }))
        {
            return;
        }

        let Some((conversation_id, remote_id)) = cursor_hydrate_response(engine, message) else {
            return;
        };
        let Some(store_path) = cursor_session_store_path(remote_id) else {
            output.logs.push(angel_engine::TransportLog::new(
                TransportLogKind::State,
                format!("Cursor local history not found for session {remote_id}"),
            ));
            return;
        };

        let history = cursor_store_history_entries(&store_path).unwrap_or_else(|error| {
            output.logs.push(angel_engine::TransportLog::new(
                TransportLogKind::State,
                format!(
                    "Cursor local history read failed from {}: {error}",
                    store_path.display()
                ),
            ));
            Vec::new()
        });

        let mut event_count = 0usize;
        for entry in history {
            output.events.push(EngineEvent::HistoryReplayChunk {
                conversation_id: conversation_id.clone(),
                entry,
            });
            event_count += 1;
        }

        output.logs.push(angel_engine::TransportLog::new(
            TransportLogKind::State,
            format!(
                "Cursor local history replayed from {} entries={event_count}",
                store_path.display()
            ),
        ));
    }
}

impl ProtocolAdapter for CursorAdapter {
    fn protocol_flavor(&self) -> ProtocolFlavor {
        ProtocolFlavor::Acp
    }

    fn capabilities(&self) -> ConversationCapabilities {
        self.acp.capabilities()
    }

    fn encode_effect(
        &self,
        engine: &AngelEngine,
        effect: &ProtocolEffect,
        options: &TransportOptions,
    ) -> Result<TransportOutput, EngineError> {
        self.acp.encode_effect(engine, effect, options)
    }

    fn decode_message(
        &self,
        engine: &AngelEngine,
        message: &JsonRpcMessage,
    ) -> Result<TransportOutput, EngineError> {
        Ok(
            self.normalize_cursor_output(
                engine,
                message,
                self.acp.decode_message(engine, message)?,
            ),
        )
    }

    fn model_catalog_from_runtime_debug(
        &self,
        result: &Value,
        current_model_id: Option<&str>,
    ) -> Option<SessionModelState> {
        self.acp
            .model_catalog_from_runtime_debug(result, current_model_id)
    }

    fn interpret_user_input(
        &self,
        engine: &AngelEngine,
        conversation_id: &ConversationId,
        input: &[UserInput],
    ) -> Result<Option<InterpretedUserInput>, EngineError> {
        self.acp
            .interpret_user_input(engine, conversation_id, input)
    }
}

fn cursor_permission_mode_state(mode: CursorPermissionMode) -> SessionPermissionModeState {
    SessionPermissionModeState {
        current_mode_id: cursor_permission_mode_wire_id(mode),
        available_modes: vec![SessionPermissionMode {
            id: cursor_permission_mode_wire_id(mode),
            name: cursor_permission_mode_name(mode).to_string(),
            description: Some(
                "Cursor ACP does not expose runtime permission switching.".to_string(),
            ),
        }],
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
enum CursorPermissionMode {
    #[serde(rename = "default")]
    Default,
    #[serde(rename = "yolo")]
    Yolo,
}

fn cursor_startup_permission_mode(args: &[String]) -> CursorPermissionMode {
    if args
        .iter()
        .any(|arg| matches!(arg.as_str(), "--force" | "--yolo"))
    {
        CursorPermissionMode::Yolo
    } else {
        CursorPermissionMode::Default
    }
}

fn cursor_permission_mode_name(mode: CursorPermissionMode) -> &'static str {
    match mode {
        CursorPermissionMode::Default => "Default",
        CursorPermissionMode::Yolo => "YOLO",
    }
}

fn cursor_permission_mode_wire_id(mode: CursorPermissionMode) -> String {
    let value = serde_json::to_value(mode).expect("CursorPermissionMode serializes to a string");
    let Value::String(id) = value else {
        unreachable!("CursorPermissionMode serialized to non-string JSON");
    };
    id
}

#[cfg(feature = "cursor-history")]
fn cursor_hydrate_response<'a>(
    engine: &'a AngelEngine,
    message: &JsonRpcMessage,
) -> Option<(&'a ConversationId, &'a str)> {
    let JsonRpcMessage::Response { id, .. } = message else {
        return None;
    };
    let PendingRequest::ResumeConversation {
        conversation_id,
        hydrate: true,
    } = engine.pending.requests.get(id)?
    else {
        return None;
    };
    let conversation = engine.conversations.get(conversation_id)?;
    let remote_id = conversation.remote.as_protocol_id()?;
    Some((conversation_id, remote_id))
}

#[cfg(feature = "cursor-history")]
fn cursor_session_store_path(remote_id: &str) -> Option<PathBuf> {
    if !cursor_safe_path_component(remote_id) {
        return None;
    }
    let path = cursor_share_dir()?
        .join("acp-sessions")
        .join(remote_id)
        .join("store.db");
    path.is_file().then_some(path)
}

#[cfg(feature = "cursor-history")]
fn cursor_share_dir() -> Option<PathBuf> {
    if let Some(path) = std::env::var_os("CURSOR_SHARE_DIR")
        && !path.is_empty()
    {
        return Some(PathBuf::from(path));
    }
    Some(PathBuf::from(std::env::var_os("HOME")?).join(".cursor"))
}

#[cfg(feature = "cursor-history")]
fn cursor_safe_path_component(value: &str) -> bool {
    !value.is_empty()
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_'))
}

#[cfg(feature = "cursor-history")]
fn cursor_store_history_entries(path: &PathBuf) -> rusqlite::Result<Vec<HistoryReplayEntry>> {
    let connection = Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let mut statement = connection.prepare("select data from blobs order by rowid")?;
    let rows = statement.query_map([], |row| row.get::<_, Vec<u8>>(0))?;
    let mut entries = Vec::new();

    for row in rows {
        let data = row?;
        let Ok(value) = serde_json::from_slice::<Value>(&data) else {
            continue;
        };
        if let Some(entry) = cursor_store_record_entry(&value) {
            entries.push(entry);
        }
    }

    Ok(entries)
}

#[cfg(feature = "cursor-history")]
fn cursor_store_record_entry(value: &Value) -> Option<HistoryReplayEntry> {
    match value.get("role").and_then(Value::as_str) {
        Some("user") => cursor_store_user_entry(value),
        Some("assistant") => cursor_store_assistant_entry(value),
        _ => None,
    }
}

#[cfg(feature = "cursor-history")]
fn cursor_store_user_entry(value: &Value) -> Option<HistoryReplayEntry> {
    let text = cursor_user_message_text(value.get("content")?);
    if text.trim().is_empty() || cursor_internal_user_message(&text) {
        return None;
    }
    Some(HistoryReplayEntry {
        role: HistoryRole::User,
        content: ContentDelta::Text(text),
        tool: None,
    })
}

#[cfg(feature = "cursor-history")]
fn cursor_store_assistant_entry(value: &Value) -> Option<HistoryReplayEntry> {
    let text = cursor_content_value_text(value.get("content")?, false);
    if text.trim().is_empty() {
        return None;
    }
    Some(HistoryReplayEntry {
        role: HistoryRole::Assistant,
        content: ContentDelta::Text(text),
        tool: None,
    })
}

#[cfg(feature = "cursor-history")]
fn cursor_user_message_text(value: &Value) -> String {
    let text = cursor_content_value_text(value, true);
    cursor_user_query_text(&text).unwrap_or(text)
}

#[cfg(feature = "cursor-history")]
fn cursor_content_value_text(value: &Value, include_wrapped_text: bool) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Array(items) => items
            .iter()
            .filter_map(|item| {
                if !include_wrapped_text && item.get("type").and_then(Value::as_str) != Some("text")
                {
                    return None;
                }
                item.get("text")
                    .and_then(Value::as_str)
                    .map(ToString::to_string)
                    .or_else(|| {
                        item.get("content")
                            .map(|content| cursor_content_value_text(content, include_wrapped_text))
                    })
            })
            .filter(|text| !text.trim().is_empty())
            .collect::<Vec<_>>()
            .join("\n"),
        Value::Object(object) => object
            .get("text")
            .and_then(Value::as_str)
            .map(ToString::to_string)
            .unwrap_or_default(),
        _ => String::new(),
    }
}

#[cfg(feature = "cursor-history")]
fn cursor_user_query_text(text: &str) -> Option<String> {
    let start = text.find("<user_query>")? + "<user_query>".len();
    let end = text[start..].find("</user_query>")? + start;
    let query = text[start..end].trim();
    (!query.is_empty()).then(|| query.to_string())
}

#[cfg(feature = "cursor-history")]
fn cursor_internal_user_message(text: &str) -> bool {
    text.contains("<user_info>")
        || text.contains("<git_status>")
        || text.contains("<agent_transcripts>")
        || text.contains("<rules>")
}

#[cfg(test)]
mod tests {
    use super::*;
    use angel_engine::{
        ConversationLifecycle, ConversationState, PendingRequest, ProvisionOp,
        RemoteConversationId, apply_transport_output,
    };
    use serde_json::json;

    #[test]
    fn cursor_yolo_startup_flag_projects_single_permission_mode() {
        let adapter = CursorAdapter::standard_with_args(&["--yolo".to_string(), "acp".to_string()]);
        let mut engine = AngelEngine::with_available_runtime(
            ProtocolFlavor::Acp,
            angel_engine::RuntimeCapabilities::new("Cursor Agent"),
            adapter.capabilities(),
        );
        let conversation_id = ConversationId::new("conv");
        engine.conversations.insert(
            conversation_id.clone(),
            ConversationState::new(
                conversation_id.clone(),
                RemoteConversationId::Pending("new".to_string()),
                ConversationLifecycle::Provisioning {
                    op: ProvisionOp::New,
                },
                adapter.capabilities(),
            ),
        );
        engine.pending.requests.insert(
            angel_engine::JsonRpcRequestId::new("new"),
            PendingRequest::StartConversation {
                conversation_id: conversation_id.clone(),
            },
        );

        let output = adapter
            .decode_message(
                &engine,
                &JsonRpcMessage::response(
                    angel_engine::JsonRpcRequestId::new("new"),
                    json!({
                        "sessionId": "sess",
                        "modes": {
                            "currentModeId": "agent",
                            "availableModes": [{"id": "agent", "name": "Agent"}]
                        }
                    }),
                ),
            )
            .expect("decode session");
        apply_transport_output(&mut engine, &output).expect("apply output");

        let permission_modes = engine
            .permission_modes(conversation_id)
            .expect("permission modes");
        assert_eq!(permission_modes.current_mode_id.as_deref(), Some("yolo"));
        assert_eq!(
            permission_modes
                .available_modes
                .iter()
                .map(|mode| mode.id.as_str())
                .collect::<Vec<_>>(),
            vec!["yolo"]
        );
    }

    #[cfg(feature = "cursor-history")]
    #[test]
    fn cursor_store_records_replay_user_query_and_assistant_text() {
        let user = json!({
            "role": "user",
            "content": [{
                "type": "text",
                "text": "<user_query>\nSay exactly: cursor hydrate probe\n</user_query>",
            }],
        });
        let assistant_reasoning = json!({
            "role": "assistant",
            "content": [{
                "type": "reasoning",
                "text": "private reasoning",
            }],
        });
        let assistant = json!({
            "role": "assistant",
            "content": [
                {"type": "redacted-reasoning", "data": "opaque"},
                {"type": "text", "text": "cursor hydrate probe"},
            ],
        });

        assert_eq!(
            cursor_store_record_entry(&json!({
                "role": "user",
                "content": "<user_info>\nOS Version: darwin\n</user_info>",
            })),
            None
        );
        assert_eq!(
            cursor_store_record_entry(&user),
            Some(HistoryReplayEntry {
                role: HistoryRole::User,
                content: ContentDelta::Text("Say exactly: cursor hydrate probe".to_string()),
                tool: None,
            })
        );
        assert_eq!(cursor_store_record_entry(&assistant_reasoning), None);
        assert_eq!(
            cursor_store_record_entry(&assistant),
            Some(HistoryReplayEntry {
                role: HistoryRole::Assistant,
                content: ContentDelta::Text("cursor hydrate probe".to_string()),
                tool: None,
            })
        );
    }
}
