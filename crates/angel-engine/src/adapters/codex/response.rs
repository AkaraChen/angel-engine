use super::protocol_helpers::*;
use super::*;

impl CodexAdapter {
    pub(super) fn decode_response(
        &self,
        engine: &AngelEngine,
        id: &JsonRpcRequestId,
        result: &Value,
    ) -> Result<TransportOutput, crate::EngineError> {
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
                        capabilities: crate::RuntimeCapabilities {
                            name: "codex-app-server".to_string(),
                            version: result
                                .get("userAgent")
                                .and_then(Value::as_str)
                                .map(str::to_string),
                            discovery: crate::CapabilitySupport::Supported,
                            authentication: crate::CapabilitySupport::Unknown,
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
                    .ok_or_else(|| crate::EngineError::InvalidCommand {
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
                    .ok_or_else(|| crate::EngineError::InvalidCommand {
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
                        result: crate::HistoryMutationResult {
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
    ) -> Result<TransportOutput, crate::EngineError> {
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
            let (role, text) = match item.get("type").and_then(Value::as_str) {
                Some("userMessage") => (HistoryRole::User, codex_content_text(item)),
                Some("agentMessage") => (
                    HistoryRole::Assistant,
                    item.get("text")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string(),
                ),
                Some("reasoning") => (HistoryRole::Reasoning, codex_reasoning_text(item)),
                _ => continue,
            };
            if text.trim().is_empty() {
                continue;
            }
            output.events.push(EngineEvent::HistoryReplayChunk {
                conversation_id: conversation_id.clone(),
                entry: HistoryReplayEntry {
                    role,
                    content: ContentDelta::Text(text),
                },
            });
        }
    }
}

fn codex_content_text(item: &Value) -> String {
    item.get("content")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|part| {
            if part.get("type").and_then(Value::as_str) == Some("text") {
                part.get("text").and_then(Value::as_str)
            } else {
                None
            }
        })
        .collect::<Vec<_>>()
        .join("")
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
        updates.push(crate::ContextUpdate::Cwd {
            scope: crate::ContextScope::Conversation,
            cwd: Some(cwd.to_string()),
        });
    }
    if let Some(name) = thread.get("name").and_then(Value::as_str)
        && !name.is_empty()
    {
        updates.push(crate::ContextUpdate::Raw {
            scope: crate::ContextScope::Conversation,
            key: "conversation.title".to_string(),
            value: name.to_string(),
        });
    } else if let Some(preview) = thread.get("preview").and_then(Value::as_str)
        && !preview.is_empty()
    {
        updates.push(crate::ContextUpdate::Raw {
            scope: crate::ContextScope::Conversation,
            key: "conversation.title".to_string(),
            value: preview.to_string(),
        });
    }
    if let Some(updated_at) = thread.get("updatedAt").and_then(Value::as_i64) {
        updates.push(crate::ContextUpdate::Raw {
            scope: crate::ContextScope::Conversation,
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
            crate::ProtocolFlavor::CodexAppServer,
            crate::RuntimeCapabilities::new("test"),
            adapter.capabilities(),
        );
        let request_id = engine
            .plan_command(crate::EngineCommand::DiscoverConversations {
                params: crate::DiscoverConversationsParams::default(),
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
                    crate::ContextUpdate::Cwd { cwd: Some(cwd), .. } if cwd == "/tmp/project"
                ))
                && context.updates.iter().any(|update| matches!(
                    update,
                    crate::ContextUpdate::Raw { key, value, .. }
                        if key == "conversation.title" && value == "Fix tests"
            ))
        ));
    }

    #[test]
    fn thread_resume_hydrates_turn_items_into_history_replay() {
        let adapter = CodexAdapter::app_server();
        let mut engine = AngelEngine::with_available_runtime(
            crate::ProtocolFlavor::CodexAppServer,
            crate::RuntimeCapabilities::new("test"),
            adapter.capabilities(),
        );
        let request_id = engine
            .plan_command(crate::EngineCommand::ResumeConversation {
                target: crate::ResumeTarget::Remote {
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
                    ContentDelta::Text(text) => Some((entry.role.clone(), text.clone())),
                    _ => None,
                },
                _ => None,
            })
            .collect::<Vec<_>>();

        assert_eq!(
            replay,
            vec![
                (HistoryRole::User, "hello".to_string()),
                (HistoryRole::Reasoning, "thinking".to_string()),
                (HistoryRole::Assistant, "hi".to_string()),
            ]
        );
    }
}
