use super::*;

impl AcpAdapter {
    pub(super) fn decode_start_conversation_response(
        &self,
        mut output: TransportOutput,
        engine: &AngelEngine,
        conversation_id: &ConversationId,
        result: &Value,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
        let session_id = result
            .get("sessionId")
            .and_then(Value::as_str)
            .ok_or_else(|| angel_engine::EngineError::InvalidCommand {
                message: "ACP session response missing sessionId".to_string(),
            })?;
        append_session_ready_events(
            &mut output,
            engine,
            conversation_id,
            Some(session_id.to_string()),
            result,
        );
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
        append_session_ready_events(
            &mut output,
            engine,
            conversation_id,
            result
                .get("sessionId")
                .and_then(Value::as_str)
                .map(str::to_string),
            result,
        );
        output = output.log(
            TransportLogKind::State,
            if *hydrate {
                "session load complete"
            } else {
                "session resume complete"
            },
        );
        Ok(output)
    }

    pub(super) fn decode_fork_conversation_response(
        &self,
        mut output: TransportOutput,
        engine: &AngelEngine,
        conversation_id: &ConversationId,
        result: &Value,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
        let session_id = result
            .get("sessionId")
            .and_then(Value::as_str)
            .ok_or_else(|| angel_engine::EngineError::InvalidCommand {
                message: "ACP fork response missing sessionId".to_string(),
            })?;
        append_session_ready_events(
            &mut output,
            engine,
            conversation_id,
            Some(session_id.to_string()),
            result,
        );
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
        for session in result
            .get("sessions")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            let Some(session_id) = session.get("sessionId").and_then(Value::as_str) else {
                output = output.log(
                    TransportLogKind::Warning,
                    "ignoring ACP session/list entry without sessionId",
                );
                continue;
            };
            let remote = RemoteConversationId::Known(session_id.to_string());
            output = output.event(EngineEvent::ConversationDiscovered {
                id: discovered_conversation_id(
                    engine,
                    &remote,
                    format!("acp-session-{session_id}"),
                ),
                remote,
                context: acp_session_info_context(session),
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

fn append_session_ready_events(
    output: &mut TransportOutput,
    engine: &AngelEngine,
    conversation_id: &ConversationId,
    session_id: Option<String>,
    result: &Value,
) {
    output.events.push(EngineEvent::ConversationReady {
        id: conversation_id.clone(),
        remote: session_id.clone().map(RemoteConversationId::Known),
        context: ContextPatch::empty(),
        capabilities: Some(engine.default_capabilities.clone()),
    });
    let session_label = session_id.unwrap_or_else(|| {
        engine
            .conversations
            .get(conversation_id)
            .and_then(|conversation| conversation.remote.as_protocol_id())
            .map(str::to_string)
            .unwrap_or_else(|| conversation_id.to_string())
    });
    output.logs.push(angel_engine::TransportLog::new(
        TransportLogKind::State,
        format!("session {session_label} ready"),
    ));
    super::settings::append_session_settings_events(output, conversation_id, result);
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
