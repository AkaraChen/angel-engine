use super::protocol_helpers::*;
use super::*;

mod errors;
mod history;
mod initialize;
mod session;
mod settings;
mod skills;

use self::errors::codex_rpc_error_event;

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
                output = self.decode_initialize_response(output, result)?;
            }
            PendingRequest::StartConversation { conversation_id }
            | PendingRequest::ForkConversation { conversation_id } => {
                output = self.decode_start_conversation_response(
                    output,
                    engine,
                    conversation_id,
                    result,
                )?;
            }
            PendingRequest::ReadConversation { conversation_id } => {
                output = self.decode_read_conversation_response(output, conversation_id, result)?;
            }
            PendingRequest::ResumeConversation {
                conversation_id,
                hydrate,
            } => {
                output = self.decode_resume_conversation_response(
                    output,
                    engine,
                    conversation_id,
                    hydrate,
                    result,
                )?;
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
                output = self
                    .decode_discover_conversations_response(output, engine, id, params, result)?;
            }
            PendingRequest::RefreshSkills { conversation_id } => {
                output =
                    self.decode_refresh_skills_response(output, id, conversation_id, result)?;
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

#[cfg(test)]
mod tests;
