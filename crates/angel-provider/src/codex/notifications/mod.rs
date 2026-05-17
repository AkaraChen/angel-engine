use super::actions::{action_id_from_item, append_completed_implicit_live_actions};
use super::ids::*;
use super::protocol_helpers::DeltaKind;
use super::summaries::*;
use super::wire::CodexThreadItemKind;
use super::wire::constants::ServerNotificationMethod as CodexServerNotificationMethod;
use super::wire::schema as codex_schema;
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
        let notification_method = method.parse::<CodexServerNotificationMethod>().ok();
        let mut output = match notification_method {
            Some(CodexServerNotificationMethod::ThreadStatusChanged) => {
                match codex_notification_params(params) {
                    Some(notification) => self.decode_thread_status(engine, &notification),
                    None => unknown_notification(method, params),
                }
            }
            Some(CodexServerNotificationMethod::TurnStarted) => {
                self.decode_turn_started(engine, params)
            }
            Some(CodexServerNotificationMethod::TurnCompleted) => {
                self.decode_turn_completed(engine, params)
            }
            Some(CodexServerNotificationMethod::ItemAgentMessageDelta) => {
                self.decode_text_delta(engine, params, DeltaKind::Assistant)
            }
            Some(
                CodexServerNotificationMethod::ItemReasoningTextDelta
                | CodexServerNotificationMethod::ItemReasoningSummaryTextDelta,
            ) => self.decode_text_delta(engine, params, DeltaKind::Reasoning),
            Some(CodexServerNotificationMethod::ItemReasoningSummaryPartAdded) => {
                Ok(TransportOutput::default())
            }
            Some(CodexServerNotificationMethod::ItemPlanDelta) => {
                self.decode_plan_delta(engine, params)
            }
            Some(CodexServerNotificationMethod::TurnPlanUpdated) => {
                self.decode_plan(engine, params)
            }
            Some(CodexServerNotificationMethod::ItemStarted) => {
                self.decode_item(engine, params, false)
            }
            Some(
                CodexServerNotificationMethod::ItemCompleted
                | CodexServerNotificationMethod::RawResponseItemCompleted,
            ) => self.decode_item(engine, params, true),
            Some(CodexServerNotificationMethod::ItemCommandExecutionOutputDelta) => {
                self.decode_action_output(engine, params, ActionKind::Command, true)
            }
            Some(CodexServerNotificationMethod::ItemFileChangeOutputDelta) => {
                self.decode_action_output(engine, params, ActionKind::FileChange, false)
            }
            Some(CodexServerNotificationMethod::ItemFileChangePatchUpdated) => {
                self.decode_file_patch(engine, params)
            }
            Some(CodexServerNotificationMethod::ServerRequestResolved) => {
                self.decode_server_request_resolved(engine, params)
            }
            Some(CodexServerNotificationMethod::Error) => Ok(TransportOutput::default().log(
                TransportLogKind::Error,
                params
                    .get("message")
                    .and_then(Value::as_str)
                    .unwrap_or("Codex error notification"),
            )),
            Some(CodexServerNotificationMethod::Warning) => {
                match codex_notification_params::<codex_schema::WarningNotification>(params) {
                    Some(notification) => Ok(TransportOutput::default()
                        .log(TransportLogKind::Warning, &notification.message)),
                    None => unknown_notification(method, params),
                }
            }
            Some(CodexServerNotificationMethod::GuardianWarning) => {
                match codex_notification_params::<codex_schema::GuardianWarningNotification>(params)
                {
                    Some(notification) => Ok(TransportOutput::default()
                        .log(TransportLogKind::Warning, &notification.message)),
                    None => unknown_notification(method, params),
                }
            }
            Some(CodexServerNotificationMethod::ConfigWarning) => {
                match codex_notification_params::<codex_schema::ConfigWarningNotification>(params) {
                    Some(notification) => Ok(TransportOutput::default()
                        .log(TransportLogKind::Warning, &notification.summary)),
                    None => unknown_notification(method, params),
                }
            }
            Some(CodexServerNotificationMethod::RemoteControlStatusChanged) => {
                match codex_notification_params::<
                    codex_schema::RemoteControlStatusChangedNotification,
                >(params)
                {
                    Some(notification) => Ok(TransportOutput::default().log(
                        TransportLogKind::State,
                        format!("remote control {}", notification.status),
                    )),
                    None => unknown_notification(method, params),
                }
            }
            Some(_) | None => unknown_notification(method, params),
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
    let is_item_notification = matches!(
        method.parse::<CodexServerNotificationMethod>().ok(),
        Some(
            CodexServerNotificationMethod::ItemStarted
                | CodexServerNotificationMethod::ItemCompleted
                | CodexServerNotificationMethod::RawResponseItemCompleted
        )
    );
    if !is_item_notification {
        return None;
    }
    let item = params.get("item")?;
    if !matches!(
        item.get("type").and_then(Value::as_str),
        Some(value)
            if value == CodexThreadItemKind::WebSearch.as_str()
                || value == CodexThreadItemKind::ImageGeneration.as_str()
                || value == "web_search_call"
                || value == "image_generation_call"
    ) {
        return None;
    }
    action_id_from_item(item).map(|id| ActionId::new(id.to_string()))
}

fn codex_notification_params<T: serde::de::DeserializeOwned>(params: &Value) -> Option<T> {
    serde_json::from_value(params.clone()).ok()
}

fn unknown_notification(
    method: &str,
    params: &Value,
) -> Result<TransportOutput, angel_engine::EngineError> {
    Ok(TransportOutput::default().log(
        TransportLogKind::Receive,
        format!("{} {}", method, summarize_inbound(method, params)),
    ))
}
