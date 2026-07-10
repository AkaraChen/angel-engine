use angel_engine::event::EngineEvent;
use angel_engine::transport::{JsonRpcMessage, TransportLogKind, TransportOutput};
use angel_engine::{AngelEngine, EngineError};

use super::KimiAdapter;
use super::plan::kimi_plan_file_event;
use super::state::{
    kimi_filter_plan_command, kimi_filter_yolo_command, kimi_permission_mode_state,
    kimi_plan_mode_state, needs_kimi_permission_modes, needs_kimi_plan_modes,
};

impl KimiAdapter {
    pub(super) fn normalize_kimi_output(
        &self,
        engine: &AngelEngine,
        message: &JsonRpcMessage,
        mut output: TransportOutput,
    ) -> Result<TransportOutput, EngineError> {
        self.append_kimi_local_hydration(engine, message, &mut output)?;

        let mut plan_command_conversations = Vec::new();
        let mut yolo_command_conversations = Vec::new();
        let mut filtered_plan_command = false;
        let mut filtered_yolo_command = false;
        output.events = output
            .events
            .into_iter()
            .map(|event| match event {
                EngineEvent::AvailableCommandsUpdated {
                    conversation_id,
                    commands,
                } => {
                    let (commands, had_plan_command) = kimi_filter_plan_command(commands);
                    let (commands, had_yolo_command) = kimi_filter_yolo_command(commands);
                    if had_plan_command {
                        plan_command_conversations.push(conversation_id.clone());
                        filtered_plan_command = true;
                    }
                    if had_yolo_command {
                        yolo_command_conversations.push(conversation_id.clone());
                        filtered_yolo_command = true;
                    }
                    EngineEvent::AvailableCommandsUpdated {
                        conversation_id,
                        commands,
                    }
                }
                event => event,
            })
            .collect();

        let mode_updates = output
            .events
            .iter()
            .filter_map(|event| {
                let EngineEvent::AvailableCommandsUpdated {
                    conversation_id, ..
                } = event
                else {
                    return None;
                };
                if plan_command_conversations
                    .iter()
                    .any(|id| id == conversation_id)
                    && needs_kimi_plan_modes(engine, &output.events, conversation_id)
                {
                    Some(EngineEvent::SessionModesUpdated {
                        conversation_id: conversation_id.clone(),
                        modes: kimi_plan_mode_state(engine, conversation_id),
                    })
                } else {
                    None
                }
            })
            .collect::<Vec<_>>();
        let permission_mode_updates = output
            .events
            .iter()
            .filter_map(|event| {
                let EngineEvent::AvailableCommandsUpdated {
                    conversation_id, ..
                } = event
                else {
                    return None;
                };
                if yolo_command_conversations
                    .iter()
                    .any(|id| id == conversation_id)
                    && needs_kimi_permission_modes(engine, &output.events, conversation_id)
                {
                    Some(EngineEvent::SessionPermissionModesUpdated {
                        conversation_id: conversation_id.clone(),
                        modes: kimi_permission_mode_state(
                            engine,
                            conversation_id,
                            self.startup_permission_mode,
                        ),
                    })
                } else {
                    None
                }
            })
            .collect::<Vec<_>>();

        if !mode_updates.is_empty() {
            output.events.extend(mode_updates);
            output.logs.push(angel_engine::TransportLog::new(
                TransportLogKind::State,
                "Kimi /plan command exposed as plan/default modes",
            ));
        }
        if !permission_mode_updates.is_empty() {
            output.events.extend(permission_mode_updates);
            output.logs.push(angel_engine::TransportLog::new(
                TransportLogKind::State,
                "Kimi /yolo command exposed as default/yolo permission modes",
            ));
        }
        if filtered_plan_command {
            output.logs.push(angel_engine::TransportLog::new(
                TransportLogKind::Warning,
                "Kimi /plan command hidden because its ExitPlanMode approval flow is not exposed through ACP; use /mode plan instead",
            ));
        }
        if filtered_yolo_command {
            output.logs.push(angel_engine::TransportLog::new(
                TransportLogKind::Warning,
                "Kimi /yolo command hidden because it is exposed as permission mode",
            ));
        }
        let plan_file_updates = output
            .events
            .iter()
            .filter_map(|event| kimi_plan_file_event(engine, event))
            .flatten()
            .collect::<Vec<_>>();
        if !plan_file_updates.is_empty() {
            output.events.extend(plan_file_updates);
            output.logs.push(angel_engine::TransportLog::new(
                TransportLogKind::State,
                "Kimi plan file write projected as plan update",
            ));
        }
        Ok(output)
    }
}
