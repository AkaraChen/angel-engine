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
        }
    }
}
