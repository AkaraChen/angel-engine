use std::time::Duration;

use crate::error::ClientResult;
use crate::{ClientInput, ConversationSnapshot, ElicitationResponse, ThreadEvent};

use super::AngelSession;
use super::active_turn::ActiveTurn;
use super::helpers::{invalid_input, is_result_event};
use super::types::{SendTextRequest, TurnRunEvent, TurnRunResult};

impl AngelSession {
    pub fn start_text_turn(&mut self, request: SendTextRequest) -> ClientResult<Vec<TurnRunEvent>> {
        let text = request.text.trim().to_string();
        let mut input = Vec::new();
        if !text.is_empty() {
            input.push(ClientInput::text(text.clone()));
        }
        input.extend(request.input);
        if input.is_empty() {
            return Err(invalid_input("Text or input is required."));
        }
        if self.active_turn.is_some() {
            return Err(invalid_input("A chat turn is already running."));
        }

        self.ensure_started(true, request.cwd, request.remote_id)?;
        let conversation_id = self.require_conversation_id()?.to_string();
        self.ensure_model(&conversation_id, request.model.as_deref())?;
        self.ensure_mode(&conversation_id, request.mode.as_deref())?;
        self.ensure_permission_mode(&conversation_id, request.permission_mode.as_deref())?;
        self.ensure_reasoning_effort(&conversation_id, request.reasoning_effort.as_deref())?;

        let command = self
            .client
            .send_thread_event(conversation_id.clone(), ThreadEvent::input(input))?;
        let mut active = ActiveTurn::new(
            conversation_id,
            command.turn_id.clone(),
            command.request_id.clone(),
        );
        active.handle_update(command.update)?;
        if command.turn_id.is_none() && active.request_is_complete() {
            let snapshot = self.thread_state();
            let result = self.final_result(active, snapshot)?;
            return Ok(vec![TurnRunEvent::Result { result }]);
        }

        let events = active.drain_events();
        self.active_turn = Some(active);
        Ok(events)
    }

    pub fn next_turn_event(&mut self, timeout: Duration) -> ClientResult<Option<TurnRunEvent>> {
        let Some(active) = self.active_turn.as_mut() else {
            return Ok(None);
        };
        if let Some(event) = active.pop_event() {
            return Ok(Some(event));
        }
        if active.pending_elicitation_id.is_some() {
            return Ok(None);
        }

        if self.turn_is_active_terminal()? {
            return self.finish_active_turn();
        }

        if self.queue_open_elicitation()? {
            return Ok(self.active_turn.as_mut().and_then(ActiveTurn::pop_event));
        }

        if let Some(update) = self.client.next_update(Some(timeout))? {
            self.active_turn_mut()?.handle_update(update)?;
        } else {
            return Ok(None);
        }

        if let Some(event) = self.active_turn.as_mut().and_then(ActiveTurn::pop_event) {
            return Ok(Some(event));
        }
        if self.turn_is_active_terminal()? {
            return self.finish_active_turn();
        }
        if self.queue_open_elicitation()? {
            return Ok(self.active_turn.as_mut().and_then(ActiveTurn::pop_event));
        }
        Ok(None)
    }

    pub fn next_turn_events(&mut self, timeout: Duration) -> ClientResult<Vec<TurnRunEvent>> {
        if let Some(active) = self.active_turn.as_mut() {
            let batch = active.drain_batch();
            if !batch.is_empty() {
                return Ok(batch);
            }
        }

        let Some(first) = self.next_turn_event(timeout)? else {
            return Ok(Vec::new());
        };
        let stop = matches!(
            first,
            TurnRunEvent::Result { .. } | TurnRunEvent::Elicitation { .. }
        );
        let mut events = vec![first];
        if !stop {
            if let Some(active) = self.active_turn.as_mut() {
                events.extend(active.drain_batch());
            }
        }
        Ok(events)
    }

    pub fn resolve_elicitation(
        &mut self,
        elicitation_id: String,
        response: ElicitationResponse,
    ) -> ClientResult<Vec<TurnRunEvent>> {
        let conversation_id = self.require_conversation_id()?.to_string();
        {
            let active = self.active_turn_mut()?;
            if active.pending_elicitation_id.as_deref() != Some(elicitation_id.as_str()) {
                return Err(invalid_input(
                    "Chat stream is not waiting for this user input.",
                ));
            }
            active.pending_elicitation_id = None;
        }

        let result = self.client.send_thread_event(
            conversation_id,
            ThreadEvent::resolve(elicitation_id, response),
        )?;
        self.active_turn_mut()?.handle_update(result.update)?;
        Ok(self.active_turn_mut()?.drain_events())
    }

    pub fn cancel_turn(&mut self) -> ClientResult<Vec<TurnRunEvent>> {
        let conversation_id = self.require_conversation_id()?.to_string();
        let turn_id = self
            .active_turn
            .as_ref()
            .and_then(|active| active.turn_id.clone());
        let result = self
            .client
            .send_thread_event(conversation_id, ThreadEvent::Cancel { turn_id })?;
        self.active_turn_mut()?.handle_update(result.update)?;
        let mut events = self.active_turn_mut()?.drain_events();
        self.drain_cancelled_turn(&mut events)?;
        Ok(events)
    }

    fn queue_open_elicitation(&mut self) -> ClientResult<bool> {
        let conversation_id = self.require_conversation_id()?.to_string();
        let Some(elicitation) = self
            .client
            .open_elicitations(&conversation_id)?
            .first()
            .cloned()
        else {
            return Ok(false);
        };
        let active = self.active_turn_mut()?;
        if !active.accepts_turn(elicitation.turn_id.as_deref()) {
            return Ok(false);
        }
        active.accept_elicitation(elicitation);
        Ok(true)
    }

    fn turn_is_active_terminal(&self) -> ClientResult<bool> {
        let Some(active) = self.active_turn.as_ref() else {
            return Ok(false);
        };
        let Some(turn_id) = active.turn_id.as_deref() else {
            return Ok(active.request_is_complete());
        };
        Ok(self.client_turn_is_terminal(&active.conversation_id, turn_id))
    }

    fn client_turn_is_terminal(&self, conversation_id: &str, turn_id: &str) -> bool {
        self.client.turn_is_terminal(conversation_id, turn_id)
    }

    fn finish_active_turn(&mut self) -> ClientResult<Option<TurnRunEvent>> {
        let active = self
            .active_turn
            .take()
            .ok_or_else(|| invalid_input("No active chat turn."))?;
        let conversation_id = active.conversation_id.clone();
        let snapshot = self.thread_state_by_id(&conversation_id);
        let result = self.final_result(active, snapshot)?;
        Ok(Some(TurnRunEvent::Result { result }))
    }

    fn drain_cancelled_turn(&mut self, events: &mut Vec<TurnRunEvent>) -> ClientResult<()> {
        loop {
            if events.iter().any(is_result_event) {
                return Ok(());
            }

            if let Some(elicitation_id) = self.pending_elicitation_id() {
                events
                    .extend(self.resolve_elicitation(elicitation_id, ElicitationResponse::Cancel)?);
                continue;
            }

            if let Some(event) = self.next_turn_event(Duration::from_millis(50))? {
                events.push(event);
            }
        }
    }

    fn pending_elicitation_id(&self) -> Option<String> {
        self.active_turn
            .as_ref()
            .and_then(|active| active.pending_elicitation_id.clone())
    }

    fn final_result(
        &self,
        active: ActiveTurn,
        snapshot: Option<ConversationSnapshot>,
    ) -> ClientResult<TurnRunResult> {
        let result_turn_id = active.turn_id.clone();
        if let Some(turn_id) = result_turn_id.as_deref() {
            let snapshot = snapshot.as_ref().ok_or_else(|| {
                invalid_input("Runtime did not return a final conversation snapshot.")
            })?;
            if !snapshot.turns.iter().any(|turn| turn.id == turn_id) {
                return Err(invalid_input(format!(
                    "Final conversation snapshot is missing turn {turn_id}."
                )));
            }
        }

        Ok(TurnRunResult {
            conversation: snapshot.clone(),
            remote_thread_id: snapshot
                .as_ref()
                .and_then(|snapshot| snapshot.remote_id.clone()),
            turn_id: result_turn_id,
        })
    }

    fn active_turn_mut(&mut self) -> ClientResult<&mut ActiveTurn> {
        self.active_turn
            .as_mut()
            .ok_or_else(|| invalid_input("No active chat turn."))
    }
}
