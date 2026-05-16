use super::actions::{
    action_from_item, completed_phase_from_item, dynamic_tool_has_input_payload,
    dynamic_tool_is_host_capability, dynamic_tool_is_output_only,
};
use super::commands::codex_slash_commands;
use super::protocol_helpers::*;
use super::requests::host_capability_options;
use super::summaries::{plan_item_content, plan_item_saved_path};
use super::*;
use std::{env, fs, path::PathBuf};

impl CodexAdapter {
    pub(super) fn decode_response(
        &self,
        engine: &AngelEngine,
        id: &JsonRpcRequestId,
        result: &Value,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
        let Some(pending) = engine.pending.requests.get(id) else {
            return Ok(TransportOutput::default().log(
                TransportLogKind::Receive,
                format!("response {id} with no pending request"),
            ));
        };

        let mut output = TransportOutput::default().completed(id.clone());
        match pending {
            PendingRequest::Initialize => {
                output = output
                    .event(EngineEvent::RuntimeNegotiated {
                        capabilities: angel_engine::RuntimeCapabilities {
                            name: "codex-app-server".to_string(),
                            version: result
                                .get("userAgent")
                                .and_then(Value::as_str)
                                .map(str::to_string),
                            discovery: angel_engine::CapabilitySupport::Supported,
                            authentication: angel_engine::CapabilitySupport::Unknown,
                            metadata: Default::default(),
                        },
                        conversation_capabilities: Some(self.capabilities()),
                    })
                    .message(JsonRpcMessage::notification("initialized", Value::Null))
                    .log(TransportLogKind::State, "Codex runtime initialized");
            }
            PendingRequest::StartConversation { conversation_id }
            | PendingRequest::ForkConversation { conversation_id } => {
                let thread_id = result
                    .get("thread")
                    .and_then(|thread| thread.get("id"))
                    .and_then(Value::as_str)
                    .ok_or_else(|| angel_engine::EngineError::InvalidCommand {
                        message: "Codex conversation response missing thread.id".to_string(),
                    })?;
                output = output
                    .event(EngineEvent::ConversationReady {
                        id: conversation_id.clone(),
                        remote: Some(RemoteConversationId::Known(thread_id.to_string())),
                        context: codex_context_patch(result),
                        capabilities: Some(engine.default_capabilities.clone()),
                    })
                    .event(EngineEvent::AvailableCommandsUpdated {
                        conversation_id: conversation_id.clone(),
                        commands: codex_slash_commands(),
                    })
                    .log(TransportLogKind::State, format!("thread {thread_id} ready"));
                append_codex_default_settings(&mut output, engine, conversation_id);
            }
            PendingRequest::ReadConversation { conversation_id } => {
                let thread_id = result
                    .get("thread")
                    .and_then(|thread| thread.get("id"))
                    .and_then(Value::as_str)
                    .ok_or_else(|| angel_engine::EngineError::InvalidCommand {
                        message: "Codex thread/read response missing thread.id".to_string(),
                    })?;
                output = output.event(EngineEvent::ConversationReady {
                    id: conversation_id.clone(),
                    remote: Some(RemoteConversationId::Known(thread_id.to_string())),
                    context: codex_context_patch(result),
                    capabilities: None,
                });
                if !append_local_rollout_history(&mut output, conversation_id, thread_id) {
                    append_hydrated_turns(&mut output, conversation_id, result);
                }
            }
            PendingRequest::ResumeConversation {
                conversation_id,
                hydrate,
            } => {
                let thread_id = result
                    .get("thread")
                    .and_then(|thread| thread.get("id"))
                    .and_then(Value::as_str)
                    .ok_or_else(|| angel_engine::EngineError::InvalidCommand {
                        message: "Codex conversation response missing thread.id".to_string(),
                    })?;
                output = output
                    .event(EngineEvent::ConversationReady {
                        id: conversation_id.clone(),
                        remote: Some(RemoteConversationId::Known(thread_id.to_string())),
                        context: codex_context_patch(result),
                        capabilities: Some(engine.default_capabilities.clone()),
                    })
                    .event(EngineEvent::AvailableCommandsUpdated {
                        conversation_id: conversation_id.clone(),
                        commands: codex_slash_commands(),
                    })
                    .log(TransportLogKind::State, format!("thread {thread_id} ready"));
                append_codex_default_settings(&mut output, engine, conversation_id);
                if *hydrate {
                    append_hydrated_turns(&mut output, conversation_id, result);
                }
            }
            PendingRequest::StartTurn {
                conversation_id,
                turn_id,
            } => {
                if let Some(remote_turn_id) = result
                    .get("turn")
                    .and_then(|turn| turn.get("id"))
                    .and_then(Value::as_str)
                {
                    output = output
                        .event(EngineEvent::TurnStarted {
                            conversation_id: conversation_id.clone(),
                            turn_id: turn_id.clone(),
                            remote: RemoteTurnId::Known(remote_turn_id.to_string()),
                            input: Vec::new(),
                        })
                        .log(
                            TransportLogKind::State,
                            format!("turn {remote_turn_id} accepted"),
                        );
                }
            }
            PendingRequest::SteerTurn {
                conversation_id,
                turn_id,
            } => {
                output = output
                    .event(EngineEvent::TurnSteered {
                        conversation_id: conversation_id.clone(),
                        turn_id: turn_id.clone(),
                        input: Vec::new(),
                    })
                    .log(TransportLogKind::State, "steer accepted");
            }
            PendingRequest::CancelTurn { .. } => {
                output = output.log(TransportLogKind::State, "interrupt accepted");
            }
            PendingRequest::HistoryMutation { conversation_id } => {
                output = output
                    .event(EngineEvent::HistoryMutationFinished {
                        conversation_id: conversation_id.clone(),
                        result: angel_engine::HistoryMutationResult {
                            success: true,
                            workspace_reverted: false,
                            message: None,
                        },
                    })
                    .log(TransportLogKind::State, "history mutation accepted");
            }
            PendingRequest::RunShellCommand { .. } => {
                output = output.log(TransportLogKind::State, "shell command accepted");
            }
            PendingRequest::DiscoverConversations { params } => {
                for thread in result
                    .get("data")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                {
                    let Some(thread_id) = thread.get("id").and_then(Value::as_str) else {
                        output = output.log(
                            TransportLogKind::Warning,
                            "ignoring Codex thread/list entry without id",
                        );
                        continue;
                    };
                    let remote = RemoteConversationId::Known(thread_id.to_string());
                    output = output.event(EngineEvent::ConversationDiscovered {
                        id: discovered_conversation_id(
                            engine,
                            &remote,
                            format!("codex-thread-{thread_id}"),
                        ),
                        remote,
                        context: codex_thread_info_context(thread),
                        capabilities: engine.default_capabilities.clone(),
                    });
                }
                output = output.event(EngineEvent::ConversationDiscoveryPage {
                    cursor: params.cursor.clone(),
                    next_cursor: result
                        .get("nextCursor")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                });
                output = output.log(TransportLogKind::Receive, format!("response {id}"));
            }
            PendingRequest::Authenticate
            | PendingRequest::ResolveElicitation { .. }
            | PendingRequest::UpdateContext { .. } => {
                output = output.log(TransportLogKind::Receive, format!("response {id}"));
            }
        }
        Ok(output)
    }

    pub(super) fn decode_error(
        &self,
        engine: &AngelEngine,
        id: Option<&JsonRpcRequestId>,
        code: i64,
        message: &str,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
        let mut output = TransportOutput::default().log(
            TransportLogKind::Error,
            format!("Codex error {code}: {message}"),
        );
        if let Some(id) = id {
            output.completed_requests.push(id.clone());
            if let Some(event) = engine
                .pending
                .requests
                .get(id)
                .and_then(|pending| codex_rpc_error_event(pending, code, message))
            {
                output.events.push(event);
            }
        }
        Ok(output)
    }
}

fn append_codex_default_settings(
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
        values: ["none", "minimal", "low", "medium", "high", "xhigh"]
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

fn codex_rpc_error_event(
    pending: &PendingRequest,
    code: i64,
    message: &str,
) -> Option<EngineEvent> {
    match pending {
        PendingRequest::StartTurn {
            conversation_id,
            turn_id,
        } => Some(EngineEvent::TurnTerminal {
            conversation_id: conversation_id.clone(),
            turn_id: turn_id.clone(),
            outcome: TurnOutcome::Failed(ErrorInfo::new(
                format!("codex.rpc.{code}"),
                message.to_string(),
            )),
        }),
        PendingRequest::HistoryMutation { conversation_id } => {
            Some(history_mutation_failed_event(conversation_id, message))
        }
        _ => None,
    }
}

fn history_mutation_failed_event(conversation_id: &ConversationId, message: &str) -> EngineEvent {
    EngineEvent::HistoryMutationFinished {
        conversation_id: conversation_id.clone(),
        result: angel_engine::HistoryMutationResult {
            success: false,
            workspace_reverted: false,
            message: Some(message.to_string()),
        },
    }
}

fn append_local_rollout_history(
    output: &mut TransportOutput,
    conversation_id: &ConversationId,
    thread_id: &str,
) -> bool {
    let Some(path) = find_local_rollout_path(thread_id) else {
        return false;
    };
    let Ok(content) = fs::read_to_string(path) else {
        return false;
    };

    let mut appended = 0usize;
    let mut has_structured_history = false;
    for line in content.lines() {
        let Ok(record) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let Some((role, content, tool)) = codex_rollout_history_entry(&record) else {
            continue;
        };
        if content_delta_is_empty(&content) {
            continue;
        }
        has_structured_history |= matches!(role, HistoryRole::Reasoning | HistoryRole::Tool);
        output.events.push(EngineEvent::HistoryReplayChunk {
            conversation_id: conversation_id.clone(),
            entry: HistoryReplayEntry {
                role,
                content,
                tool,
            },
        });
        appended += 1;
    }

    appended > 0 && has_structured_history
}

fn find_local_rollout_path(thread_id: &str) -> Option<PathBuf> {
    let codex_home = env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .or_else(|| env::var_os("HOME").map(|home| PathBuf::from(home).join(".codex")))?;
    let sessions_dir = codex_home.join("sessions");
    find_rollout_path_in_dir(&sessions_dir, thread_id)
}

fn find_rollout_path_in_dir(dir: &PathBuf, thread_id: &str) -> Option<PathBuf> {
    let entries = fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = find_rollout_path_in_dir(&path, thread_id) {
                return Some(found);
            }
            continue;
        }
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if name.contains(thread_id) && name.ends_with(".jsonl") {
            return Some(path);
        }
    }
    None
}

fn codex_rollout_history_entry(
    record: &Value,
) -> Option<(HistoryRole, ContentDelta, Option<HistoryReplayToolAction>)> {
    match record.get("type").and_then(Value::as_str)? {
        "event_msg" => {
            let payload = record.get("payload")?;
            if payload.get("type").and_then(Value::as_str) != Some("user_message") {
                return None;
            }
            let message = payload.get("message").and_then(Value::as_str)?;
            Some((
                HistoryRole::User,
                ContentDelta::Text(message.to_string()),
                None,
            ))
        }
        "response_item" => {
            let payload = record.get("payload")?;
            match payload.get("type").and_then(Value::as_str) {
                Some("message")
                    if payload.get("role").and_then(Value::as_str) == Some("assistant") =>
                {
                    Some((HistoryRole::Assistant, codex_content_delta(payload), None))
                }
                Some("agentMessage") => Some((
                    HistoryRole::Assistant,
                    ContentDelta::Text(
                        payload
                            .get("text")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_string(),
                    ),
                    None,
                )),
                Some("reasoning") => Some((
                    HistoryRole::Reasoning,
                    ContentDelta::Text(codex_reasoning_text(payload)),
                    None,
                )),
                Some(item_type) if codex_history_replay_tool_item_type(item_type) => {
                    let tool_item = codex_history_replay_tool_item(payload);
                    let tool = codex_history_replay_tool_action(&tool_item);
                    Some((
                        HistoryRole::Tool,
                        ContentDelta::Structured(tool_item.to_string()),
                        tool,
                    ))
                }
                _ => None,
            }
        }
        _ => None,
    }
}

fn append_hydrated_turns(
    output: &mut TransportOutput,
    conversation_id: &ConversationId,
    result: &Value,
) {
    let Some(turns) = result
        .get("thread")
        .and_then(|thread| thread.get("turns"))
        .and_then(Value::as_array)
    else {
        return;
    };

    for turn in turns {
        for item in turn
            .get("items")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            let replay_item = codex_history_replay_item(item);
            let (role, content, tool) = match replay_item.get("type").and_then(Value::as_str) {
                Some("userMessage") => (HistoryRole::User, codex_content_delta(replay_item), None),
                Some("message")
                    if replay_item.get("role").and_then(Value::as_str) == Some("user") =>
                {
                    (HistoryRole::User, codex_content_delta(replay_item), None)
                }
                Some("message")
                    if replay_item.get("role").and_then(Value::as_str) == Some("assistant") =>
                {
                    (
                        HistoryRole::Assistant,
                        codex_content_delta(replay_item),
                        None,
                    )
                }
                Some("message") => (
                    HistoryRole::Assistant,
                    codex_content_delta(replay_item),
                    None,
                ),
                Some("agentMessage") => (
                    HistoryRole::Assistant,
                    ContentDelta::Text(
                        replay_item
                            .get("text")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_string(),
                    ),
                    None,
                ),
                Some("reasoning") => (
                    HistoryRole::Reasoning,
                    ContentDelta::Text(codex_reasoning_text(replay_item)),
                    None,
                ),
                Some("plan") => {
                    let Some(plan_item) = codex_history_replay_plan_item(replay_item) else {
                        continue;
                    };
                    (
                        HistoryRole::Assistant,
                        ContentDelta::Structured(plan_item.to_string()),
                        None,
                    )
                }
                Some(item_type) if codex_history_replay_tool_item_type(item_type) => {
                    let tool_item = codex_history_replay_tool_item(replay_item);
                    let tool = codex_history_replay_tool_action(&tool_item);
                    (
                        HistoryRole::Tool,
                        ContentDelta::Structured(tool_item.to_string()),
                        tool,
                    )
                }
                _ => continue,
            };
            if content_delta_is_empty(&content) {
                continue;
            }
            output.events.push(EngineEvent::HistoryReplayChunk {
                conversation_id: conversation_id.clone(),
                entry: HistoryReplayEntry {
                    role,
                    content,
                    tool,
                },
            });
        }
    }
}

fn codex_history_replay_item(item: &Value) -> &Value {
    if item.get("type").and_then(Value::as_str) == Some("response_item") {
        if let Some(payload) = item.get("payload").filter(|payload| payload.is_object()) {
            return payload;
        }
    }
    item
}

fn codex_history_replay_tool_item(item: &Value) -> Value {
    let mut replay_item = item.clone();
    let Value::Object(fields) = &mut replay_item else {
        return replay_item;
    };
    let item_type = fields
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    if codex_history_replay_tool_uses_call_id(&item_type) {
        if let Some(call_id) = string_field(fields, &["callId", "call_id"]) {
            if let Some(original_id) = fields
                .get("id")
                .and_then(Value::as_str)
                .filter(|id| *id != call_id)
                .map(str::to_string)
            {
                fields
                    .entry("itemId".to_string())
                    .or_insert_with(|| Value::String(original_id));
            }
            fields.insert("id".to_string(), Value::String(call_id));
        }
    }

    fields
        .entry("status".to_string())
        .or_insert_with(|| Value::String("completed".to_string()));
    normalize_host_capability_history_tool_item(&mut replay_item);
    replay_item
}

fn codex_history_replay_tool_action(item: &Value) -> Option<HistoryReplayToolAction> {
    let item_type = item.get("type").and_then(Value::as_str)?;
    let fallback_turn_id = TurnId::new("history".to_string());
    let action = action_from_item(item, &fallback_turn_id);
    let kind = action
        .as_ref()
        .map(|action| action.kind.clone())
        .or_else(|| codex_history_tool_kind(item));
    let phase = action
        .as_ref()
        .and_then(|action| completed_phase_from_item(item, &action.kind))
        .or_else(|| {
            item.get("status")
                .and_then(Value::as_str)
                .and_then(codex_history_status_to_phase)
        })
        .unwrap_or_else(|| match item_type {
            "function_call_output" | "custom_tool_call_output" | "tool_search_output" => {
                ActionPhase::Completed
            }
            _ => ActionPhase::Completed,
        });
    let title = action
        .as_ref()
        .and_then(|action| action.title.clone())
        .or_else(|| codex_history_tool_title(item));
    let output = codex_history_tool_output(item);
    let id = first_item_string(item, &["id", "callId", "call_id", "itemId"])
        .unwrap_or_else(|| codex_history_missing_tool_id(item_type, item));
    Some(HistoryReplayToolAction {
        id: Some(id),
        kind,
        phase,
        title: title.clone(),
        input_summary: first_item_string(item, &["inputSummary", "input_summary"]).or(title),
        raw_input: codex_history_tool_raw_input(item),
        output,
        error: None,
    })
}

fn codex_history_missing_tool_id(item_type: &str, item: &Value) -> String {
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in item.to_string().as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("codex-history-{item_type}-{hash:016x}")
}

fn codex_history_tool_kind(item: &Value) -> Option<ActionKind> {
    let kind = match item.get("type").and_then(Value::as_str)? {
        "commandExecution" | "local_shell_call" => ActionKind::Command,
        "fileChange" => ActionKind::FileChange,
        "mcpToolCall" | "mcp_call" => ActionKind::McpTool,
        "dynamicToolCall" if dynamic_tool_is_host_capability(item) => ActionKind::HostCapability,
        "dynamicToolCall" | "tool_search_call" => ActionKind::DynamicTool,
        "webSearch" | "web_search_call" => ActionKind::WebSearch,
        "imageView" | "imageGeneration" => ActionKind::Media,
        "contextCompaction" => ActionKind::Reasoning,
        "function_call" => {
            if is_codex_command_tool_name(first_item_string(item, &["name"]).as_deref()) {
                ActionKind::Command
            } else {
                ActionKind::DynamicTool
            }
        }
        "custom_tool_call" => {
            if first_item_string(item, &["name"]).as_deref() == Some("apply_patch") {
                ActionKind::FileChange
            } else {
                ActionKind::DynamicTool
            }
        }
        "computer_call" => ActionKind::HostCapability,
        _ => return None,
    };
    Some(kind)
}

fn codex_history_status_to_phase(status: &str) -> Option<ActionPhase> {
    match status {
        "completed" => Some(ActionPhase::Completed),
        "failed" => Some(ActionPhase::Failed),
        "declined" => Some(ActionPhase::Declined),
        "cancelled" | "canceled" | "interrupted" => Some(ActionPhase::Cancelled),
        "pending" | "proposed" => Some(ActionPhase::Proposed),
        "inProgress" => Some(ActionPhase::Running),
        "streamingResult" => Some(ActionPhase::StreamingResult),
        _ => None,
    }
}

fn codex_history_tool_title(item: &Value) -> Option<String> {
    match item.get("type").and_then(Value::as_str)? {
        "commandExecution" | "local_shell_call" => first_item_string(item, &["command"]),
        "mcpToolCall" => Some(format!(
            "{}.{}",
            item.get("server").and_then(Value::as_str).unwrap_or("mcp"),
            item.get("tool").and_then(Value::as_str).unwrap_or("tool")
        )),
        "mcp_call" => first_item_string(item, &["name"]),
        "dynamicToolCall" if dynamic_tool_is_output_only(item) => {
            first_item_string(item, &["title"])
        }
        "dynamicToolCall" => first_item_string(item, &["title"]).or_else(|| {
            let tool = item.get("tool").and_then(Value::as_str).unwrap_or("tool");
            Some(
                item.get("namespace")
                    .and_then(Value::as_str)
                    .map(|namespace| format!("{namespace}.{tool}"))
                    .unwrap_or_else(|| tool.to_string()),
            )
        }),
        "webSearch" => first_item_string(item, &["query"]),
        "web_search_call" => item
            .get("action")
            .and_then(|action| first_item_string(action, &["query"])),
        "function_call" | "custom_tool_call" => first_item_string(item, &["name"]),
        "tool_search_call" => Some("tool_search".to_string()),
        "computer_call" => Some("computer".to_string()),
        "function_call_output" | "custom_tool_call_output" | "tool_search_output" => None,
        _ => first_item_string(item, &["title", "name", "type"]),
    }
}

fn codex_history_tool_raw_input(item: &Value) -> Option<String> {
    if let Some(raw_input) = item.get("rawInput").or_else(|| item.get("raw_input")) {
        return Some(
            raw_input
                .as_str()
                .map_or_else(|| raw_input.to_string(), str::to_string),
        );
    }
    match item.get("type").and_then(Value::as_str) {
        Some("function_call") => first_item_string(item, &["arguments"])
            .or_else(|| item.get("arguments").map(Value::to_string)),
        Some("custom_tool_call") => {
            first_item_string(item, &["input"]).or_else(|| item.get("input").map(Value::to_string))
        }
        Some("dynamicToolCall") if dynamic_tool_is_output_only(item) => None,
        Some("function_call_output" | "custom_tool_call_output" | "tool_search_output") => None,
        _ => Some(item.to_string()),
    }
}

fn codex_history_tool_output(item: &Value) -> Vec<ActionOutputDelta> {
    [
        "output",
        "result",
        "content",
        "contentItems",
        "content_items",
        "aggregatedOutput",
        "stdout",
        "stderr",
    ]
    .iter()
    .find_map(|key| item.get(*key))
    .map(codex_history_output_value)
    .unwrap_or_default()
}

fn codex_history_output_value(value: &Value) -> Vec<ActionOutputDelta> {
    match value {
        Value::Null => Vec::new(),
        Value::Array(items) => items.iter().flat_map(codex_history_output_value).collect(),
        Value::String(text) => vec![ActionOutputDelta::Text(codex_history_output_text(text))],
        Value::Bool(value) => vec![ActionOutputDelta::Text(value.to_string())],
        Value::Number(value) => vec![ActionOutputDelta::Text(value.to_string())],
        Value::Object(_) => {
            if matches!(
                value.get("type").and_then(Value::as_str),
                Some("inputText" | "outputText" | "text")
            ) {
                if let Some(text) = value.get("text").and_then(Value::as_str) {
                    return vec![ActionOutputDelta::Text(text.to_string())];
                }
            }
            vec![ActionOutputDelta::Structured(value.to_string())]
        }
    }
}

fn codex_history_output_text(text: &str) -> String {
    serde_json::from_str::<Value>(text)
        .ok()
        .and_then(|value| {
            value
                .get("output")
                .or_else(|| value.get("text"))
                .or_else(|| value.get("content"))
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_else(|| text.to_string())
}

fn is_codex_command_tool_name(name: Option<&str>) -> bool {
    matches!(name, Some("shell" | "exec_command" | "write_stdin"))
}

fn codex_history_replay_plan_item(item: &Value) -> Option<Value> {
    let entries = codex_history_replay_plan_entries(item);
    let text = plan_item_content(item).unwrap_or_default();
    let path = plan_item_saved_path(item);
    if entries.is_empty() && text.trim().is_empty() && path.is_none() {
        return None;
    }

    let mut plan = serde_json::Map::new();
    plan.insert("type".to_string(), Value::String("plan".to_string()));
    plan.insert("entries".to_string(), Value::Array(entries));
    plan.insert("text".to_string(), Value::String(text));
    if let Some(path) = path {
        plan.insert("path".to_string(), Value::String(path));
    }
    Some(Value::Object(plan))
}

fn codex_history_replay_plan_entries(item: &Value) -> Vec<Value> {
    ["entries", "plan", "steps"]
        .iter()
        .find_map(|key| item.get(*key).and_then(Value::as_array))
        .map(|entries| {
            entries
                .iter()
                .filter_map(codex_history_replay_plan_entry)
                .collect()
        })
        .unwrap_or_default()
}

fn codex_history_replay_plan_entry(entry: &Value) -> Option<Value> {
    let content = match entry {
        Value::String(content) => content.clone(),
        Value::Object(_) => entry
            .get("content")
            .or_else(|| entry.get("text"))
            .or_else(|| entry.get("step"))
            .and_then(Value::as_str)?
            .to_string(),
        _ => return None,
    };
    if content.trim().is_empty() {
        return None;
    }

    let status = match entry.get("status").and_then(Value::as_str) {
        Some("completed" | "Completed") => PlanEntryStatus::Completed,
        Some("in_progress" | "inProgress" | "InProgress") => PlanEntryStatus::InProgress,
        _ => PlanEntryStatus::Pending,
    };
    Some(json!({
        "content": content,
        "status": status,
    }))
}

fn codex_history_replay_tool_uses_call_id(item_type: &str) -> bool {
    matches!(
        item_type,
        "dynamicToolCall"
            | "function_call"
            | "function_call_output"
            | "custom_tool_call"
            | "custom_tool_call_output"
            | "tool_search_call"
            | "tool_search_output"
    )
}

fn normalize_host_capability_history_tool_item(replay_item: &mut Value) {
    if replay_item.get("type").and_then(Value::as_str) != Some("dynamicToolCall")
        || !dynamic_tool_is_host_capability(replay_item)
    {
        return;
    }

    let has_input_payload = dynamic_tool_has_input_payload(replay_item);
    {
        let Value::Object(fields) = replay_item else {
            return;
        };
        fields
            .entry("kind".to_string())
            .or_insert_with(|| Value::String("hostCapability".to_string()));
        if !has_input_payload {
            return;
        }

        if let Some(arguments) = fields
            .get("arguments")
            .and_then(Value::as_str)
            .and_then(|arguments| serde_json::from_str::<Value>(arguments).ok())
        {
            fields.insert("arguments".to_string(), arguments);
        }
    }

    let options = host_capability_options(replay_item);
    let title = options
        .title
        .clone()
        .unwrap_or_else(|| "User input requested".to_string());
    let input_summary = host_capability_input_summary(&options);
    let raw_input = host_capability_elicitation_input(replay_item, &options);
    let Value::Object(fields) = replay_item else {
        return;
    };
    if !title.trim().is_empty() {
        fields
            .entry("title".to_string())
            .or_insert_with(|| Value::String(title));
    }
    if let Some(input_summary) = input_summary {
        fields
            .entry("inputSummary".to_string())
            .or_insert_with(|| Value::String(input_summary.clone()));
        fields.entry("rawInput".to_string()).or_insert(raw_input);
    }
}

fn host_capability_input_summary(options: &ElicitationOptions) -> Option<String> {
    if let Some(body) = options.body.as_ref().filter(|body| !body.trim().is_empty()) {
        return Some(body.clone());
    }
    let questions = options
        .questions
        .iter()
        .map(|question| {
            if question.question.trim().is_empty() {
                question.header.as_str()
            } else {
                question.question.as_str()
            }
        })
        .filter(|text| !text.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    (!questions.is_empty()).then_some(questions)
}

fn host_capability_elicitation_input(item: &Value, options: &ElicitationOptions) -> Value {
    json!({
        "actionId": first_item_string(item, &["callId", "id", "call_id", "itemId"]),
        "body": options.body,
        "choices": options.choices,
        "id": first_item_string(item, &["id", "callId", "call_id", "itemId"])
            .unwrap_or_else(|| "hostCapability".to_string()),
        "kind": "userInput",
        "phase": "open",
        "questions": options.questions.iter().map(|question| {
            json!({
                "header": question.header,
                "id": question.id,
                "isOther": question.is_other,
                "isSecret": question.is_secret,
                "options": question.options.iter().map(|option| {
                    json!({
                        "description": option.description,
                        "label": option.label,
                    })
                }).collect::<Vec<_>>(),
                "question": question.question,
            })
        }).collect::<Vec<_>>(),
        "title": options.title,
        "turnId": first_item_string(item, &["turnId", "turn_id"]),
    })
}

fn first_item_string(item: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| item.get(*key).and_then(Value::as_str))
        .map(str::to_string)
}

fn string_field(fields: &serde_json::Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| fields.get(*key).and_then(Value::as_str))
        .map(str::to_string)
}

fn codex_history_replay_tool_item_type(item_type: &str) -> bool {
    matches!(
        item_type,
        "commandExecution"
            | "fileChange"
            | "mcpToolCall"
            | "dynamicToolCall"
            | "webSearch"
            | "imageView"
            | "imageGeneration"
            | "contextCompaction"
            | "function_call"
            | "function_call_output"
            | "custom_tool_call"
            | "custom_tool_call_output"
            | "local_shell_call"
            | "mcp_call"
            | "computer_call"
            | "web_search_call"
            | "tool_search_call"
            | "tool_search_output"
    )
}

fn content_delta_is_empty(content: &ContentDelta) -> bool {
    match content {
        ContentDelta::Text(text)
        | ContentDelta::ResourceRef(text)
        | ContentDelta::Structured(text) => text.trim().is_empty(),
        ContentDelta::Parts(parts) => parts.iter().all(|part| match part {
            ContentPart::Text(text) => text.trim().is_empty(),
            ContentPart::Image {
                data, mime_type, ..
            } => data.is_empty() || !mime_type.starts_with("image/"),
            ContentPart::File { data, .. } => data.is_empty(),
        }),
    }
}

fn codex_content_delta(item: &Value) -> ContentDelta {
    let parts = codex_content_parts(item);
    if parts
        .iter()
        .any(|part| matches!(part, ContentPart::Image { .. } | ContentPart::File { .. }))
    {
        return ContentDelta::Parts(parts);
    }
    ContentDelta::Text(codex_content_text(item))
}

fn codex_content_text(item: &Value) -> String {
    item.get("content")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|part| part.get("text").and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join("")
}

fn codex_content_parts(item: &Value) -> Vec<ContentPart> {
    item.get("content")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(codex_content_part)
        .collect()
}

fn codex_content_part(part: &Value) -> Option<ContentPart> {
    match part.get("type").and_then(Value::as_str) {
        Some("text") | Some("input_text") | Some("output_text") => {
            let text = part.get("text").and_then(Value::as_str)?;
            Some(
                codex_file_part_from_text(text)
                    .unwrap_or_else(|| ContentPart::text(text.to_string())),
            )
        }
        Some("image") | Some("input_image") => codex_image_part(part),
        _ => None,
    }
}

fn codex_file_part_from_text(text: &str) -> Option<ContentPart> {
    parse_codex_blob_resource_text(text).or_else(|| parse_codex_text_resource_text(text))
}

fn parse_codex_blob_resource_text(text: &str) -> Option<ContentPart> {
    let (header, data) = text.split_once("\n\n")?;
    let mut lines = header.lines();
    let name = lines.next()?.strip_prefix("Attached file: ")?;
    let _uri = lines.next()?.strip_prefix("URI: ")?;
    let mut mime_type = "application/octet-stream";
    let mut encoding = None;
    for line in lines {
        if let Some(value) = line.strip_prefix("MIME type: ") {
            mime_type = value;
        } else if let Some(value) = line.strip_prefix("Encoding: ") {
            encoding = Some(value);
        }
    }
    if encoding != Some("base64") || data.trim().is_empty() {
        return None;
    }
    Some(ContentPart::file(
        data.to_string(),
        mime_type.to_string(),
        non_empty_name(name),
    ))
}

fn parse_codex_text_resource_text(text: &str) -> Option<ContentPart> {
    let (header, data) = text.split_once("\n\n")?;
    let mut lines = header.lines();
    let uri = lines.next()?.strip_prefix("Attached text resource: ")?;
    let mut mime_type = "text/plain";
    for line in lines {
        if let Some(value) = line.strip_prefix("MIME type: ") {
            mime_type = value;
        }
    }
    if data.is_empty() {
        return None;
    }
    Some(ContentPart::file(
        data.to_string(),
        mime_type.to_string(),
        non_empty_name(file_name_from_uri(uri)),
    ))
}

fn file_name_from_uri(uri: &str) -> &str {
    uri.rsplit('/')
        .find(|part| !part.trim().is_empty())
        .unwrap_or(uri)
}

fn non_empty_name(name: &str) -> Option<String> {
    (!name.trim().is_empty()).then(|| name.to_string())
}

fn codex_image_part(part: &Value) -> Option<ContentPart> {
    let raw_url = part
        .get("url")
        .or_else(|| part.get("image_url"))
        .or_else(|| part.get("image"))
        .and_then(Value::as_str)?;
    let (mime_type, data) = data_image_url(raw_url)?;
    let name = part
        .get("name")
        .or_else(|| part.get("filename"))
        .and_then(Value::as_str)
        .filter(|name| !name.trim().is_empty())
        .map(str::to_string);
    Some(ContentPart::image(data, mime_type, name))
}

fn data_image_url(value: &str) -> Option<(String, String)> {
    let rest = value.strip_prefix("data:")?;
    let (meta, data) = rest.split_once(',')?;
    let mime_type = meta.split(';').next()?.to_string();
    if !mime_type.starts_with("image/") || data.is_empty() || !meta.contains(";base64") {
        return None;
    }
    Some((mime_type, data.to_string()))
}

fn codex_reasoning_text(item: &Value) -> String {
    let summary = item
        .get("summary")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .collect::<Vec<_>>()
        .join("\n\n");
    if summary.trim().is_empty() {
        codex_content_text(item)
    } else {
        summary
    }
}

fn discovered_conversation_id(
    engine: &AngelEngine,
    remote: &RemoteConversationId,
    fallback: String,
) -> ConversationId {
    engine
        .conversations
        .iter()
        .find(|(_, conversation)| &conversation.remote == remote)
        .map(|(id, _)| id.clone())
        .unwrap_or_else(|| ConversationId::new(fallback))
}

fn codex_thread_info_context(thread: &Value) -> ContextPatch {
    let mut updates = Vec::new();
    if let Some(cwd) = thread.get("cwd").and_then(Value::as_str) {
        updates.push(angel_engine::ContextUpdate::Cwd {
            scope: angel_engine::ContextScope::Conversation,
            cwd: Some(cwd.to_string()),
        });
    }
    let title = thread
        .get("name")
        .and_then(Value::as_str)
        .filter(|name| !name.is_empty())
        .or_else(|| {
            thread
                .get("preview")
                .and_then(Value::as_str)
                .filter(|preview| !preview.is_empty())
        });
    if let Some(title) = title {
        updates.push(angel_engine::ContextUpdate::Raw {
            scope: angel_engine::ContextScope::Conversation,
            key: "conversation.title".to_string(),
            value: title.to_string(),
        });
    }
    if let Some(updated_at) = thread.get("updatedAt").and_then(Value::as_i64) {
        updates.push(angel_engine::ContextUpdate::Raw {
            scope: angel_engine::ContextScope::Conversation,
            key: "conversation.updatedAt".to_string(),
            value: updated_at.to_string(),
        });
    }
    ContextPatch { updates }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn thread_start_advertises_codex_slash_commands() {
        let adapter = CodexAdapter::app_server();
        let mut engine = AngelEngine::with_available_runtime(
            angel_engine::ProtocolFlavor::CodexAppServer,
            angel_engine::RuntimeCapabilities::new("test"),
            adapter.capabilities(),
        );
        let request_id = engine
            .plan_command(angel_engine::EngineCommand::StartConversation {
                params: angel_engine::StartConversationParams::default(),
            })
            .expect("start plan")
            .request_id
            .expect("request id");

        let output = adapter
            .decode_response(
                &engine,
                &request_id,
                &json!({
                    "thread": {
                        "id": "thread_1",
                        "cwd": "/tmp/project"
                    }
                }),
            )
            .expect("thread start response");

        assert!(matches!(
            output.events.as_slice(),
            [
                EngineEvent::ConversationReady { .. },
                EngineEvent::AvailableCommandsUpdated { commands, .. },
                EngineEvent::SessionModesUpdated { modes, .. },
                EngineEvent::SessionPermissionModesUpdated { modes: permission_modes, .. },
                EngineEvent::SessionConfigOptionsUpdated { options, .. }
            ] if commands.iter().any(|command| command.name == "plan")
                && commands.iter().any(|command| command.name == "compact")
                && commands.iter().any(|command| command.name == "fast")
                && commands.iter().all(|command| !matches!(
                    command.name.as_str(),
                    "copy" | "raw" | "theme" | "quit" | "review" | "mention"
                ))
                && modes.current_mode_id == "default"
                && modes.available_modes.iter().any(|mode| mode.id == "default")
                && modes.available_modes.iter().any(|mode| mode.id == "plan")
                && permission_modes.current_mode_id == "on-request"
                && permission_modes.available_modes.iter().any(|mode| mode.id == "untrusted")
                && permission_modes.available_modes.iter().any(|mode| mode.id == "on-request")
                && permission_modes.available_modes.iter().any(|mode| mode.id == "never")
                && options.iter().any(|option| option.id == "reasoning"
                    && option.values.iter().any(|value| value.value == "none")
                    && option.values.iter().any(|value| value.value == "minimal")
                    && option.values.iter().any(|value| value.value == "low")
                    && option.values.iter().any(|value| value.value == "medium")
                    && option.values.iter().any(|value| value.value == "high")
                    && option.values.iter().any(|value| value.value == "xhigh"))
        ));
    }

    #[test]
    fn thread_list_discovers_threads_with_common_metadata() {
        let adapter = CodexAdapter::app_server();
        let mut engine = AngelEngine::with_available_runtime(
            angel_engine::ProtocolFlavor::CodexAppServer,
            angel_engine::RuntimeCapabilities::new("test"),
            adapter.capabilities(),
        );
        let request_id = engine
            .plan_command(angel_engine::EngineCommand::DiscoverConversations {
                params: angel_engine::DiscoverConversationsParams::default(),
            })
            .expect("discover plan")
            .request_id
            .expect("request id");

        let output = adapter
            .decode_response(
                &engine,
                &request_id,
                &json!({
                    "data": [
                        {
                            "id": "thread_1",
                            "cwd": "/tmp/project",
                            "name": "Fix tests",
                            "preview": "older preview",
                            "updatedAt": 1777770000
                        }
                    ],
                    "nextCursor": "next-page",
                    "backwardsCursor": null
                }),
            )
            .expect("thread list response");

        assert!(matches!(
            output.events.as_slice(),
            [EngineEvent::ConversationDiscovered {
                id,
                remote: RemoteConversationId::Known(thread_id),
                context,
                ..
            }, EngineEvent::ConversationDiscoveryPage {
                cursor,
                next_cursor,
            }] if id.as_str() == "codex-thread-thread_1"
                && thread_id == "thread_1"
                && cursor.is_none()
                && next_cursor.as_deref() == Some("next-page")
                && context.updates.iter().any(|update| matches!(
                    update,
                    angel_engine::ContextUpdate::Cwd { cwd: Some(cwd), .. } if cwd == "/tmp/project"
                ))
                && context.updates.iter().any(|update| matches!(
                    update,
                    angel_engine::ContextUpdate::Raw { key, value, .. }
                        if key == "conversation.title" && value == "Fix tests"
            ))
        ));
    }

    #[test]
    fn thread_resume_hydrates_turn_items_into_history_replay() {
        let adapter = CodexAdapter::app_server();
        let mut engine = AngelEngine::with_available_runtime(
            angel_engine::ProtocolFlavor::CodexAppServer,
            angel_engine::RuntimeCapabilities::new("test"),
            adapter.capabilities(),
        );
        let request_id = engine
            .plan_command(angel_engine::EngineCommand::ResumeConversation {
                target: angel_engine::ResumeTarget::Remote {
                    id: "thread_1".to_string(),
                    hydrate: true,
                    cwd: None,
                },
            })
            .expect("resume plan")
            .request_id
            .expect("request id");

        let output = adapter
            .decode_response(
                &engine,
                &request_id,
                &json!({
                    "thread": {
                        "id": "thread_1",
                        "cwd": "/tmp/project",
                        "turns": [
                            {
                                "id": "turn_1",
                                "items": [
                                    {
                                        "type": "userMessage",
                                        "content": [{ "type": "text", "text": "hello" }]
                                    },
                                    {
                                        "type": "reasoning",
                                        "summary": ["thinking"]
                                    },
                                    {
                                        "type": "response_item",
                                        "payload": {
                                            "type": "webSearch",
                                            "id": "search_1",
                                            "query": "keyboard lock"
                                        }
                                    },
                                    {
                                        "id": "exec-1",
                                        "type": "commandExecution",
                                        "status": "completed",
                                        "command": "cargo test"
                                    },
                                    {
                                        "type": "response_item",
                                        "payload": {
                                            "type": "function_call",
                                            "id": "fc_item_1",
                                            "call_id": "call_1",
                                            "name": "shell",
                                            "arguments": "{\"command\":[\"zsh\",\"-lc\",\"git status -sb\"]}"
                                        }
                                    },
                                    {
                                        "type": "response_item",
                                        "payload": {
                                            "type": "function_call_output",
                                            "id": "out_item_1",
                                            "call_id": "call_1",
                                            "output": "{\"output\":\"## main\\n\",\"metadata\":{\"exit_code\":0}}"
                                        }
                                    },
                                    {
                                        "type": "response_item",
                                        "payload": {
                                            "type": "webSearch",
                                            "query": "missing id should not hydrate"
                                        }
                                    },
                                    {
                                        "type": "agentMessage",
                                        "text": "hi"
                                    }
                                ]
                            }
                        ]
                    }
                }),
            )
            .expect("thread resume response");

        let replay = output
            .events
            .iter()
            .filter_map(|event| match event {
                EngineEvent::HistoryReplayChunk { entry, .. } => match &entry.content {
                    ContentDelta::Text(text) => {
                        Some((entry.role.clone(), "text".to_string(), text.clone()))
                    }
                    ContentDelta::Structured(text) => {
                        Some((entry.role.clone(), "structured".to_string(), text.clone()))
                    }
                    ContentDelta::ResourceRef(text) => {
                        Some((entry.role.clone(), "resource".to_string(), text.clone()))
                    }
                    ContentDelta::Parts(parts) => Some((
                        entry.role.clone(),
                        "parts".to_string(),
                        parts
                            .iter()
                            .filter_map(|part| match part {
                                ContentPart::Text(text) => Some(text.as_str()),
                                ContentPart::Image { .. } | ContentPart::File { .. } => None,
                            })
                            .collect::<Vec<_>>()
                            .join(""),
                    )),
                },
                _ => None,
            })
            .collect::<Vec<_>>();
        let replay_entries = output
            .events
            .iter()
            .filter_map(|event| match event {
                EngineEvent::HistoryReplayChunk { entry, .. } => Some(entry),
                _ => None,
            })
            .collect::<Vec<_>>();

        assert_eq!(replay.len(), 8);
        assert_eq!(
            replay[0],
            (HistoryRole::User, "text".to_string(), "hello".to_string())
        );
        assert_eq!(
            replay[1],
            (
                HistoryRole::Reasoning,
                "text".to_string(),
                "thinking".to_string()
            )
        );
        assert_eq!(replay[2].0, HistoryRole::Tool);
        assert_eq!(replay[2].1, "structured");
        let search_item: Value = serde_json::from_str(&replay[2].2).expect("search item");
        assert_eq!(
            search_item.get("type").and_then(Value::as_str),
            Some("webSearch")
        );
        assert_eq!(
            search_item.get("id").and_then(Value::as_str),
            Some("search_1")
        );
        assert_eq!(
            search_item.get("status").and_then(Value::as_str),
            Some("completed")
        );
        assert_eq!(
            replay_entries[2]
                .tool
                .as_ref()
                .and_then(|tool| tool.kind.as_ref()),
            Some(&ActionKind::WebSearch)
        );
        assert_eq!(
            replay_entries[2]
                .tool
                .as_ref()
                .and_then(|tool| tool.title.as_deref()),
            Some("keyboard lock")
        );
        assert_eq!(replay[3].0, HistoryRole::Tool);
        assert_eq!(replay[3].1, "structured");
        let tool_item: Value = serde_json::from_str(&replay[3].2).expect("tool item");
        assert_eq!(
            tool_item.get("type").and_then(Value::as_str),
            Some("commandExecution")
        );
        assert_eq!(tool_item.get("id").and_then(Value::as_str), Some("exec-1"));
        assert_eq!(
            replay_entries[3]
                .tool
                .as_ref()
                .and_then(|tool| tool.kind.as_ref()),
            Some(&ActionKind::Command)
        );
        assert_eq!(
            replay_entries[3]
                .tool
                .as_ref()
                .and_then(|tool| tool.title.as_deref()),
            Some("cargo test")
        );
        assert_eq!(replay[4].0, HistoryRole::Tool);
        assert_eq!(replay[4].1, "structured");
        let raw_call_item: Value = serde_json::from_str(&replay[4].2).expect("raw call item");
        assert_eq!(
            raw_call_item.get("type").and_then(Value::as_str),
            Some("function_call")
        );
        assert_eq!(
            raw_call_item.get("id").and_then(Value::as_str),
            Some("call_1")
        );
        assert_eq!(
            raw_call_item.get("itemId").and_then(Value::as_str),
            Some("fc_item_1")
        );
        assert_eq!(
            raw_call_item.get("call_id").and_then(Value::as_str),
            Some("call_1")
        );
        assert_eq!(
            raw_call_item.get("status").and_then(Value::as_str),
            Some("completed")
        );
        assert_eq!(
            replay_entries[4]
                .tool
                .as_ref()
                .and_then(|tool| tool.kind.as_ref()),
            Some(&ActionKind::Command)
        );
        assert_eq!(replay[5].0, HistoryRole::Tool);
        assert_eq!(replay[5].1, "structured");
        let raw_output_item: Value = serde_json::from_str(&replay[5].2).expect("raw output item");
        assert_eq!(
            raw_output_item.get("type").and_then(Value::as_str),
            Some("function_call_output")
        );
        assert_eq!(
            raw_output_item.get("id").and_then(Value::as_str),
            Some("call_1")
        );
        assert_eq!(
            raw_output_item.get("itemId").and_then(Value::as_str),
            Some("out_item_1")
        );
        assert_eq!(
            raw_output_item.get("call_id").and_then(Value::as_str),
            Some("call_1")
        );
        assert_eq!(
            raw_output_item.get("status").and_then(Value::as_str),
            Some("completed")
        );
        assert_eq!(
            replay_entries[5]
                .tool
                .as_ref()
                .map(|tool| tool.phase.clone()),
            Some(ActionPhase::Completed)
        );
        assert_eq!(replay[6].0, HistoryRole::Tool);
        assert_eq!(replay[6].1, "structured");
        assert!(
            replay_entries[6]
                .tool
                .as_ref()
                .and_then(|tool| tool.id.as_deref())
                .is_some_and(|id| id.starts_with("codex-history-webSearch-"))
        );
        assert_eq!(
            replay_entries[6]
                .tool
                .as_ref()
                .and_then(|tool| tool.kind.as_ref()),
            Some(&ActionKind::WebSearch)
        );
        assert_eq!(
            replay[7],
            (HistoryRole::Assistant, "text".to_string(), "hi".to_string())
        );
    }

    #[test]
    fn thread_read_hydrates_rollout_turn_items_into_history_replay() {
        let adapter = CodexAdapter::app_server();
        let conversation_id = ConversationId::new("conv");
        let mut engine = AngelEngine::with_available_runtime(
            angel_engine::ProtocolFlavor::CodexAppServer,
            angel_engine::RuntimeCapabilities::new("test"),
            adapter.capabilities(),
        );
        engine
            .apply_event(EngineEvent::ConversationProvisionStarted {
                id: conversation_id.clone(),
                remote: RemoteConversationId::Known("thread_1".to_string()),
                op: angel_engine::ProvisionOp::Resume,
                capabilities: adapter.capabilities(),
            })
            .expect("conversation provisioned");
        engine
            .apply_event(EngineEvent::ConversationReady {
                id: conversation_id.clone(),
                remote: Some(RemoteConversationId::Known("thread_1".to_string())),
                context: Default::default(),
                capabilities: Some(adapter.capabilities()),
            })
            .expect("conversation ready");

        let request_id = engine
            .plan_command(angel_engine::EngineCommand::ReadConversation {
                conversation_id: conversation_id.clone(),
            })
            .expect("read plan")
            .request_id
            .expect("request id");

        let output = adapter
            .decode_response(
                &engine,
                &request_id,
                &json!({
                    "thread": {
                        "id": "thread_1",
                        "turns": [
                            {
                                "id": "turn_1",
                                "items": [
                                    {
                                        "type": "userMessage",
                                        "content": [{ "type": "text", "text": "hello" }]
                                    },
                                    {
                                        "type": "reasoning",
                                        "summary": ["thinking"]
                                    },
                                    {
                                        "id": "exec-1",
                                        "type": "commandExecution",
                                        "status": "completed",
                                        "command": "cargo test"
                                    },
                                    {
                                        "type": "agentMessage",
                                        "text": "done"
                                    }
                                ]
                            }
                        ]
                    }
                }),
            )
            .expect("thread read response");

        let replay = output
            .events
            .iter()
            .filter_map(|event| match event {
                EngineEvent::HistoryReplayChunk { entry, .. } => Some(entry),
                _ => None,
            })
            .collect::<Vec<_>>();

        assert_eq!(replay.len(), 4);
        assert_eq!(replay[0].role, HistoryRole::User);
        assert_eq!(replay[1].role, HistoryRole::Reasoning);
        assert_eq!(replay[2].role, HistoryRole::Tool);
        assert_eq!(
            replay[2].tool.as_ref().and_then(|tool| tool.kind.as_ref()),
            Some(&ActionKind::Command)
        );
        assert_eq!(replay[3].role, HistoryRole::Assistant);
    }

    #[test]
    fn thread_resume_preserves_user_image_content_parts() {
        let adapter = CodexAdapter::app_server();
        let mut engine = AngelEngine::with_available_runtime(
            angel_engine::ProtocolFlavor::CodexAppServer,
            angel_engine::RuntimeCapabilities::new("test"),
            adapter.capabilities(),
        );
        let request_id = engine
            .plan_command(angel_engine::EngineCommand::ResumeConversation {
                target: angel_engine::ResumeTarget::Remote {
                    id: "thread_1".to_string(),
                    hydrate: true,
                    cwd: None,
                },
            })
            .expect("resume plan")
            .request_id
            .expect("request id");

        let output = adapter
            .decode_response(
                &engine,
                &request_id,
                &json!({
                    "thread": {
                        "id": "thread_1",
                        "turns": [
                            {
                                "items": [
                                    {
                                        "type": "userMessage",
                                        "content": [
                                            { "type": "text", "text": "look" },
                                            {
                                                "type": "image",
                                                "url": "data:image/png;base64,ZmFrZQ==",
                                                "name": "sample.png"
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                }),
            )
            .expect("thread resume response");

        let entry = output
            .events
            .iter()
            .find_map(|event| match event {
                EngineEvent::HistoryReplayChunk { entry, .. } => Some(entry),
                _ => None,
            })
            .expect("history replay entry");

        assert_eq!(entry.role, HistoryRole::User);
        assert!(matches!(
            &entry.content,
            ContentDelta::Parts(parts)
                if matches!(
                    parts.as_slice(),
                    [
                        ContentPart::Text(text),
                        ContentPart::Image { data, mime_type, name }
                    ] if text == "look"
                        && data == "ZmFrZQ=="
                        && mime_type == "image/png"
                        && name.as_deref() == Some("sample.png")
            )
        ));
    }

    #[test]
    fn thread_resume_restores_codex_text_file_fallback_parts() {
        let adapter = CodexAdapter::app_server();
        let mut engine = AngelEngine::with_available_runtime(
            angel_engine::ProtocolFlavor::CodexAppServer,
            angel_engine::RuntimeCapabilities::new("test"),
            adapter.capabilities(),
        );
        let request_id = engine
            .plan_command(angel_engine::EngineCommand::ResumeConversation {
                target: angel_engine::ResumeTarget::Remote {
                    id: "thread_1".to_string(),
                    hydrate: true,
                    cwd: None,
                },
            })
            .expect("resume plan")
            .request_id
            .expect("request id");

        let output = adapter
            .decode_response(
                &engine,
                &request_id,
                &json!({
                    "thread": {
                        "id": "thread_1",
                        "turns": [
                            {
                                "items": [
                                    {
                                        "type": "userMessage",
                                        "content": [
                                            {
                                                "type": "text",
                                                "text": "Attached text resource: attachment:///notes.txt\nMIME type: text/plain\n\nhello from a file"
                                            },
                                            {
                                                "type": "text",
                                                "text": "Attached file: archive.zip\nURI: attachment:///archive.zip\nMIME type: application/zip\nEncoding: base64\n\nUEsDBAo="
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                }),
            )
            .expect("thread resume response");

        let entry = output
            .events
            .iter()
            .find_map(|event| match event {
                EngineEvent::HistoryReplayChunk { entry, .. } => Some(entry),
                _ => None,
            })
            .expect("history replay entry");

        assert_eq!(entry.role, HistoryRole::User);
        assert!(matches!(
            &entry.content,
            ContentDelta::Parts(parts)
                if matches!(
                    parts.as_slice(),
                    [
                        ContentPart::File { data: text_data, mime_type: text_mime, name: text_name },
                        ContentPart::File { data: blob_data, mime_type: blob_mime, name: blob_name },
                    ] if text_data == "hello from a file"
                        && text_mime == "text/plain"
                        && text_name.as_deref() == Some("notes.txt")
                        && blob_data == "UEsDBAo="
                        && blob_mime == "application/zip"
                        && blob_name.as_deref() == Some("archive.zip")
                )
        ));
    }
}
