use angel_engine::{ContentDelta, EngineEvent, RuntimeState};

use crate::error::{ClientError, ClientResult};
use crate::snapshot::{
    ActionOutputSnapshot, ActionSnapshot, ContentChunk, DisplayPlanSnapshot, ElicitationSnapshot,
    TurnSnapshot, conversation_snapshot, runtime_auth_methods,
};

use super::{ClientEvent, ClientLog, ClientStreamDelta};

pub(crate) fn events_from_engine_event(
    engine: &angel_engine::AngelEngine,
    event: &EngineEvent,
) -> ClientResult<Vec<ClientEvent>> {
    Ok(match event {
        EngineEvent::RuntimeNegotiated { .. } => match &engine.runtime {
            RuntimeState::Available { capabilities } => vec![ClientEvent::RuntimeReady {
                name: capabilities.name.clone(),
                version: capabilities.version.clone(),
            }],
            _ => Vec::new(),
        },
        EngineEvent::RuntimeAuthRequired { .. } => vec![ClientEvent::RuntimeAuthRequired {
            methods: runtime_auth_methods(&engine.runtime),
        }],
        EngineEvent::RuntimeFaulted { error } => vec![ClientEvent::RuntimeFaulted {
            code: error.code.clone(),
            message: error.message.clone(),
        }],
        EngineEvent::ConversationDiscovered { id, .. } => {
            let conversation = engine
                .conversations
                .get(id)
                .map(conversation_snapshot)
                .ok_or_else(|| missing_projection("discovered conversation snapshot"))?;
            vec![ClientEvent::ConversationDiscovered { conversation }]
        }
        EngineEvent::ConversationReady { id, .. } => {
            let conversation = engine
                .conversations
                .get(id)
                .map(conversation_snapshot)
                .ok_or_else(|| missing_projection("ready conversation snapshot"))?;
            vec![ClientEvent::ConversationReady { conversation }]
        }
        EngineEvent::ConversationProvisionStarted { id, .. }
        | EngineEvent::ConversationHydrationStarted { id, .. }
        | EngineEvent::ConversationStatusChanged { id, .. }
        | EngineEvent::ConversationClosed { id } => vec![ClientEvent::ConversationUpdated {
            conversation_id: id.to_string(),
        }],
        EngineEvent::AvailableCommandsUpdated {
            conversation_id,
            commands,
        } => vec![ClientEvent::AvailableCommandsUpdated {
            conversation_id: conversation_id.to_string(),
            count: commands.len(),
        }],
        EngineEvent::SessionSkillsUpdated {
            conversation_id,
            skills,
        } => vec![ClientEvent::AvailableSkillsUpdated {
            conversation_id: conversation_id.to_string(),
            count: skills.len(),
        }],
        EngineEvent::SessionConfigOptionsUpdated {
            conversation_id, ..
        }
        | EngineEvent::SessionModesUpdated {
            conversation_id, ..
        }
        | EngineEvent::SessionModeChanged {
            conversation_id, ..
        }
        | EngineEvent::SessionPermissionModesUpdated {
            conversation_id, ..
        }
        | EngineEvent::SessionPermissionModeChanged {
            conversation_id, ..
        }
        | EngineEvent::SessionModelsUpdated {
            conversation_id, ..
        }
        | EngineEvent::ContextUpdated {
            conversation_id, ..
        }
        | EngineEvent::ObserverChanged {
            conversation_id, ..
        } => vec![ClientEvent::ContextUpdated {
            conversation_id: conversation_id.to_string(),
        }],
        EngineEvent::SessionUsageUpdated {
            conversation_id,
            usage,
        } => vec![ClientEvent::SessionUsageUpdated {
            conversation_id: conversation_id.to_string(),
            usage: usage.into(),
        }],
        EngineEvent::ConversationDiscoveryPage { .. } => Vec::new(),
        EngineEvent::TurnStarted {
            conversation_id,
            turn_id,
            ..
        } => vec![ClientEvent::TurnStarted {
            conversation_id: conversation_id.to_string(),
            turn_id: turn_id.to_string(),
        }],
        EngineEvent::TurnSteered {
            conversation_id,
            turn_id,
            ..
        } => vec![ClientEvent::TurnSteered {
            conversation_id: conversation_id.to_string(),
            turn_id: turn_id.to_string(),
        }],
        EngineEvent::AssistantDelta {
            conversation_id,
            turn_id,
            delta,
        } => vec![ClientEvent::AssistantDelta {
            conversation_id: conversation_id.to_string(),
            turn_id: turn_id.to_string(),
            content: content_chunk(delta),
        }],
        EngineEvent::ReasoningDelta {
            conversation_id,
            turn_id,
            delta,
        } => vec![ClientEvent::ReasoningDelta {
            conversation_id: conversation_id.to_string(),
            turn_id: turn_id.to_string(),
            content: content_chunk(delta),
        }],
        EngineEvent::PlanDelta {
            conversation_id,
            turn_id,
            delta,
        } => vec![ClientEvent::PlanDelta {
            conversation_id: conversation_id.to_string(),
            turn_id: turn_id.to_string(),
            content: content_chunk(delta),
        }],
        EngineEvent::PlanUpdated {
            conversation_id,
            turn_id,
            ..
        }
        | EngineEvent::PlanPathUpdated {
            conversation_id,
            turn_id,
            ..
        } => vec![ClientEvent::PlanUpdated {
            conversation_id: conversation_id.to_string(),
            turn_id: turn_id.to_string(),
            plan: plan_snapshot_for_turn(engine, conversation_id, turn_id)
                .ok_or_else(|| missing_projection("plan snapshot"))?,
        }],
        EngineEvent::TodoUpdated {
            conversation_id,
            turn_id,
            ..
        } => vec![ClientEvent::PlanUpdated {
            conversation_id: conversation_id.to_string(),
            turn_id: turn_id.to_string(),
            plan: todo_snapshot_for_turn(engine, conversation_id, turn_id)
                .ok_or_else(|| missing_projection("todo snapshot"))?,
        }],
        EngineEvent::TurnTerminal {
            conversation_id,
            turn_id,
            outcome,
        } => vec![ClientEvent::TurnTerminal {
            conversation_id: conversation_id.to_string(),
            turn_id: turn_id.to_string(),
            outcome: format!("{outcome:?}"),
        }],
        EngineEvent::ActionObserved {
            conversation_id,
            action,
        } => vec![ClientEvent::ActionObserved {
            conversation_id: conversation_id.to_string(),
            action: action.into(),
        }],
        EngineEvent::ActionUpdated {
            conversation_id,
            action_id,
            ..
        } => {
            let action = engine
                .conversations
                .get(conversation_id)
                .and_then(|conversation| conversation.actions.get(action_id))
                .map(ActionSnapshot::from)
                .ok_or_else(|| missing_projection("updated action snapshot"))?;
            vec![ClientEvent::ActionUpdated {
                conversation_id: conversation_id.to_string(),
                action,
            }]
        }
        EngineEvent::ElicitationOpened {
            conversation_id,
            elicitation,
        } => vec![ClientEvent::ElicitationOpened {
            conversation_id: conversation_id.to_string(),
            elicitation: elicitation.into(),
        }],
        EngineEvent::ElicitationResolving {
            conversation_id,
            elicitation_id,
        }
        | EngineEvent::ElicitationResolved {
            conversation_id,
            elicitation_id,
            ..
        }
        | EngineEvent::ElicitationCancelled {
            conversation_id,
            elicitation_id,
        } => {
            let elicitation = engine
                .conversations
                .get(conversation_id)
                .and_then(|conversation| conversation.elicitations.get(elicitation_id))
                .map(ElicitationSnapshot::from)
                .ok_or_else(|| missing_projection("updated elicitation snapshot"))?;
            vec![ClientEvent::ElicitationUpdated {
                conversation_id: conversation_id.to_string(),
                elicitation,
            }]
        }
        EngineEvent::HistoryMutationStarted {
            conversation_id, ..
        }
        | EngineEvent::HistoryMutationFinished {
            conversation_id, ..
        }
        | EngineEvent::HistoryReplayChunk {
            conversation_id, ..
        } => vec![ClientEvent::HistoryUpdated {
            conversation_id: conversation_id.to_string(),
        }],
    })
}

pub(crate) fn stream_deltas_from_engine_event(
    engine: &angel_engine::AngelEngine,
    event: &EngineEvent,
) -> ClientResult<Vec<ClientStreamDelta>> {
    Ok(match event {
        EngineEvent::AssistantDelta {
            conversation_id,
            turn_id,
            delta,
        } => vec![ClientStreamDelta::AssistantDelta {
            conversation_id: conversation_id.to_string(),
            turn_id: turn_id.to_string(),
            content: content_chunk(delta),
        }],
        EngineEvent::ReasoningDelta {
            conversation_id,
            turn_id,
            delta,
        } => vec![ClientStreamDelta::ReasoningDelta {
            conversation_id: conversation_id.to_string(),
            turn_id: turn_id.to_string(),
            content: content_chunk(delta),
        }],
        EngineEvent::PlanDelta {
            conversation_id,
            turn_id,
            delta,
        } => vec![ClientStreamDelta::PlanDelta {
            conversation_id: conversation_id.to_string(),
            turn_id: turn_id.to_string(),
            content: content_chunk(delta),
        }],
        EngineEvent::ActionObserved {
            conversation_id,
            action,
        } => action
            .output
            .chunks
            .iter()
            .map(|delta| ClientStreamDelta::ActionOutputDelta {
                conversation_id: conversation_id.to_string(),
                turn_id: action.turn_id.to_string(),
                action_id: action.id.to_string(),
                content: ActionOutputSnapshot::from(delta),
            })
            .collect(),
        EngineEvent::ActionUpdated {
            conversation_id,
            action_id,
            patch,
        } => {
            let Some(delta) = patch.output_delta.as_ref() else {
                return Ok(Vec::new());
            };
            let action = engine
                .conversations
                .get(conversation_id)
                .and_then(|conversation| conversation.actions.get(action_id))
                .ok_or_else(|| missing_projection("action output delta snapshot"))?;
            vec![ClientStreamDelta::ActionOutputDelta {
                conversation_id: conversation_id.to_string(),
                turn_id: action.turn_id.to_string(),
                action_id: action_id.to_string(),
                content: ActionOutputSnapshot::from(delta),
            }]
        }
        _ => Vec::new(),
    })
}

pub(crate) fn log_event(log: ClientLog) -> ClientEvent {
    ClientEvent::Log { log }
}

fn missing_projection(message: &str) -> ClientError {
    ClientError::InvalidInput {
        message: format!("engine event projection is missing {message}"),
    }
}

fn plan_snapshot_for_turn(
    engine: &angel_engine::AngelEngine,
    conversation_id: &angel_engine::ConversationId,
    turn_id: &angel_engine::TurnId,
) -> Option<DisplayPlanSnapshot> {
    let turn = engine
        .conversations
        .get(conversation_id)?
        .turns
        .get(turn_id)?;
    DisplayPlanSnapshot::from_turn(&TurnSnapshot::from(turn))
}

fn todo_snapshot_for_turn(
    engine: &angel_engine::AngelEngine,
    conversation_id: &angel_engine::ConversationId,
    turn_id: &angel_engine::TurnId,
) -> Option<DisplayPlanSnapshot> {
    let turn = engine
        .conversations
        .get(conversation_id)?
        .turns
        .get(turn_id)?;
    turn.todo.as_ref()?;
    Some(DisplayPlanSnapshot::todo_from_turn(&TurnSnapshot::from(
        turn,
    )))
}

fn content_chunk(delta: &ContentDelta) -> ContentChunk {
    delta.into()
}
