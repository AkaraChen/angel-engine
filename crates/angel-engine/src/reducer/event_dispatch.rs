use crate::error::EngineError;
use crate::event::{EngineEvent, TransitionReport, UiEvent};
use crate::state::{ConversationLifecycle, ConversationState, RuntimeState};

use super::AngelEngine;
use super::event_helpers::DeltaKind;

impl AngelEngine {
    pub fn apply_event(&mut self, event: EngineEvent) -> Result<TransitionReport, EngineError> {
        match event {
            EngineEvent::RuntimeNegotiated {
                capabilities,
                conversation_capabilities,
            } => {
                self.runtime = RuntimeState::Available { capabilities };
                if let Some(conversation_capabilities) = conversation_capabilities {
                    self.default_capabilities = conversation_capabilities;
                }
                Ok(TransitionReport::one(UiEvent::RuntimeChanged))
            }
            EngineEvent::RuntimeAuthRequired { methods } => {
                self.runtime = RuntimeState::AwaitingAuth { methods };
                Ok(TransitionReport::one(UiEvent::RuntimeChanged))
            }
            EngineEvent::RuntimeFaulted { error } => {
                self.runtime = RuntimeState::Faulted(error);
                Ok(TransitionReport::one(UiEvent::RuntimeChanged))
            }
            EngineEvent::ConversationDiscovered {
                id,
                remote,
                context,
                capabilities,
            } => {
                if let Some(conversation) = self.conversations.get_mut(&id) {
                    conversation.remote = remote;
                    conversation.capabilities = capabilities;
                    conversation.context.apply_patch(context);
                } else {
                    let mut state = ConversationState::new(
                        id.clone(),
                        remote,
                        ConversationLifecycle::Discovered,
                        capabilities,
                    );
                    state.context.apply_patch(context);
                    self.conversations.insert(id.clone(), state);
                }
                Ok(TransitionReport::one(UiEvent::ConversationChanged(id)))
            }
            EngineEvent::ConversationDiscoveryPage {
                cursor,
                next_cursor,
            } => {
                self.discovery.cursor = cursor;
                self.discovery.next_cursor = next_cursor;
                Ok(TransitionReport::one(UiEvent::DiscoveryChanged))
            }
            EngineEvent::ConversationProvisionStarted {
                id,
                remote,
                op,
                capabilities,
            } => {
                let state = ConversationState::new(
                    id.clone(),
                    remote,
                    ConversationLifecycle::Provisioning { op },
                    capabilities,
                );
                self.conversations.insert(id.clone(), state);
                self.selected = Some(id.clone());
                Ok(TransitionReport::one(UiEvent::ConversationChanged(id)))
            }
            EngineEvent::ConversationHydrationStarted { id, source } => {
                let conversation = self.conversation_mut(&id)?;
                conversation.lifecycle = ConversationLifecycle::Hydrating { source };
                conversation.history.hydrated = false;
                conversation.history.turn_count = 0;
                conversation.history.replay.clear();
                conversation.active_turns.clear();
                conversation.focused_turn = None;
                conversation.turns.clear();
                conversation.actions.clear();
                conversation.elicitations.clear();
                Ok(TransitionReport::one(UiEvent::ConversationChanged(id)))
            }
            EngineEvent::ConversationReady {
                id,
                remote,
                context,
                capabilities,
            } => {
                let conversation = self.conversation_mut(&id)?;
                if let Some(remote) = remote {
                    conversation.remote = remote;
                }
                if let Some(capabilities) = capabilities {
                    conversation.capabilities = capabilities;
                }
                conversation.context.apply_patch(context);
                conversation.lifecycle = ConversationLifecycle::Idle;
                conversation.history.hydrated = true;
                self.selected = Some(id.clone());
                Ok(TransitionReport::one(UiEvent::ConversationChanged(id)))
            }
            EngineEvent::ConversationStatusChanged { id, lifecycle } => {
                let conversation = self.conversation_mut(&id)?;
                conversation.lifecycle = lifecycle;
                Ok(TransitionReport::one(UiEvent::ConversationChanged(id)))
            }
            EngineEvent::AvailableCommandsUpdated {
                conversation_id,
                commands,
            } => {
                let conversation = self.conversation_mut(&conversation_id)?;
                conversation.available_commands = commands;
                Ok(TransitionReport::one(UiEvent::ConversationChanged(
                    conversation_id,
                )))
            }
            EngineEvent::SessionConfigOptionsUpdated {
                conversation_id,
                options,
            } => self.apply_session_config_options_updated(conversation_id, options),
            EngineEvent::SessionModesUpdated {
                conversation_id,
                modes,
            } => self.apply_session_modes_updated(conversation_id, modes),
            EngineEvent::SessionModeChanged {
                conversation_id,
                mode_id,
            } => self.apply_session_mode_changed(conversation_id, mode_id),
            EngineEvent::SessionPermissionModesUpdated {
                conversation_id,
                modes,
            } => self.apply_session_permission_modes_updated(conversation_id, modes),
            EngineEvent::SessionPermissionModeChanged {
                conversation_id,
                mode_id,
            } => self.apply_session_permission_mode_changed(conversation_id, mode_id),
            EngineEvent::SessionModelsUpdated {
                conversation_id,
                models,
            } => self.apply_session_models_updated(conversation_id, models),
            EngineEvent::SessionUsageUpdated {
                conversation_id,
                usage,
            } => {
                let conversation = self.conversation_mut(&conversation_id)?;
                conversation.usage_state = Some(usage);
                Ok(TransitionReport::one(UiEvent::ConversationChanged(
                    conversation_id,
                )))
            }
            EngineEvent::SessionSkillsUpdated {
                conversation_id,
                skills,
            } => {
                let conversation = self.conversation_mut(&conversation_id)?;
                conversation.available_skills = skills;
                Ok(TransitionReport::one(UiEvent::ConversationChanged(
                    conversation_id,
                )))
            }
            EngineEvent::ConversationClosed { id } => {
                let conversation = self.conversation_mut(&id)?;
                conversation.lifecycle = ConversationLifecycle::Closed;
                conversation.active_turns.clear();
                conversation.focused_turn = None;
                conversation.observer.subscribed = false;
                Ok(TransitionReport::one(UiEvent::ConversationChanged(id)))
            }
            EngineEvent::TurnStarted {
                conversation_id,
                turn_id,
                remote,
                input,
            } => self.apply_turn_started(conversation_id, turn_id, remote, input),
            EngineEvent::TurnSteered {
                conversation_id,
                turn_id,
                input,
            } => self.apply_turn_steered(conversation_id, turn_id, input),
            EngineEvent::AssistantDelta {
                conversation_id,
                turn_id,
                delta,
            } => self.apply_content_delta(conversation_id, turn_id, delta, DeltaKind::Assistant),
            EngineEvent::ReasoningDelta {
                conversation_id,
                turn_id,
                delta,
            } => self.apply_content_delta(conversation_id, turn_id, delta, DeltaKind::Reasoning),
            EngineEvent::PlanDelta {
                conversation_id,
                turn_id,
                delta,
            } => self.apply_content_delta(conversation_id, turn_id, delta, DeltaKind::Plan),
            EngineEvent::PlanUpdated {
                conversation_id,
                turn_id,
                plan,
            } => self.apply_plan_updated(conversation_id, turn_id, plan),
            EngineEvent::TodoUpdated {
                conversation_id,
                turn_id,
                todo,
            } => self.apply_todo_updated(conversation_id, turn_id, todo),
            EngineEvent::PlanPathUpdated {
                conversation_id,
                turn_id,
                path,
            } => self.apply_plan_path_updated(conversation_id, turn_id, path),
            EngineEvent::TurnTerminal {
                conversation_id,
                turn_id,
                outcome,
            } => self.apply_turn_terminal(conversation_id, turn_id, outcome),
            EngineEvent::ActionObserved {
                conversation_id,
                action,
            } => self.apply_action_observed(conversation_id, action),
            EngineEvent::ActionUpdated {
                conversation_id,
                action_id,
                patch,
            } => self.apply_action_updated(conversation_id, action_id, patch),
            EngineEvent::ElicitationOpened {
                conversation_id,
                elicitation,
            } => self.apply_elicitation_opened(conversation_id, elicitation),
            EngineEvent::ElicitationResolving {
                conversation_id,
                elicitation_id,
            } => self.apply_elicitation_resolving(conversation_id, elicitation_id),
            EngineEvent::ElicitationResolved {
                conversation_id,
                elicitation_id,
                decision,
            } => self.apply_elicitation_resolved(conversation_id, elicitation_id, decision),
            EngineEvent::ElicitationCancelled {
                conversation_id,
                elicitation_id,
            } => self.apply_elicitation_cancelled(conversation_id, elicitation_id),
            EngineEvent::ContextUpdated {
                conversation_id,
                patch,
            } => self.apply_context_updated(conversation_id, patch),
            EngineEvent::HistoryMutationStarted {
                conversation_id,
                op,
            } => self.apply_history_mutation_started(conversation_id, op),
            EngineEvent::HistoryMutationFinished {
                conversation_id,
                result,
            } => self.apply_history_mutation_finished(conversation_id, result),
            EngineEvent::HistoryReplayChunk {
                conversation_id,
                entry,
            } => self.apply_history_replay_chunk(conversation_id, entry),
            EngineEvent::ObserverChanged {
                conversation_id,
                observer,
            } => {
                let conversation = self.conversation_mut(&conversation_id)?;
                conversation.observer = observer;
                Ok(TransitionReport::one(UiEvent::ConversationChanged(
                    conversation_id,
                )))
            }
        }
    }
}
