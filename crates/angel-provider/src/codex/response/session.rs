use super::super::commands::codex_slash_commands;
use super::history::{append_hydrated_turns, append_local_rollout_history};
use super::settings::append_codex_default_settings;
use super::*;

impl CodexAdapter {
    pub(super) fn decode_start_conversation_response(
        &self,
        mut output: TransportOutput,
        engine: &AngelEngine,
        conversation_id: &ConversationId,
        result: &Value,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
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
        Ok(output)
    }

    pub(super) fn decode_read_conversation_response(
        &self,
        mut output: TransportOutput,
        conversation_id: &ConversationId,
        result: &Value,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
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
        Ok(output)
    }

    pub(super) fn decode_resume_conversation_response(
        &self,
        mut output: TransportOutput,
        engine: &AngelEngine,
        conversation_id: &ConversationId,
        hydrate: &bool,
        result: &Value,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
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
        Ok(output)
    }

    pub(super) fn decode_discover_conversations_response(
        &self,
        mut output: TransportOutput,
        engine: &AngelEngine,
        id: &JsonRpcRequestId,
        params: &angel_engine::DiscoverConversationsParams,
        result: &Value,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
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
        Ok(output)
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
