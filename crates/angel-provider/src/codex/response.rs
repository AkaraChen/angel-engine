use super::protocol_helpers::*;
use super::*;

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
                    .log(TransportLogKind::State, format!("thread {thread_id} ready"));
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
                    .log(TransportLogKind::State, format!("thread {thread_id} ready"));
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
            if let Some(PendingRequest::StartTurn {
                conversation_id,
                turn_id,
            }) = engine.pending.requests.get(id)
            {
                output.events.push(EngineEvent::TurnTerminal {
                    conversation_id: conversation_id.clone(),
                    turn_id: turn_id.clone(),
                    outcome: TurnOutcome::Failed(ErrorInfo::new(
                        format!("codex.rpc.{code}"),
                        message.to_string(),
                    )),
                });
            }
        }
        Ok(output)
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
            let (role, content) = match replay_item.get("type").and_then(Value::as_str) {
                Some("userMessage") => (HistoryRole::User, codex_content_delta(replay_item)),
                Some("message")
                    if replay_item.get("role").and_then(Value::as_str) == Some("user") =>
                {
                    (HistoryRole::User, codex_content_delta(replay_item))
                }
                Some("message")
                    if replay_item.get("role").and_then(Value::as_str) == Some("assistant") =>
                {
                    (HistoryRole::Assistant, codex_content_delta(replay_item))
                }
                Some("message") => (HistoryRole::Assistant, codex_content_delta(replay_item)),
                Some("agentMessage") => (
                    HistoryRole::Assistant,
                    ContentDelta::Text(
                        replay_item
                            .get("text")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_string(),
                    ),
                ),
                Some("reasoning") => (
                    HistoryRole::Reasoning,
                    ContentDelta::Text(codex_reasoning_text(replay_item)),
                ),
                Some(item_type) if codex_history_replay_tool_item_type(item_type) => (
                    HistoryRole::Tool,
                    ContentDelta::Structured(
                        codex_history_replay_tool_item(replay_item).to_string(),
                    ),
                ),
                _ => continue,
            };
            if content_delta_is_empty(&content) {
                continue;
            }
            output.events.push(EngineEvent::HistoryReplayChunk {
                conversation_id: conversation_id.clone(),
                entry: HistoryReplayEntry { role, content },
            });
        }
    }
}

fn codex_history_replay_item(item: &Value) -> &Value {
    if item.get("type").and_then(Value::as_str) == Some("response_item")
        && let Some(payload) = item.get("payload").filter(|payload| payload.is_object())
    {
        return payload;
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

    if codex_history_replay_tool_uses_call_id(&item_type)
        && let Some(call_id) = string_field(fields, &["callId", "call_id"])
    {
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

    fields
        .entry("status".to_string())
        .or_insert_with(|| Value::String("completed".to_string()));
    replay_item
}

fn codex_history_replay_tool_uses_call_id(item_type: &str) -> bool {
    matches!(
        item_type,
        "function_call"
            | "function_call_output"
            | "custom_tool_call"
            | "custom_tool_call_output"
            | "tool_search_call"
            | "tool_search_output"
    )
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
        }),
    }
}

fn codex_content_delta(item: &Value) -> ContentDelta {
    let parts = codex_content_parts(item);
    if parts
        .iter()
        .any(|part| matches!(part, ContentPart::Image { .. }))
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
        Some("text") | Some("input_text") | Some("output_text") => part
            .get("text")
            .and_then(Value::as_str)
            .map(|text| ContentPart::text(text.to_string())),
        Some("image") | Some("input_image") => codex_image_part(part),
        _ => None,
    }
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
    if let Some(name) = thread.get("name").and_then(Value::as_str)
        && !name.is_empty()
    {
        updates.push(angel_engine::ContextUpdate::Raw {
            scope: angel_engine::ContextScope::Conversation,
            key: "conversation.title".to_string(),
            value: name.to_string(),
        });
    } else if let Some(preview) = thread.get("preview").and_then(Value::as_str)
        && !preview.is_empty()
    {
        updates.push(angel_engine::ContextUpdate::Raw {
            scope: angel_engine::ContextScope::Conversation,
            key: "conversation.title".to_string(),
            value: preview.to_string(),
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
                                ContentPart::Image { .. } => None,
                            })
                            .collect::<Vec<_>>()
                            .join(""),
                    )),
                },
                _ => None,
            })
            .collect::<Vec<_>>();

        assert_eq!(replay.len(), 7);
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
        assert_eq!(replay[3].0, HistoryRole::Tool);
        assert_eq!(replay[3].1, "structured");
        let tool_item: Value = serde_json::from_str(&replay[3].2).expect("tool item");
        assert_eq!(
            tool_item.get("type").and_then(Value::as_str),
            Some("commandExecution")
        );
        assert_eq!(tool_item.get("id").and_then(Value::as_str), Some("exec-1"));
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
            replay[6],
            (HistoryRole::Assistant, "text".to_string(), "hi".to_string())
        );
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
}
