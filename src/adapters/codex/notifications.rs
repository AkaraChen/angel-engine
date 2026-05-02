use super::actions::*;
use super::ids::*;
use super::protocol_helpers::*;
use super::summaries::*;
use super::*;

impl CodexAdapter {
    pub(super) fn decode_notification(
        &self,
        engine: &AngelEngine,
        method: &str,
        params: &Value,
    ) -> Result<TransportOutput, crate::EngineError> {
        match method {
            "thread/status/changed" => self.decode_thread_status(engine, params),
            "turn/started" => self.decode_turn_started(engine, params),
            "turn/completed" => self.decode_turn_completed(engine, params),
            "item/agentMessage/delta" => {
                self.decode_text_delta(engine, params, DeltaKind::Assistant)
            }
            "item/reasoning/textDelta" | "item/reasoning/summaryTextDelta" => {
                self.decode_text_delta(engine, params, DeltaKind::Reasoning)
            }
            "turn/plan/updated" => self.decode_plan(engine, params),
            "item/started" => self.decode_item(engine, params, false),
            "item/completed" => self.decode_item(engine, params, true),
            "item/commandExecution/outputDelta" => {
                self.decode_action_output(engine, params, ActionKind::Command, true)
            }
            "item/fileChange/outputDelta" => {
                self.decode_action_output(engine, params, ActionKind::FileChange, false)
            }
            "item/fileChange/patchUpdated" => self.decode_file_patch(engine, params),
            "serverRequest/resolved" => self.decode_server_request_resolved(engine, params),
            "error" => Ok(TransportOutput::default().log(
                TransportLogKind::Error,
                params
                    .get("message")
                    .and_then(Value::as_str)
                    .unwrap_or("Codex error notification"),
            )),
            "warning" | "guardianWarning" | "configWarning" => Ok(TransportOutput::default().log(
                TransportLogKind::Warning,
                params
                    .get("message")
                    .and_then(Value::as_str)
                    .unwrap_or(method),
            )),
            "remoteControl/status/changed" => Ok(TransportOutput::default().log(
                TransportLogKind::State,
                format!(
                    "remote control {}",
                    params
                        .get("status")
                        .and_then(Value::as_str)
                        .unwrap_or("updated")
                ),
            )),
            _ => Ok(TransportOutput::default().log(
                TransportLogKind::Receive,
                format!("{} {}", method, summarize_inbound(method, params)),
            )),
        }
    }

    fn decode_thread_status(
        &self,
        engine: &AngelEngine,
        params: &Value,
    ) -> Result<TransportOutput, crate::EngineError> {
        let Some(thread_id) = params.get("threadId").and_then(Value::as_str) else {
            return Ok(TransportOutput::default());
        };
        let Some(conversation_id) = find_codex_conversation(engine, thread_id) else {
            return Ok(TransportOutput::default().log(
                TransportLogKind::Receive,
                format!("status for unknown thread {thread_id}"),
            ));
        };
        let status = params
            .get("status")
            .and_then(|status| status.get("type"))
            .and_then(Value::as_str)
            .unwrap_or("idle");
        let codex_status = match status {
            "notLoaded" => CodexThreadStatus::NotLoaded,
            "active" => {
                let flags = params
                    .get("status")
                    .and_then(|status| status.get("activeFlags"))
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                CodexThreadStatus::Active {
                    waiting_on_approval: flags
                        .iter()
                        .any(|flag| flag.as_str() == Some("waitingOnApproval")),
                    waiting_on_user_input: flags
                        .iter()
                        .any(|flag| flag.as_str() == Some("waitingOnUserInput")),
                }
            }
            "systemError" => CodexThreadStatus::SystemError,
            _ => CodexThreadStatus::Idle,
        };
        Ok(TransportOutput::default()
            .event(self.thread_status_event(conversation_id, codex_status))
            .log(
                TransportLogKind::State,
                format!("thread {thread_id} {status}"),
            ))
    }

    fn decode_turn_started(
        &self,
        engine: &AngelEngine,
        params: &Value,
    ) -> Result<TransportOutput, crate::EngineError> {
        let Some((conversation_id, remote_turn_id)) = notification_turn(engine, params) else {
            return Ok(TransportOutput::default());
        };
        let (turn_id, event) = local_turn_started_event(engine, &conversation_id, remote_turn_id);
        let mut output = TransportOutput::default().event(event).log(
            TransportLogKind::State,
            format!("turn {remote_turn_id} started"),
        );
        if let Some(turn) = params.get("turn")
            && turn.get("status").and_then(Value::as_str) == Some("inProgress")
        {
            output.logs.push(crate::TransportLog::new(
                TransportLogKind::State,
                format!("tracking local {turn_id}"),
            ));
        }
        Ok(output)
    }

    fn decode_turn_completed(
        &self,
        engine: &AngelEngine,
        params: &Value,
    ) -> Result<TransportOutput, crate::EngineError> {
        let Some((conversation_id, remote_turn_id)) = notification_turn(engine, params) else {
            return Ok(TransportOutput::default());
        };
        let (turn_id, maybe_start) =
            ensure_local_turn_event(engine, &conversation_id, remote_turn_id);
        let status = params
            .get("turn")
            .and_then(|turn| turn.get("status"))
            .and_then(Value::as_str)
            .unwrap_or("completed");
        let outcome = CodexAdapter::turn_status_to_outcome(
            match status {
                "interrupted" => CodexTurnStatus::Interrupted,
                "failed" => CodexTurnStatus::Failed,
                "inProgress" => CodexTurnStatus::InProgress,
                _ => CodexTurnStatus::Completed,
            },
            turn_error(params.get("turn")),
        );
        let mut output = TransportOutput::default().log(
            TransportLogKind::State,
            format!("turn {remote_turn_id} {status}"),
        );
        if let Some(event) = maybe_start {
            output.events.push(event);
        }
        output.events.push(EngineEvent::TurnTerminal {
            conversation_id,
            turn_id,
            outcome,
        });
        Ok(output)
    }

    fn decode_text_delta(
        &self,
        engine: &AngelEngine,
        params: &Value,
        kind: DeltaKind,
    ) -> Result<TransportOutput, crate::EngineError> {
        let Some((conversation_id, remote_turn_id)) = notification_turn(engine, params) else {
            return Ok(TransportOutput::default());
        };
        let delta = params
            .get("delta")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let (turn_id, maybe_start) =
            ensure_local_turn_event(engine, &conversation_id, remote_turn_id);
        let mut output = TransportOutput::default();
        if let Some(event) = maybe_start {
            output.events.push(event);
        }
        match kind {
            DeltaKind::Assistant => {
                output.events.push(EngineEvent::AssistantDelta {
                    conversation_id,
                    turn_id,
                    delta: ContentDelta::Text(delta.clone()),
                });
                output
                    .logs
                    .push(crate::TransportLog::new(TransportLogKind::Output, delta));
            }
            DeltaKind::Reasoning => {
                output.events.push(EngineEvent::ReasoningDelta {
                    conversation_id,
                    turn_id,
                    delta: ContentDelta::Text(delta.clone()),
                });
                output.logs.push(crate::TransportLog::new(
                    TransportLogKind::Output,
                    format!("[reasoning] {delta}"),
                ));
            }
        }
        Ok(output)
    }

    fn decode_plan(
        &self,
        engine: &AngelEngine,
        params: &Value,
    ) -> Result<TransportOutput, crate::EngineError> {
        let Some((conversation_id, remote_turn_id)) = notification_turn(engine, params) else {
            return Ok(TransportOutput::default());
        };
        let (turn_id, maybe_start) =
            ensure_local_turn_event(engine, &conversation_id, remote_turn_id);
        let entries: Vec<PlanEntry> = params
            .get("plan")
            .and_then(Value::as_array)
            .map(|steps| {
                steps
                    .iter()
                    .map(|step| PlanEntry {
                        content: step
                            .get("step")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_string(),
                        status: match step
                            .get("status")
                            .and_then(Value::as_str)
                            .unwrap_or("pending")
                        {
                            "in_progress" | "inProgress" => PlanEntryStatus::InProgress,
                            "completed" => PlanEntryStatus::Completed,
                            _ => PlanEntryStatus::Pending,
                        },
                    })
                    .collect()
            })
            .unwrap_or_default();
        let mut output = TransportOutput::default().log(
            TransportLogKind::State,
            format!("plan updated ({} steps)", entries.len()),
        );
        if let Some(event) = maybe_start {
            output.events.push(event);
        }
        output.events.push(EngineEvent::PlanUpdated {
            conversation_id,
            turn_id,
            plan: PlanState { entries },
        });
        Ok(output)
    }

    fn decode_item(
        &self,
        engine: &AngelEngine,
        params: &Value,
        completed: bool,
    ) -> Result<TransportOutput, crate::EngineError> {
        let Some((conversation_id, remote_turn_id)) = notification_turn(engine, params) else {
            return Ok(TransportOutput::default());
        };
        let (turn_id, maybe_start) =
            ensure_local_turn_event(engine, &conversation_id, remote_turn_id);
        let Some(item) = params.get("item") else {
            return Ok(TransportOutput::default());
        };
        let Some(action) = action_from_item(item, &turn_id) else {
            return Ok(TransportOutput::default()
                .log(TransportLogKind::State, summarize_item(item, completed)));
        };
        let action_id = action.id.clone();
        let mut output = TransportOutput::default()
            .log(TransportLogKind::State, summarize_item(item, completed));
        if let Some(event) = maybe_start {
            output.events.push(event);
        }
        if !engine
            .conversations
            .get(&conversation_id)
            .map(|conversation| conversation.actions.contains_key(&action_id))
            .unwrap_or(false)
        {
            output.events.push(EngineEvent::ActionObserved {
                conversation_id: conversation_id.clone(),
                action,
            });
        }
        if completed {
            if let Some(phase) = phase_from_item(item) {
                output.events.push(EngineEvent::ActionUpdated {
                    conversation_id,
                    action_id,
                    patch: ActionPatch::phase(phase),
                });
            }
        }
        Ok(output)
    }

    fn decode_action_output(
        &self,
        engine: &AngelEngine,
        params: &Value,
        fallback_kind: ActionKind,
        terminal: bool,
    ) -> Result<TransportOutput, crate::EngineError> {
        let Some((conversation_id, remote_turn_id)) = notification_turn(engine, params) else {
            return Ok(TransportOutput::default());
        };
        let (turn_id, maybe_start) =
            ensure_local_turn_event(engine, &conversation_id, remote_turn_id);
        let item_id = params
            .get("itemId")
            .and_then(Value::as_str)
            .unwrap_or("unknown");
        let action_id = ActionId::new(item_id.to_string());
        let delta = params
            .get("delta")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let mut output = TransportOutput::default().log(TransportLogKind::Output, delta.clone());
        if let Some(event) = maybe_start {
            output.events.push(event);
        }
        if !action_exists(engine, &conversation_id, &action_id) {
            output.events.push(EngineEvent::ActionObserved {
                conversation_id: conversation_id.clone(),
                action: fallback_action(action_id.clone(), turn_id, fallback_kind),
            });
        }
        output.events.push(EngineEvent::ActionUpdated {
            conversation_id,
            action_id,
            patch: ActionPatch {
                phase: None,
                output_delta: Some(if terminal {
                    ActionOutputDelta::Terminal(delta)
                } else {
                    ActionOutputDelta::Text(delta)
                }),
                error: None,
                title: None,
            },
        });
        Ok(output)
    }

    fn decode_file_patch(
        &self,
        engine: &AngelEngine,
        params: &Value,
    ) -> Result<TransportOutput, crate::EngineError> {
        let Some((conversation_id, remote_turn_id)) = notification_turn(engine, params) else {
            return Ok(TransportOutput::default());
        };
        let (turn_id, maybe_start) =
            ensure_local_turn_event(engine, &conversation_id, remote_turn_id);
        let item_id = params
            .get("itemId")
            .and_then(Value::as_str)
            .unwrap_or("unknown");
        let action_id = ActionId::new(item_id.to_string());
        let patch = params
            .get("changes")
            .map(Value::to_string)
            .unwrap_or_else(|| "[]".to_string());
        let mut output =
            TransportOutput::default().log(TransportLogKind::State, "file patch updated");
        if let Some(event) = maybe_start {
            output.events.push(event);
        }
        if !action_exists(engine, &conversation_id, &action_id) {
            output.events.push(EngineEvent::ActionObserved {
                conversation_id: conversation_id.clone(),
                action: fallback_action(action_id.clone(), turn_id, ActionKind::FileChange),
            });
        }
        output.events.push(EngineEvent::ActionUpdated {
            conversation_id,
            action_id,
            patch: ActionPatch {
                phase: None,
                output_delta: Some(ActionOutputDelta::Patch(patch)),
                error: None,
                title: None,
            },
        });
        Ok(output)
    }

    pub(super) fn decode_server_request_resolved(
        &self,
        engine: &AngelEngine,
        params: &Value,
    ) -> Result<TransportOutput, crate::EngineError> {
        let request_id = params
            .get("requestId")
            .or_else(|| params.get("id"))
            .map(|value| match value {
                Value::String(value) => JsonRpcRequestId::new(value.clone()),
                Value::Number(value) => JsonRpcRequestId::new(value.to_string()),
                other => JsonRpcRequestId::new(other.to_string()),
            });
        let Some(request_id) = request_id else {
            return Ok(TransportOutput::default());
        };
        for (conversation_id, conversation) in &engine.conversations {
            for (elicitation_id, elicitation) in &conversation.elicitations {
                if elicitation.remote_request_id == RemoteRequestId::Codex(request_id.clone()) {
                    return Ok(TransportOutput::default()
                        .event(EngineEvent::ElicitationResolved {
                            conversation_id: conversation_id.clone(),
                            elicitation_id: elicitation_id.clone(),
                            decision: crate::ElicitationDecision::Raw("resolved".to_string()),
                        })
                        .log(TransportLogKind::State, "server request resolved"));
                }
            }
        }
        Ok(TransportOutput::default())
    }
}
