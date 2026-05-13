use std::fs;
use std::path::{Path, PathBuf};

use angel_engine::capabilities::ConversationCapabilities;
use angel_engine::event::EngineEvent;
use angel_engine::ids::ConversationId;
use angel_engine::protocol::ProtocolMethod;
use angel_engine::state::{
    ActionOutputDelta, ActionState, AvailableCommand, ContentDelta, ConversationState,
    HistoryReplayEntry, HistoryRole, SessionMode, SessionModeState,
};
use angel_engine::transport::{
    JsonRpcMessage, TransportLogKind, TransportOptions, TransportOutput,
};
use angel_engine::{
    AngelEngine, EngineError, PendingRequest, ProtocolEffect, ProtocolFlavor, SessionModelState,
    UserInput,
};
use serde_json::{Value, json};

use crate::acp::wire::AcpSessionUpdateKind;
use crate::acp::{AcpAdapter, AcpAdapterCapabilities, acp_tool_history_entry};
use crate::{InterpretedUserInput, ProtocolAdapter};

#[derive(Clone, Debug)]
pub struct KimiAdapter {
    acp: AcpAdapter,
}

impl KimiAdapter {
    pub fn new(capabilities: AcpAdapterCapabilities) -> Self {
        Self {
            acp: AcpAdapter::new(capabilities),
        }
    }

    pub fn standard() -> Self {
        Self::new(AcpAdapterCapabilities::standard())
    }

    pub fn without_authentication() -> Self {
        Self::new(AcpAdapterCapabilities::standard().without_authentication())
    }

    pub fn capabilities(&self) -> ConversationCapabilities {
        self.acp.capabilities()
    }

    fn encode_kimi_mode_effect(
        &self,
        engine: &AngelEngine,
        effect: &ProtocolEffect,
        _options: &TransportOptions,
    ) -> Result<Option<TransportOutput>, EngineError> {
        let Some(mode_id) = effect
            .payload
            .fields
            .get("modeId")
            .or_else(|| effect.payload.fields.get("mode"))
            .map(String::as_str)
        else {
            return Ok(None);
        };
        if !matches!(mode_id, "plan" | "default") || !conversation_has_plan_mode(engine, effect) {
            return Ok(None);
        }

        let mut output = TransportOutput::default()
            .event(EngineEvent::SessionModeChanged {
                conversation_id: effect.conversation_id.clone().ok_or_else(|| {
                    EngineError::InvalidCommand {
                        message: "missing conversation id for Kimi mode update".to_string(),
                    }
                })?,
                mode_id: mode_id.to_string(),
            })
            .log(
                TransportLogKind::State,
                format!("Kimi plan mode projected locally: {mode_id}"),
            )
            .log(
                TransportLogKind::Warning,
                "Kimi native /plan command is not sent because its ExitPlanMode approval flow is not exposed through ACP",
            );
        if let Some(request_id) = &effect.request_id {
            output.completed_requests.push(request_id.clone());
        }
        output.logs.push(angel_engine::TransportLog::new(
            TransportLogKind::State,
            "Use normal assistant text as plan content for Kimi plan-mode QA",
        ));
        Ok(Some(output))
    }

    fn normalize_kimi_output(
        &self,
        engine: &AngelEngine,
        message: &JsonRpcMessage,
        mut output: TransportOutput,
    ) -> TransportOutput {
        self.append_kimi_local_hydration(engine, message, &mut output);

        let mut plan_command_conversations = Vec::new();
        let mut filtered_plan_command = false;
        output.events = output
            .events
            .into_iter()
            .map(|event| match event {
                EngineEvent::AvailableCommandsUpdated {
                    conversation_id,
                    commands,
                } => {
                    let (commands, had_plan_command) = kimi_filter_plan_command(commands);
                    if had_plan_command {
                        plan_command_conversations.push(conversation_id.clone());
                        filtered_plan_command = true;
                    }
                    EngineEvent::AvailableCommandsUpdated {
                        conversation_id,
                        commands,
                    }
                }
                event => event,
            })
            .collect();

        let mode_updates = output
            .events
            .iter()
            .filter_map(|event| {
                let EngineEvent::AvailableCommandsUpdated {
                    conversation_id, ..
                } = event
                else {
                    return None;
                };
                if plan_command_conversations
                    .iter()
                    .any(|id| id == conversation_id)
                    && needs_kimi_plan_modes(engine, &output.events, conversation_id)
                {
                    Some(EngineEvent::SessionModesUpdated {
                        conversation_id: conversation_id.clone(),
                        modes: kimi_plan_mode_state(engine, conversation_id),
                    })
                } else {
                    None
                }
            })
            .collect::<Vec<_>>();

        if !mode_updates.is_empty() {
            output.events.extend(mode_updates);
            output.logs.push(angel_engine::TransportLog::new(
                TransportLogKind::State,
                "Kimi /plan command exposed as plan/default modes",
            ));
        }
        if filtered_plan_command {
            output.logs.push(angel_engine::TransportLog::new(
                TransportLogKind::Warning,
                "Kimi /plan command hidden because its ExitPlanMode approval flow is not exposed through ACP; use /mode plan instead",
            ));
        }
        let plan_file_updates = output
            .events
            .iter()
            .filter_map(|event| kimi_plan_file_event(engine, event))
            .flatten()
            .collect::<Vec<_>>();
        if !plan_file_updates.is_empty() {
            output.events.extend(plan_file_updates);
            output.logs.push(angel_engine::TransportLog::new(
                TransportLogKind::State,
                "Kimi plan file write projected as plan update",
            ));
        }
        output
    }

    fn append_kimi_local_hydration(
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

        let Some((conversation_id, remote_id)) = kimi_hydrate_response(engine, message) else {
            return;
        };
        let Some(context_path) = kimi_session_context_path(remote_id) else {
            output.logs.push(angel_engine::TransportLog::new(
                TransportLogKind::State,
                format!("Kimi local history not found for session {remote_id}"),
            ));
            return;
        };

        let history = fs::read_to_string(&context_path)
            .ok()
            .map(|content| kimi_context_history_entries(&content))
            .unwrap_or_default();
        let mut event_count = 0usize;
        for entry in history {
            output.events.push(EngineEvent::HistoryReplayChunk {
                conversation_id: conversation_id.clone(),
                entry,
            });
            event_count += 1;
        }

        if let Some(state) = kimi_session_state(&context_path) {
            if let Some(mode_event) = kimi_local_mode_event(&conversation_id, &state) {
                output.events.push(mode_event);
                event_count += 1;
            }
            if let Some(plan_entry) = kimi_local_plan_entry(&context_path, &state) {
                output.events.push(EngineEvent::HistoryReplayChunk {
                    conversation_id: conversation_id.clone(),
                    entry: plan_entry,
                });
                event_count += 1;
            }
        }

        output.logs.push(angel_engine::TransportLog::new(
            TransportLogKind::State,
            format!(
                "Kimi local history replayed from {} entries={event_count}",
                context_path.display()
            ),
        ));
    }
}

impl ProtocolAdapter for KimiAdapter {
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
        if matches!(
            effect.method,
            ProtocolMethod::SetSessionMode | ProtocolMethod::UpdateContext
        ) && let Some(output) = self.encode_kimi_mode_effect(engine, effect, options)?
        {
            return Ok(output);
        }

        self.acp.encode_effect(engine, effect, options)
    }

    fn decode_message(
        &self,
        engine: &AngelEngine,
        message: &JsonRpcMessage,
    ) -> Result<TransportOutput, EngineError> {
        let output = self.acp.decode_message(engine, message)?;
        Ok(self.normalize_kimi_output(engine, message, output))
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

fn conversation_has_plan_mode(engine: &AngelEngine, effect: &ProtocolEffect) -> bool {
    effect
        .conversation_id
        .as_ref()
        .and_then(|conversation_id| engine.conversations.get(conversation_id))
        .and_then(|conversation| conversation.mode_state.as_ref())
        .is_some_and(|modes| modes.available_modes.iter().any(|mode| mode.id == "plan"))
}

fn is_plan_command(command: &AvailableCommand) -> bool {
    command.name == "plan"
}

fn kimi_filter_plan_command(commands: Vec<AvailableCommand>) -> (Vec<AvailableCommand>, bool) {
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

fn needs_kimi_plan_modes(
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

fn is_mode_config_option(option: &angel_engine::SessionConfigOption) -> bool {
    option
        .category
        .as_deref()
        .is_some_and(|category| category == "mode")
        || option.id == "mode"
}

fn kimi_plan_mode_state(
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

fn kimi_plan_mode_state_for(current_mode_id: String) -> SessionModeState {
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

fn kimi_plan_file_event(engine: &AngelEngine, event: &EngineEvent) -> Option<Vec<EngineEvent>> {
    match event {
        EngineEvent::ActionObserved {
            conversation_id,
            action,
        } => kimi_plan_file_events_from_action(engine, conversation_id, action, None),
        EngineEvent::ActionUpdated {
            conversation_id,
            action_id,
            patch,
        } => {
            let action = engine
                .conversations
                .get(conversation_id)
                .and_then(|conversation| conversation.actions.get(action_id))?;
            kimi_plan_file_events_from_action(
                engine,
                conversation_id,
                action,
                patch.output_delta.as_ref(),
            )
        }
        _ => None,
    }
}

fn kimi_plan_file_events_from_action(
    engine: &AngelEngine,
    conversation_id: &ConversationId,
    action: &ActionState,
    output_delta: Option<&ActionOutputDelta>,
) -> Option<Vec<EngineEvent>> {
    if !action
        .title
        .as_deref()
        .is_some_and(kimi_write_plan_tool_title)
    {
        return None;
    }

    let args = action_output_text_with_delta(&action.output.chunks, output_delta);
    let args = serde_json::from_str::<Value>(&args).ok()?;
    let path = args.get("path").and_then(Value::as_str)?;
    if !is_kimi_plan_file_path(path) {
        return None;
    }

    let mut events = vec![EngineEvent::PlanPathUpdated {
        conversation_id: conversation_id.clone(),
        turn_id: action.turn_id.clone(),
        path: path.to_string(),
    }];

    if let Some(content) = args.get("content").and_then(Value::as_str)
        && let Some(delta) = kimi_plan_text_delta(engine, conversation_id, action, content)
    {
        events.push(EngineEvent::PlanDelta {
            conversation_id: conversation_id.clone(),
            turn_id: action.turn_id.clone(),
            delta: ContentDelta::Text(delta),
        });
    }

    Some(events)
}

fn kimi_write_plan_tool_title(title: &str) -> bool {
    title == "WriteFile" || title.starts_with("WriteFile:")
}

fn is_kimi_plan_file_path(path: &str) -> bool {
    path.ends_with(".md")
        && (path.contains("/.kimi/plans/")
            || path.starts_with("~/.kimi/plans/")
            || path.starts_with(".kimi/plans/"))
}

fn action_output_text_with_delta(
    chunks: &[ActionOutputDelta],
    output_delta: Option<&ActionOutputDelta>,
) -> String {
    chunks
        .iter()
        .chain(output_delta)
        .filter_map(action_output_text)
        .collect::<Vec<_>>()
        .join("")
}

fn action_output_text(delta: &ActionOutputDelta) -> Option<&str> {
    match delta {
        ActionOutputDelta::Text(text)
        | ActionOutputDelta::Terminal(text)
        | ActionOutputDelta::Structured(text) => Some(text),
        ActionOutputDelta::Patch(_) => None,
    }
}

fn kimi_plan_text_delta(
    engine: &AngelEngine,
    conversation_id: &ConversationId,
    action: &ActionState,
    content: &str,
) -> Option<String> {
    let previous = engine
        .conversations
        .get(conversation_id)
        .and_then(|conversation| conversation.turns.get(&action.turn_id))
        .map(|turn| content_delta_text(&turn.plan_text.chunks))
        .unwrap_or_default();
    content
        .strip_prefix(previous.as_str())
        .filter(|delta| !delta.is_empty())
        .map(ToString::to_string)
}

fn content_delta_text(chunks: &[ContentDelta]) -> String {
    chunks
        .iter()
        .filter_map(|chunk| match chunk {
            ContentDelta::Text(text) => Some(text.as_str()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("")
}

fn kimi_hydrate_response<'a>(
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

fn kimi_session_context_path(remote_id: &str) -> Option<PathBuf> {
    if !kimi_safe_path_component(remote_id) {
        return None;
    }
    let sessions_root = kimi_share_dir()?.join("sessions");
    for work_dir in fs::read_dir(sessions_root).ok()?.flatten() {
        let path = work_dir.path().join(remote_id).join("context.jsonl");
        if path.is_file() {
            return Some(path);
        }
    }
    None
}

fn kimi_safe_path_component(value: &str) -> bool {
    !value.is_empty()
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_'))
}

fn kimi_share_dir() -> Option<PathBuf> {
    if let Some(path) = std::env::var_os("KIMI_SHARE_DIR")
        && !path.is_empty()
    {
        return Some(PathBuf::from(path));
    }
    Some(PathBuf::from(std::env::var_os("HOME")?).join(".kimi"))
}

fn kimi_context_history_entries(content: &str) -> Vec<HistoryReplayEntry> {
    content
        .lines()
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
        .flat_map(|value| kimi_context_record_entries(&value))
        .collect()
}

fn kimi_context_record_entries(value: &Value) -> Vec<HistoryReplayEntry> {
    match value.get("role").and_then(Value::as_str) {
        Some("user") => kimi_context_user_entry(value).into_iter().collect(),
        Some("assistant") => kimi_context_assistant_entries(value),
        Some("tool") => kimi_context_tool_entry(value).into_iter().collect(),
        Some(role) if !role.starts_with('_') => {
            kimi_context_text_entry(HistoryRole::Unknown(role.to_string()), value.get("content"))
                .into_iter()
                .collect()
        }
        _ => Vec::new(),
    }
}

fn kimi_context_user_entry(value: &Value) -> Option<HistoryReplayEntry> {
    let text = kimi_content_value_text(value.get("content")?);
    if text.trim().is_empty() || kimi_internal_user_message(&text) {
        return None;
    }
    Some(HistoryReplayEntry {
        role: HistoryRole::User,
        content: ContentDelta::Text(text),
        tool: None,
    })
}

fn kimi_context_assistant_entries(value: &Value) -> Vec<HistoryReplayEntry> {
    let mut entries = Vec::new();
    if let Some(entry) = kimi_context_text_entry(HistoryRole::Assistant, value.get("content")) {
        entries.push(entry);
    }
    if let Some(tool_calls) = value.get("tool_calls").and_then(Value::as_array) {
        entries.extend(tool_calls.iter().filter_map(kimi_tool_call_history_entry));
    }
    entries
}

fn kimi_context_tool_entry(value: &Value) -> Option<HistoryReplayEntry> {
    let tool_call_id = value.get("tool_call_id").and_then(Value::as_str)?;
    if !kimi_safe_path_component(tool_call_id) {
        return None;
    }
    let output = value
        .get("content")
        .map(kimi_content_value_text)
        .unwrap_or_default();
    acp_tool_history_entry(&json!({
        "sessionUpdate": AcpSessionUpdateKind::ToolCallUpdate.wire_value(),
        "toolCallId": tool_call_id,
        "status": agent_client_protocol_schema::ToolCallStatus::Completed,
        "content": [
            {
                "type": "content",
                "content": {
                    "type": "text",
                    "text": output,
                }
            }
        ]
    }))
}

fn kimi_context_text_entry(
    role: HistoryRole,
    content: Option<&Value>,
) -> Option<HistoryReplayEntry> {
    let text = kimi_content_value_text(content?);
    if text.trim().is_empty() {
        return None;
    }
    Some(HistoryReplayEntry {
        role,
        content: ContentDelta::Text(text),
        tool: None,
    })
}

fn kimi_tool_call_history_entry(tool_call: &Value) -> Option<HistoryReplayEntry> {
    let id = tool_call.get("id").and_then(Value::as_str)?;
    if !kimi_safe_path_component(id) {
        return None;
    }
    let function = tool_call.get("function")?;
    let name = function
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or("tool");
    let arguments = function
        .get("arguments")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let raw_input = serde_json::from_str::<Value>(arguments)
        .unwrap_or_else(|_| Value::String(arguments.to_string()));

    let mut payload = serde_json::Map::new();
    payload.insert(
        "sessionUpdate".to_string(),
        AcpSessionUpdateKind::ToolCall.wire_value(),
    );
    payload.insert("toolCallId".to_string(), json!(id));
    payload.insert(
        "title".to_string(),
        json!(kimi_tool_title(name, &raw_input)),
    );
    payload.insert(
        "status".to_string(),
        json!(agent_client_protocol_schema::ToolCallStatus::Pending),
    );
    payload.insert("rawInput".to_string(), raw_input);
    if let Some(kind) = kimi_tool_kind(name) {
        payload.insert("kind".to_string(), json!(kind));
    }

    acp_tool_history_entry(&Value::Object(payload))
}

fn kimi_content_value_text(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Array(items) => items
            .iter()
            .map(kimi_content_value_text)
            .collect::<Vec<_>>()
            .join(""),
        Value::Object(_) => ["text", "content", "summary", "delta", "message"]
            .iter()
            .find_map(|key| value.get(*key))
            .map(kimi_content_value_text)
            .unwrap_or_default(),
        _ => String::new(),
    }
}

fn kimi_internal_user_message(text: &str) -> bool {
    let text = text.trim_start();
    text.starts_with("<system-reminder>") || text.starts_with("<system>")
}

fn kimi_tool_title(name: &str, raw_input: &Value) -> String {
    match name {
        "Shell" => raw_input
            .get("command")
            .and_then(Value::as_str)
            .map(|command| format!("Shell: {command}"))
            .unwrap_or_else(|| "Shell".to_string()),
        "ReadFile" | "WriteFile" | "StrReplaceFile" | "ReadMediaFile" => raw_input
            .get("path")
            .and_then(Value::as_str)
            .map(|path| format!("{name}: {path}"))
            .unwrap_or_else(|| name.to_string()),
        "Glob" | "Grep" => raw_input
            .get("pattern")
            .and_then(Value::as_str)
            .map(|pattern| format!("{name}: {pattern}"))
            .unwrap_or_else(|| name.to_string()),
        _ => name.to_string(),
    }
}

fn kimi_tool_kind(name: &str) -> Option<&'static str> {
    match name {
        "Shell" => Some("execute"),
        "ReadFile" | "ReadMediaFile" => Some("read"),
        "WriteFile" | "StrReplaceFile" => Some("edit"),
        "Glob" | "Grep" => Some("read"),
        "SearchWeb" => Some("search"),
        "FetchURL" | "Agent" => Some("fetch"),
        "EnterPlanMode" | "ExitPlanMode" | "AskUserQuestion" => Some("switch_mode"),
        _ => None,
    }
}

fn kimi_session_state(context_path: &Path) -> Option<Value> {
    let state_path = context_path.parent()?.join("state.json");
    let state = fs::read_to_string(state_path).ok()?;
    serde_json::from_str(&state).ok()
}

fn kimi_local_mode_event(conversation_id: &ConversationId, state: &Value) -> Option<EngineEvent> {
    let plan_mode = state.get("plan_mode")?.as_bool()?;
    Some(EngineEvent::SessionModesUpdated {
        conversation_id: conversation_id.clone(),
        modes: kimi_plan_mode_state_for(if plan_mode {
            "plan".to_string()
        } else {
            "default".to_string()
        }),
    })
}

fn kimi_local_plan_entry(context_path: &Path, state: &Value) -> Option<HistoryReplayEntry> {
    let slug = state.get("plan_slug").and_then(Value::as_str)?;
    if !kimi_safe_path_component(slug) {
        return None;
    }
    let share_dir = kimi_share_dir_from_context_path(context_path)?;
    let path = share_dir.join("plans").join(format!("{slug}.md"));
    let text = fs::read_to_string(&path).ok()?;
    if text.trim().is_empty() {
        return None;
    }
    Some(HistoryReplayEntry {
        role: HistoryRole::Assistant,
        content: ContentDelta::Structured(
            json!({
                "type": "plan",
                "path": path.to_string_lossy(),
                "markdown": text,
            })
            .to_string(),
        ),
        tool: None,
    })
}

fn kimi_share_dir_from_context_path(context_path: &Path) -> Option<PathBuf> {
    for ancestor in context_path.ancestors() {
        if ancestor.file_name().and_then(|name| name.to_str()) == Some("sessions") {
            return ancestor.parent().map(Path::to_path_buf);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use angel_engine::{
        AgentMode, ContextPatch, ContextScope, ContextUpdate, ConversationLifecycle,
        ConversationState, EngineCommand, RemoteConversationId, apply_transport_output,
    };
    use serde_json::json;

    fn ready_engine(adapter: &KimiAdapter) -> (AngelEngine, ConversationId) {
        let mut engine = AngelEngine::with_available_runtime(
            ProtocolFlavor::Acp,
            angel_engine::RuntimeCapabilities::new("Kimi Code CLI"),
            adapter.capabilities(),
        );
        let conversation_id = ConversationId::new("conv");
        engine.conversations.insert(
            conversation_id.clone(),
            ConversationState::new(
                conversation_id.clone(),
                RemoteConversationId::Known("sess".to_string()),
                ConversationLifecycle::Idle,
                adapter.capabilities(),
            ),
        );
        (engine, conversation_id)
    }

    fn apply(engine: &mut AngelEngine, output: &TransportOutput) {
        apply_transport_output(engine, output).expect("apply output");
    }

    fn start_turn(
        engine: &mut AngelEngine,
        conversation_id: &ConversationId,
    ) -> angel_engine::TurnId {
        let turn_id = angel_engine::TurnId::new("turn");
        engine
            .apply_event(EngineEvent::TurnStarted {
                conversation_id: conversation_id.clone(),
                turn_id: turn_id.clone(),
                remote: angel_engine::RemoteTurnId::Local("remote-turn".to_string()),
                input: Vec::new(),
            })
            .expect("turn started");
        turn_id
    }

    fn fixture_path(path: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/kimi")
            .join(path)
    }

    fn fixture_context_path() -> PathBuf {
        fixture_path("share/sessions/workspace/session-1/context.jsonl")
    }

    #[test]
    fn available_plan_command_exposes_kimi_plan_modes() {
        let adapter = KimiAdapter::standard();
        let (mut engine, conversation_id) = ready_engine(&adapter);

        engine
            .apply_event(EngineEvent::SessionModesUpdated {
                conversation_id: conversation_id.clone(),
                modes: SessionModeState {
                    current_mode_id: "default".to_string(),
                    available_modes: vec![SessionMode {
                        id: "default".to_string(),
                        name: "Default".to_string(),
                        description: None,
                    }],
                },
            })
            .expect("default mode");

        let output = adapter
            .decode_message(
                &engine,
                &JsonRpcMessage::notification(
                    "session/update",
                    json!({
                        "sessionId": "sess",
                        "update": {
                            "sessionUpdate": "available_commands_update",
                            "availableCommands": [
                                {
                                    "name": "plan",
                                    "description": "Toggle plan mode. Usage: /plan [on|off|view|clear]"
                                }
                            ]
                        }
                    }),
                ),
            )
            .expect("decode commands");

        assert!(output.events.iter().any(|event| {
            matches!(
                event,
                EngineEvent::SessionModesUpdated { modes, .. }
                    if modes.available_modes.iter().any(|mode| mode.id == "plan")
            )
        }));
        apply(&mut engine, &output);

        let modes = engine
            .available_modes(conversation_id)
            .expect("available modes");
        assert_eq!(
            modes
                .available_modes
                .iter()
                .map(|mode| mode.id.as_str())
                .collect::<Vec<_>>(),
            vec!["default", "plan"]
        );
    }

    #[test]
    fn set_plan_mode_projects_locally_without_kimi_plan_slash_command() {
        let adapter = KimiAdapter::standard();
        let (mut engine, conversation_id) = ready_engine(&adapter);
        engine
            .apply_event(EngineEvent::AvailableCommandsUpdated {
                conversation_id: conversation_id.clone(),
                commands: vec![AvailableCommand {
                    name: "plan".to_string(),
                    description: "Toggle plan mode".to_string(),
                    input: None,
                }],
            })
            .expect("commands");
        engine
            .apply_event(EngineEvent::SessionModesUpdated {
                conversation_id: conversation_id.clone(),
                modes: kimi_plan_mode_state(&engine, &conversation_id),
            })
            .expect("modes");

        let plan = engine
            .plan_command(EngineCommand::UpdateContext {
                conversation_id: conversation_id.clone(),
                patch: ContextPatch::one(ContextUpdate::Mode {
                    scope: ContextScope::TurnAndFuture,
                    mode: Some(AgentMode {
                        id: "plan".to_string(),
                    }),
                }),
            })
            .expect("plan mode");
        let output = adapter
            .encode_effect(&engine, &plan.effects[0], &TransportOptions::default())
            .expect("encode mode");

        assert!(output.messages.is_empty());
        assert!(
            output
                .completed_requests
                .contains(&plan.effects[0].request_id.clone().unwrap())
        );
        assert!(output.events.iter().any(|event| {
            matches!(
                event,
                EngineEvent::SessionModeChanged { mode_id, .. } if mode_id == "plan"
            )
        }));
    }

    #[test]
    fn neutral_update_context_plan_mode_projects_locally() {
        let adapter = KimiAdapter::standard();
        let (mut engine, conversation_id) = ready_engine(&adapter);
        engine
            .apply_event(EngineEvent::AvailableCommandsUpdated {
                conversation_id: conversation_id.clone(),
                commands: vec![AvailableCommand {
                    name: "plan".to_string(),
                    description: "Toggle plan mode".to_string(),
                    input: None,
                }],
            })
            .expect("commands");
        engine
            .apply_event(EngineEvent::SessionModesUpdated {
                conversation_id: conversation_id.clone(),
                modes: kimi_plan_mode_state(&engine, &conversation_id),
            })
            .expect("modes");
        let effect = ProtocolEffect::new(ProtocolFlavor::Acp, ProtocolMethod::UpdateContext)
            .request_id(angel_engine::JsonRpcRequestId::new("ctx"))
            .conversation_id(conversation_id)
            .field("contextUpdate", "mode")
            .field("mode", "plan");

        let output = adapter
            .encode_effect(&engine, &effect, &TransportOptions::default())
            .expect("encode mode");

        assert!(output.messages.is_empty());
        assert!(
            output
                .completed_requests
                .contains(&angel_engine::JsonRpcRequestId::new("ctx"))
        );
        assert!(output.events.iter().any(|event| {
            matches!(
                event,
                EngineEvent::SessionModeChanged { mode_id, .. } if mode_id == "plan"
            )
        }));
    }

    #[test]
    fn set_default_mode_projects_locally_without_kimi_plan_slash_command() {
        let adapter = KimiAdapter::standard();
        let (mut engine, conversation_id) = ready_engine(&adapter);
        engine
            .apply_event(EngineEvent::AvailableCommandsUpdated {
                conversation_id: conversation_id.clone(),
                commands: vec![AvailableCommand {
                    name: "plan".to_string(),
                    description: "Toggle plan mode".to_string(),
                    input: None,
                }],
            })
            .expect("commands");
        engine
            .apply_event(EngineEvent::SessionModesUpdated {
                conversation_id: conversation_id.clone(),
                modes: SessionModeState {
                    current_mode_id: "plan".to_string(),
                    available_modes: kimi_plan_mode_state(&engine, &conversation_id)
                        .available_modes,
                },
            })
            .expect("modes");
        engine
            .apply_event(EngineEvent::ContextUpdated {
                conversation_id: conversation_id.clone(),
                patch: ContextPatch::one(ContextUpdate::Mode {
                    scope: ContextScope::TurnAndFuture,
                    mode: Some(AgentMode {
                        id: "plan".to_string(),
                    }),
                }),
            })
            .expect("context mode");

        let plan = engine
            .plan_command(EngineCommand::UpdateContext {
                conversation_id,
                patch: ContextPatch::one(ContextUpdate::Mode {
                    scope: ContextScope::TurnAndFuture,
                    mode: Some(AgentMode {
                        id: "default".to_string(),
                    }),
                }),
            })
            .expect("default mode");
        let output = adapter
            .encode_effect(&engine, &plan.effects[0], &TransportOptions::default())
            .expect("encode mode");

        assert!(output.messages.is_empty());
        assert!(
            output
                .completed_requests
                .contains(&plan.effects[0].request_id.clone().unwrap())
        );
        assert!(output.events.iter().any(|event| {
            matches!(
                event,
                EngineEvent::SessionModeChanged { mode_id, .. } if mode_id == "default"
            )
        }));
    }

    #[test]
    fn write_plan_file_tool_call_projects_kimi_plan_update() {
        let adapter = KimiAdapter::standard();
        let (mut engine, conversation_id) = ready_engine(&adapter);
        let turn_id = start_turn(&mut engine, &conversation_id);
        let path = "~/.kimi/plans/fixture-plan.md";
        let content = "# Plan\n\n1. Read code\n2. Write patch\n";
        let args = serde_json::to_string(&json!({
            "path": path,
            "content": content
        }))
        .expect("args");

        let output = adapter
            .decode_message(
                &engine,
                &JsonRpcMessage::notification(
                    "session/update",
                    json!({
                        "sessionId": "sess",
                        "update": {
                            "sessionUpdate": "tool_call",
                            "toolCallId": "turn/tool-write-plan",
                            "title": format!("WriteFile: {path}"),
                            "status": "in_progress",
                            "content": [
                                {
                                    "type": "content",
                                    "content": {
                                        "type": "text",
                                        "text": args
                                    }
                                }
                            ]
                        }
                    }),
                ),
            )
            .expect("decode plan write");

        assert!(output.events.iter().any(|event| {
            matches!(
                event,
                EngineEvent::PlanPathUpdated { turn_id: id, path: stored_path, .. }
                    if id == &turn_id && stored_path == path
            )
        }));
        assert!(output.events.iter().any(|event| {
            matches!(
                event,
                EngineEvent::PlanDelta { turn_id: id, delta: ContentDelta::Text(text), .. }
                    if id == &turn_id && text == content
            )
        }));

        apply(&mut engine, &output);
        let turn = engine
            .conversations
            .get(&conversation_id)
            .and_then(|conversation| conversation.turns.get(&turn_id))
            .expect("turn");
        assert_eq!(turn.plan_path.as_deref(), Some(path));
        assert_eq!(
            turn.plan_text.chunks,
            vec![ContentDelta::Text(content.to_string())]
        );
    }

    #[test]
    fn non_plan_write_file_is_not_projected_as_kimi_plan() {
        let adapter = KimiAdapter::standard();
        let (mut engine, conversation_id) = ready_engine(&adapter);
        start_turn(&mut engine, &conversation_id);
        let path = "/workspace/luna/README.md";
        let args = serde_json::to_string(&json!({
            "path": path,
            "content": "# Not a Kimi plan\n"
        }))
        .expect("args");

        let output = adapter
            .decode_message(
                &engine,
                &JsonRpcMessage::notification(
                    "session/update",
                    json!({
                        "sessionId": "sess",
                        "update": {
                            "sessionUpdate": "tool_call",
                            "toolCallId": "turn/tool-write-readme",
                            "title": format!("WriteFile: {path}"),
                            "status": "in_progress",
                            "content": [
                                {
                                    "type": "content",
                                    "content": {
                                        "type": "text",
                                        "text": args
                                    }
                                }
                            ]
                        }
                    }),
                ),
            )
            .expect("decode write");

        assert!(!output.events.iter().any(|event| {
            matches!(
                event,
                EngineEvent::PlanDelta { .. } | EngineEvent::PlanPathUpdated { .. }
            )
        }));
    }

    #[test]
    fn kimi_context_history_replays_user_text_tools_and_filters_internal_reminders() {
        let context = fs::read_to_string(fixture_context_path()).expect("fixture context");

        let entries = kimi_context_history_entries(&context);

        assert_eq!(entries.len(), 4);
        assert_eq!(
            entries[0],
            HistoryReplayEntry {
                role: HistoryRole::User,
                content: ContentDelta::Text("hello".to_string()),
                tool: None,
            }
        );
        assert_eq!(
            entries[1],
            HistoryReplayEntry {
                role: HistoryRole::Assistant,
                content: ContentDelta::Text("thinking\n".to_string()),
                tool: None,
            }
        );

        let ContentDelta::Structured(tool_call) = &entries[2].content else {
            panic!("expected tool call");
        };
        let tool_call = serde_json::from_str::<Value>(tool_call).expect("tool call json");
        assert_eq!(tool_call["sessionUpdate"], json!("tool_call"));
        assert_eq!(tool_call["toolCallId"], json!("tool_1"));
        assert_eq!(tool_call["kind"], json!("execute"));
        assert_eq!(tool_call["title"], json!("Shell: ls"));
        assert_eq!(tool_call["rawInput"]["command"], json!("ls"));

        let ContentDelta::Structured(tool_update) = &entries[3].content else {
            panic!("expected tool update");
        };
        let tool_update = serde_json::from_str::<Value>(tool_update).expect("tool update json");
        assert_eq!(tool_update["sessionUpdate"], json!("tool_call_update"));
        assert_eq!(tool_update["toolCallId"], json!("tool_1"));
        assert_eq!(tool_update["status"], json!("completed"));
        assert_eq!(tool_update["content"][0]["content"]["text"], json!("ok\n"));
    }

    #[test]
    fn kimi_local_state_projects_plan_mode_and_plan_card() {
        let context_path = fixture_context_path();
        let plan_path = fixture_path("share/plans/fixture-plan.md");

        let state = kimi_session_state(&context_path).expect("state");
        let event = kimi_local_mode_event(&ConversationId::new("conv"), &state).expect("mode");
        assert!(matches!(
            event,
            EngineEvent::SessionModesUpdated { modes, .. }
                if modes.current_mode_id == "plan"
                    && modes.available_modes.iter().any(|mode| mode.id == "plan")
        ));

        let plan_entry = kimi_local_plan_entry(&context_path, &state).expect("plan entry");
        assert_eq!(plan_entry.role, HistoryRole::Assistant);
        let ContentDelta::Structured(plan) = plan_entry.content else {
            panic!("expected structured plan");
        };
        let plan = serde_json::from_str::<Value>(&plan).expect("plan json");
        assert_eq!(plan["type"], json!("plan"));
        assert_eq!(plan["markdown"], json!("# Plan\n\nDo it.\n"));
        assert_eq!(plan["path"], json!(plan_path.to_string_lossy()));
    }
}
