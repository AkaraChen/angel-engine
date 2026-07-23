use super::helpers::*;
use super::*;

mod errors;
mod initialize;
mod session;
mod settings;

use self::errors::acp_rpc_error_event;

impl AcpAdapter {
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
            PendingRequest::StartConversation { conversation_id } => {
                output = self.decode_start_conversation_response(
                    output,
                    engine,
                    conversation_id,
                    result,
                )?;
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
            PendingRequest::ForkConversation { conversation_id } => {
                output = self.decode_fork_conversation_response(
                    output,
                    engine,
                    conversation_id,
                    result,
                )?;
            }
            PendingRequest::StartTurn {
                conversation_id,
                turn_id,
            } => {
                let reason = result
                    .get("stopReason")
                    .and_then(Value::as_str)
                    .map(acp_stop_reason)
                    .unwrap_or(AcpStopReason::EndTurn);
                output = output
                    .event(self.stop_reason_event(conversation_id.clone(), turn_id.clone(), reason))
                    .log(
                        TransportLogKind::State,
                        format!("prompt completed: {reason:?}"),
                    );
            }
            PendingRequest::CancelTurn { .. } => {
                output = output.log(TransportLogKind::State, "cancel accepted");
            }
            PendingRequest::Authenticate => {
                output = self.decode_authenticate_response(output, result)?;
            }
            PendingRequest::ResolveElicitation { .. } => {
                output = output.log(TransportLogKind::State, "permission response accepted");
            }
            PendingRequest::UpdateContext {
                conversation_id,
                patch,
            } => {
                output = self.decode_update_context_response(
                    output,
                    id,
                    conversation_id,
                    patch,
                    result,
                )?;
            }
            PendingRequest::DiscoverConversations { params } => {
                output = self
                    .decode_discover_conversations_response(output, engine, id, params, result)?;
            }
            PendingRequest::SteerTurn { .. }
            | PendingRequest::ReadConversation { .. }
            | PendingRequest::HistoryMutation { .. }
            | PendingRequest::RunShellCommand { .. }
            | PendingRequest::RefreshSkills { .. }
            | PendingRequest::GoalMutation { .. } => {
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
            format!("ACP error {code}: {message}"),
        );
        if let Some(id) = id {
            output.completed_requests.push(id.clone());
            if let Some(event) = engine
                .pending
                .requests
                .get(id)
                .and_then(|pending| acp_rpc_error_event(pending, code, message))
            {
                output.events.push(event);
            }
        }
        Ok(output)
    }
}

#[cfg(test)]
mod tests;
