use crate::error::EngineError;
use crate::event::{EngineEvent, TransitionReport, UiEvent};
use crate::state::{
    AgentMode, ContextPatch, ContextScope, ContextUpdate, ConversationLifecycle, ConversationState,
    ElicitationPhase, RuntimeState, TurnPhase,
};

use super::AngelEngine;
use super::context_effects::sync_context_from_config_options;
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
            } => {
                let conversation = self.conversation_mut(&conversation_id)?;
                sync_context_from_config_options(&mut conversation.context, &options);
                conversation.config_options = options;
                Ok(TransitionReport::one(UiEvent::ContextChanged(
                    conversation_id,
                )))
            }
            EngineEvent::SessionModesUpdated {
                conversation_id,
                modes,
            } => {
                let conversation = self.conversation_mut(&conversation_id)?;
                conversation
                    .context
                    .apply_patch(ContextPatch::one(ContextUpdate::Mode {
                        scope: ContextScope::TurnAndFuture,
                        mode: Some(AgentMode {
                            id: modes.current_mode_id.clone(),
                        }),
                    }));
                conversation.mode_state = Some(modes);
                Ok(TransitionReport::one(UiEvent::ContextChanged(
                    conversation_id,
                )))
            }
            EngineEvent::SessionModeChanged {
                conversation_id,
                mode_id,
            } => {
                let conversation = self.conversation_mut(&conversation_id)?;
                if let Some(modes) = &mut conversation.mode_state {
                    modes.current_mode_id = mode_id.clone();
                }
                conversation
                    .context
                    .apply_patch(ContextPatch::one(ContextUpdate::Mode {
                        scope: ContextScope::TurnAndFuture,
                        mode: Some(AgentMode { id: mode_id }),
                    }));
                Ok(TransitionReport::one(UiEvent::ContextChanged(
                    conversation_id,
                )))
            }
            EngineEvent::SessionModelsUpdated {
                conversation_id,
                models,
            } => {
                let conversation = self.conversation_mut(&conversation_id)?;
                conversation
                    .context
                    .apply_patch(ContextPatch::one(ContextUpdate::Model {
                        scope: ContextScope::TurnAndFuture,
                        model: Some(models.current_model_id.clone()),
                    }));
                conversation.model_state = Some(models);
                Ok(TransitionReport::one(UiEvent::ContextChanged(
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
            } => {
                let conversation = self.conversation_mut(&conversation_id)?;
                let turn = conversation.turns.get_mut(&turn_id).ok_or_else(|| {
                    EngineError::TurnNotFound {
                        turn_id: turn_id.to_string(),
                    }
                })?;
                turn.input.extend(input);
                turn.phase = TurnPhase::Reasoning;
                Ok(TransitionReport::one(UiEvent::TurnChanged {
                    conversation_id,
                    turn_id,
                }))
            }
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
            } => {
                let conversation = self.conversation_mut(&conversation_id)?;
                let turn = conversation.turns.get_mut(&turn_id).ok_or_else(|| {
                    EngineError::TurnNotFound {
                        turn_id: turn_id.to_string(),
                    }
                })?;
                turn.plan = Some(plan);
                if !turn.is_terminal() {
                    turn.phase = TurnPhase::Planning;
                }
                Ok(TransitionReport::one(UiEvent::TurnChanged {
                    conversation_id,
                    turn_id,
                }))
            }
            EngineEvent::PlanPathUpdated {
                conversation_id,
                turn_id,
                path,
            } => {
                let conversation = self.conversation_mut(&conversation_id)?;
                let turn = conversation.turns.get_mut(&turn_id).ok_or_else(|| {
                    EngineError::TurnNotFound {
                        turn_id: turn_id.to_string(),
                    }
                })?;
                turn.plan_path = Some(path);
                if !turn.is_terminal() {
                    turn.phase = TurnPhase::Planning;
                }
                Ok(TransitionReport::one(UiEvent::TurnChanged {
                    conversation_id,
                    turn_id,
                }))
            }
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
            } => {
                let conversation = self.conversation_mut(&conversation_id)?;
                let elicitation = conversation
                    .elicitations
                    .get_mut(&elicitation_id)
                    .ok_or_else(|| EngineError::ElicitationNotFound {
                        elicitation_id: elicitation_id.to_string(),
                    })?;
                elicitation.phase = ElicitationPhase::Resolving;
                Ok(TransitionReport::one(UiEvent::ElicitationChanged {
                    conversation_id,
                    elicitation_id,
                }))
            }
            EngineEvent::ElicitationResolved {
                conversation_id,
                elicitation_id,
                decision,
            } => self.apply_elicitation_resolved(conversation_id, elicitation_id, decision),
            EngineEvent::ElicitationCancelled {
                conversation_id,
                elicitation_id,
            } => {
                let conversation = self.conversation_mut(&conversation_id)?;
                let elicitation = conversation
                    .elicitations
                    .get_mut(&elicitation_id)
                    .ok_or_else(|| EngineError::ElicitationNotFound {
                        elicitation_id: elicitation_id.to_string(),
                    })?;
                elicitation.phase = ElicitationPhase::Cancelled;
                Ok(TransitionReport::one(UiEvent::ElicitationChanged {
                    conversation_id,
                    elicitation_id,
                }))
            }
            EngineEvent::ContextUpdated {
                conversation_id,
                patch,
            } => {
                let conversation = self.conversation_mut(&conversation_id)?;
                conversation.context.apply_patch(patch);
                Ok(TransitionReport::one(UiEvent::ContextChanged(
                    conversation_id,
                )))
            }
            EngineEvent::HistoryMutationStarted {
                conversation_id,
                op,
            } => {
                let conversation = self.conversation_mut(&conversation_id)?;
                conversation.lifecycle = ConversationLifecycle::MutatingHistory { op };
                Ok(TransitionReport::one(UiEvent::HistoryChanged(
                    conversation_id,
                )))
            }
            EngineEvent::HistoryMutationFinished {
                conversation_id,
                result,
            } => self.apply_history_mutation_finished(conversation_id, result),
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
