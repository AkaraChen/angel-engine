use super::actions::append_completed_implicit_live_actions;
use super::ids::*;
use super::protocol_helpers::DeltaKind;
use super::summaries::*;
use super::*;

mod action;
mod content;
mod item;
mod server_request;
mod thread;
mod turn;

impl CodexAdapter {
    pub(super) fn decode_notification(
        &self,
        engine: &AngelEngine,
        method: &str,
        params: &Value,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
        let mut output = match method {
            "thread/status/changed" => self.decode_thread_status(engine, params),
            "turn/started" => self.decode_turn_started(engine, params),
            "turn/completed" => self.decode_turn_completed(engine, params),
            "item/agentMessage/delta" => {
                self.decode_text_delta(engine, params, DeltaKind::Assistant)
            }
            "item/reasoning/textDelta" | "item/reasoning/summaryTextDelta" => {
                self.decode_text_delta(engine, params, DeltaKind::Reasoning)
            }
            "item/reasoning/summaryPartAdded" => Ok(TransportOutput::default()),
            "item/plan/delta" => self.decode_plan_delta(engine, params),
            "turn/plan/updated" => self.decode_plan(engine, params),
            "item/started" => self.decode_item(engine, params, false),
            "item/completed" => self.decode_item(engine, params, true),
            "rawResponseItem/completed" => self.decode_item(engine, params, true),
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
        }?;
        self.normalize_implicit_live_action_completion(engine, method, params, &mut output);
        Ok(output)
    }

    fn normalize_implicit_live_action_completion(
        &self,
        engine: &AngelEngine,
        method: &str,
        params: &Value,
        output: &mut TransportOutput,
    ) {
        let Some((conversation_id, remote_turn_id)) = notification_turn(engine, params) else {
            return;
        };
        let Some(turn_id) = local_turn_id(engine, &conversation_id, remote_turn_id) else {
            return;
        };
        let current_action = current_implicit_live_action_id(method, params);
        let mut action_output = TransportOutput::default();
        // Codex app-server can emit some built-in live items as started items
        // without a live terminal item. The next turn-scoped notification means
        // control has moved on, so close older items here at the adapter
        // boundary instead of leaking Codex-specific behavior downstream.
        append_completed_implicit_live_actions(
            engine,
            &conversation_id,
            &turn_id,
            current_action.as_ref(),
            &mut action_output,
        );
        if !action_output.events.is_empty() {
            output.events.splice(0..0, action_output.events);
        }
    }
}

fn current_implicit_live_action_id(method: &str, params: &Value) -> Option<ActionId> {
    if !matches!(
        method,
        "item/started" | "item/completed" | "rawResponseItem/completed"
    ) {
        return None;
    }
    let item = params.get("item")?;
    if !matches!(
        item.get("type").and_then(Value::as_str),
        Some("webSearch" | "imageGeneration")
    ) {
        return None;
    }
    item.get("id")
        .and_then(Value::as_str)
        .map(|id| ActionId::new(id.to_string()))
}
