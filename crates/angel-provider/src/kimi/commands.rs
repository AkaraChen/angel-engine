use angel_engine::event::EngineEvent;
use angel_engine::transport::{
    JsonRpcMessage, TransportLogKind, TransportOptions, TransportOutput,
};
use angel_engine::{AngelEngine, EngineError, ProtocolEffect};
use serde_json::json;

use crate::acp::permission_modes::{
    acp_permission_mode_session_id, permission_mode_effect, permission_mode_wire_id,
};

use super::KimiAdapter;
use super::state::{
    KimiPermissionMode, conversation_has_plan_mode, conversation_has_yolo_permission_mode,
    current_kimi_permission_mode,
};

impl KimiAdapter {
    pub(super) fn encode_kimi_mode_effect(
        &self,
        engine: &AngelEngine,
        effect: &ProtocolEffect,
        _options: &TransportOptions,
    ) -> Result<Option<TransportOutput>, EngineError> {
        let Some(mode_id) = effect
            .payload
            .fields
            .get("modeId")
            .or_else(|| effect.payload.fields.get("mode"))
            .map(String::as_str)
        else {
            return Ok(None);
        };
        if !matches!(mode_id, "plan" | "default") || !conversation_has_plan_mode(engine, effect) {
            return Ok(None);
        }

        let mut output = TransportOutput::default()
            .event(EngineEvent::SessionModeChanged {
                conversation_id: effect.conversation_id.clone().ok_or_else(|| {
                    EngineError::InvalidCommand {
                        message: "missing conversation id for Kimi mode update".to_string(),
                    }
                })?,
                mode_id: mode_id.to_string(),
            })
            .log(
                TransportLogKind::State,
                format!("Kimi plan mode projected locally: {mode_id}"),
            )
            .log(
                TransportLogKind::Warning,
                "Kimi native /plan command is not sent because its ExitPlanMode approval flow is not exposed through ACP",
            );
        if let Some(request_id) = &effect.request_id {
            output.completed_requests.push(request_id.clone());
        }
        output.logs.push(angel_engine::TransportLog::new(
            TransportLogKind::State,
            "Use normal assistant text as plan content for Kimi plan-mode QA",
        ));
        Ok(Some(output))
    }

    pub(super) fn encode_kimi_permission_mode_effect(
        &self,
        engine: &AngelEngine,
        effect: &ProtocolEffect,
    ) -> Result<Option<TransportOutput>, EngineError> {
        let Some(mode) = permission_mode_effect::<KimiPermissionMode>(effect, "Kimi")? else {
            return Ok(None);
        };
        if !conversation_has_yolo_permission_mode(engine, effect) {
            return Ok(None);
        }

        let mode_id = permission_mode_wire_id(mode);
        if current_kimi_permission_mode(engine, effect)?.is_some_and(|current| current == mode) {
            let mut output = TransportOutput::default().log(
                TransportLogKind::State,
                format!("Kimi permission mode already {mode_id}; no /yolo toggle sent"),
            );
            if let Some(request_id) = &effect.request_id {
                output.completed_requests.push(request_id.clone());
            }
            return Ok(Some(output));
        }

        let session_id = acp_permission_mode_session_id(engine, effect, "Kimi")?;
        let conversation_id = effect
            .conversation_id
            .clone()
            .expect("permission mode session id resolver validated conversation id");
        let method = "session/prompt";
        let params = json!({
            "sessionId": session_id,
            "prompt": [{"type": "text", "text": "/yolo"}],
        });
        let mut output = TransportOutput::default()
            .event(EngineEvent::SessionPermissionModeChanged {
                conversation_id,
                mode_id: mode_id.clone(),
            })
            .log(
                TransportLogKind::Send,
                format!("Kimi permission mode set via /yolo toggle: {mode_id}"),
            );
        if let Some(request_id) = &effect.request_id {
            output.messages.push(JsonRpcMessage::request(
                request_id.clone(),
                method.to_string(),
                params,
            ));
        } else {
            output
                .messages
                .push(JsonRpcMessage::notification(method.to_string(), params));
        }
        Ok(Some(output))
    }
}
