use crate::command::{TurnOverrides, UserInput};
use crate::error::EngineError;
use crate::ids::{ConversationId, JsonRpcRequestId, RemoteConversationId, RemoteTurnId, TurnId};
use crate::protocol::{ProtocolEffect, ProtocolFlavor};
use crate::state::{ConversationLifecycle, ConversationState, TurnPhase, TurnState, UserInputRef};

use super::context_effects::codex_context_fields;
use super::{AngelEngine, CommandPlan, PendingRequest};

impl AngelEngine {
    pub(super) fn plan_start_turn(
        &mut self,
        conversation_id: ConversationId,
        input: Vec<UserInput>,
        overrides: TurnOverrides,
    ) -> Result<CommandPlan, EngineError> {
        {
            let conversation = self.conversation(&conversation_id)?;
            self.ensure_can_start_turn(conversation)?;
        }

        let request_id = self.next_request_id();
        let turn_id = self.next_turn_id();
        let sequence = self.next_turn_sequence();
        let remote =
            self.remote_turn_for_start(&conversation_id, &request_id, &overrides, sequence)?;
        let input_text = input_to_text(&input);
        let input_refs = to_input_refs(input);
        let generation = self.generation;

        {
            let conversation = self.conversation_mut(&conversation_id)?;
            if !overrides.context.is_empty() {
                conversation.context.apply_patch(overrides.context.clone());
            }
            let mut turn = TurnState::new(turn_id.clone(), remote.clone(), generation);
            turn.input = input_refs;
            conversation.turns.insert(turn_id.clone(), turn);
            conversation.active_turns.insert(turn_id.clone());
            conversation.focused_turn = Some(turn_id.clone());
            conversation.lifecycle = ConversationLifecycle::Active;
        }
        let codex_context_fields = if self.protocol == ProtocolFlavor::CodexAppServer {
            let conversation = self.conversation(&conversation_id)?;
            codex_context_fields(&conversation.context)
        } else {
            Vec::new()
        };

        self.pending.insert(
            request_id.clone(),
            PendingRequest::StartTurn {
                conversation_id: conversation_id.clone(),
                turn_id: turn_id.clone(),
            },
        )?;

        let mut effect = ProtocolEffect::new(self.protocol, self.method_start_turn())
            .request_id(request_id.clone())
            .conversation_id(conversation_id.clone())
            .turn_id(turn_id.clone())
            .field("input", input_text);
        for (key, value) in codex_context_fields {
            effect = effect.field(key, value);
        }
        Ok(CommandPlan {
            effects: vec![effect],
            conversation_id: Some(conversation_id),
            turn_id: Some(turn_id),
            request_id: Some(request_id),
        })
    }

    pub(super) fn plan_steer_turn(
        &mut self,
        conversation_id: ConversationId,
        turn_id: Option<TurnId>,
        input: Vec<UserInput>,
    ) -> Result<CommandPlan, EngineError> {
        let selected_turn_id = self.select_turn_for_steer(&conversation_id, turn_id)?;

        let request_id = self.next_request_id();
        let input_text = input_to_text(&input);
        let input_refs = to_input_refs(input);
        {
            let conversation = self.conversation_mut(&conversation_id)?;
            let turn = conversation
                .turns
                .get_mut(&selected_turn_id)
                .ok_or_else(|| EngineError::TurnNotFound {
                    turn_id: selected_turn_id.to_string(),
                })?;
            turn.input.extend(input_refs);
            if !turn.is_terminal() {
                turn.phase = TurnPhase::Reasoning;
            }
            conversation.focused_turn = Some(selected_turn_id.clone());
        }
        self.pending.insert(
            request_id.clone(),
            PendingRequest::SteerTurn {
                conversation_id: conversation_id.clone(),
                turn_id: selected_turn_id.clone(),
            },
        )?;

        let method = self.method_steer_turn(&conversation_id)?;
        let effect = ProtocolEffect::new(self.protocol, method)
            .request_id(request_id.clone())
            .conversation_id(conversation_id.clone())
            .turn_id(selected_turn_id.clone())
            .field("input", input_text);
        Ok(CommandPlan {
            effects: vec![effect],
            conversation_id: Some(conversation_id),
            turn_id: Some(selected_turn_id),
            request_id: Some(request_id),
        })
    }

    pub(super) fn plan_cancel_turn(
        &mut self,
        conversation_id: ConversationId,
        turn_id: Option<TurnId>,
    ) -> Result<CommandPlan, EngineError> {
        let selected_turn_id = self.select_turn_for_cancel(&conversation_id, turn_id)?;
        let request_id = if self.protocol == ProtocolFlavor::Acp {
            None
        } else {
            Some(self.next_request_id())
        };
        {
            let conversation = self.conversation_mut(&conversation_id)?;
            conversation.lifecycle = ConversationLifecycle::Cancelling {
                turn_id: selected_turn_id.clone(),
            };
            if let Some(turn) = conversation.turns.get_mut(&selected_turn_id) {
                turn.phase = TurnPhase::Cancelling;
            }
        }
        if let Some(request_id) = &request_id {
            self.pending.insert(
                request_id.clone(),
                PendingRequest::CancelTurn {
                    conversation_id: conversation_id.clone(),
                    turn_id: selected_turn_id.clone(),
                },
            )?;
        }
        let effect = ProtocolEffect::new(self.protocol, self.method_cancel_turn())
            .conversation_id(conversation_id.clone())
            .turn_id(selected_turn_id.clone());
        let effect = if let Some(request_id) = &request_id {
            effect.request_id(request_id.clone())
        } else {
            effect
        };
        Ok(CommandPlan {
            effects: vec![effect],
            conversation_id: Some(conversation_id),
            turn_id: Some(selected_turn_id),
            request_id,
        })
    }

    fn select_turn_for_steer(
        &self,
        conversation_id: &ConversationId,
        turn_id: Option<TurnId>,
    ) -> Result<TurnId, EngineError> {
        let conversation = self.conversation(conversation_id)?;
        conversation.capabilities.turn.steer.require("turn.steer")?;
        let selected = active_or_requested_turn(conversation, conversation_id, turn_id)?;
        if conversation
            .capabilities
            .turn
            .requires_expected_turn_id_for_steer
        {
            ensure_codex_turn_id_available(conversation, &selected, "steer")?;
        }
        Ok(selected)
    }

    fn select_turn_for_cancel(
        &self,
        conversation_id: &ConversationId,
        turn_id: Option<TurnId>,
    ) -> Result<TurnId, EngineError> {
        let conversation = self.conversation(conversation_id)?;
        conversation
            .capabilities
            .turn
            .cancel
            .require("turn.cancel")?;
        let selected = active_or_requested_turn(conversation, conversation_id, turn_id)?;
        if self.protocol == ProtocolFlavor::CodexAppServer {
            ensure_codex_turn_id_available(conversation, &selected, "cancel")?;
        }
        Ok(selected)
    }

    fn ensure_can_start_turn(&self, conversation: &ConversationState) -> Result<(), EngineError> {
        conversation.capabilities.turn.start.require("turn.start")?;
        if matches!(
            conversation.lifecycle,
            ConversationLifecycle::Cancelling { .. }
                | ConversationLifecycle::Hydrating { .. }
                | ConversationLifecycle::MutatingHistory { .. }
                | ConversationLifecycle::Archived
                | ConversationLifecycle::Closing
                | ConversationLifecycle::Closed
                | ConversationLifecycle::Faulted(_)
        ) {
            return Err(EngineError::InvalidState {
                expected: "conversation ready for new turn".to_string(),
                actual: format!("{:?}", conversation.lifecycle),
            });
        }
        let max_active_turns = conversation.capabilities.turn.max_active_turns.max(1);
        if conversation.active_turn_count() >= max_active_turns {
            return Err(EngineError::InvalidState {
                expected: format!("fewer than {max_active_turns} active turns"),
                actual: format!("{} active turns", conversation.active_turn_count()),
            });
        }
        Ok(())
    }

    fn remote_turn_for_start(
        &self,
        conversation_id: &ConversationId,
        request_id: &JsonRpcRequestId,
        overrides: &TurnOverrides,
        sequence: u64,
    ) -> Result<RemoteTurnId, EngineError> {
        let conversation = self.conversation(conversation_id)?;
        match self.protocol {
            ProtocolFlavor::Acp => {
                let session_id = match &conversation.remote {
                    RemoteConversationId::AcpSession(session_id) => session_id.clone(),
                    other => {
                        return Err(EngineError::InvalidState {
                            expected: "ACP session id".to_string(),
                            actual: format!("{other:?}"),
                        });
                    }
                };
                Ok(RemoteTurnId::AcpLocal {
                    session_id,
                    prompt_request_id: Some(request_id.clone()),
                    user_message_id: overrides.user_message_id.clone(),
                    sequence,
                })
            }
            ProtocolFlavor::CodexAppServer => Ok(RemoteTurnId::Pending {
                protocol: "codex",
                request_id: request_id.clone(),
            }),
        }
    }
}

fn active_or_requested_turn(
    conversation: &ConversationState,
    conversation_id: &ConversationId,
    turn_id: Option<TurnId>,
) -> Result<TurnId, EngineError> {
    let selected = turn_id
        .or_else(|| conversation.primary_active_turn().cloned())
        .ok_or_else(|| EngineError::MissingActiveTurn {
            conversation_id: conversation_id.to_string(),
        })?;
    if !conversation.active_turns.contains(&selected) {
        return Err(EngineError::InvalidState {
            expected: "active turn".to_string(),
            actual: selected.to_string(),
        });
    }
    Ok(selected)
}

fn ensure_codex_turn_id_available(
    conversation: &ConversationState,
    turn_id: &TurnId,
    operation: &str,
) -> Result<(), EngineError> {
    let turn = conversation
        .turns
        .get(turn_id)
        .ok_or_else(|| EngineError::TurnNotFound {
            turn_id: turn_id.to_string(),
        })?;
    if !matches!(turn.remote, RemoteTurnId::CodexTurn(_)) {
        return Err(EngineError::InvalidState {
            expected: format!("remote turn id available for {operation}"),
            actual: format!("{:?}", turn.remote),
        });
    }
    Ok(())
}

fn to_input_refs(input: Vec<UserInput>) -> Vec<UserInputRef> {
    input
        .into_iter()
        .map(|input| UserInputRef {
            content: input.content,
        })
        .collect()
}

fn input_to_text(input: &[UserInput]) -> String {
    input
        .iter()
        .map(|input| input.content.as_str())
        .collect::<Vec<_>>()
        .join("\n")
}
