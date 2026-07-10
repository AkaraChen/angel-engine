use std::collections::{HashSet, VecDeque};

use crate::error::{ClientError, ClientResult};
use crate::event::{ClientEvent, ClientStreamDelta, ClientUpdate};
use crate::{
    ActionSnapshot, DisplayMessagePartSnapshot, DisplayToolActionSnapshot, ElicitationSnapshot,
};

use super::helpers::{action_output_delta_ids, is_ordered_stream_event};
use super::turn_collector::TurnCollector;
use super::types::TurnRunEvent;

#[derive(Debug)]
pub(super) struct ActiveTurn {
    pub(super) conversation_id: String,
    pub(super) turn_id: Option<String>,
    request_id: Option<String>,
    request_completed: bool,
    collector: TurnCollector,
    displayed_elicitation_ids: HashSet<String>,
    pub(super) pending_elicitation_id: Option<String>,
    events: VecDeque<TurnRunEvent>,
}

impl ActiveTurn {
    pub(super) fn new(
        conversation_id: String,
        turn_id: Option<String>,
        request_id: Option<String>,
    ) -> Self {
        let request_completed = request_id.is_none();
        Self {
            collector: TurnCollector::new(turn_id.clone()),
            conversation_id,
            displayed_elicitation_ids: HashSet::new(),
            turn_id,
            request_id,
            request_completed,
            pending_elicitation_id: None,
            events: VecDeque::new(),
        }
    }

    pub(super) fn pop_event(&mut self) -> Option<TurnRunEvent> {
        self.events.pop_front()
    }

    pub(super) fn drain_events(&mut self) -> Vec<TurnRunEvent> {
        self.events.drain(..).collect()
    }

    pub(super) fn drain_batch(&mut self) -> Vec<TurnRunEvent> {
        let mut events = Vec::new();
        while let Some(event) = self.events.pop_front() {
            let is_elicitation = matches!(event, TurnRunEvent::Elicitation { .. });
            events.push(event);
            if is_elicitation {
                break;
            }
        }
        events
    }

    pub(super) fn handle_update(&mut self, update: ClientUpdate) -> ClientResult<()> {
        let has_ordered_stream_events = update.events.iter().any(is_ordered_stream_event);
        let action_output_delta_ids = action_output_delta_ids(&update.stream_deltas);
        if let Some(request_id) = &self.request_id {
            if update
                .completed_request_ids
                .iter()
                .any(|completed| completed == request_id)
            {
                self.request_completed = true;
            }
        }

        for event in update.events {
            if let ClientEvent::RuntimeFaulted { code, message } = &event {
                return Err(ClientError::RuntimeFaulted {
                    code: code.clone(),
                    message: message.clone(),
                });
            }
            match &event {
                ClientEvent::ActionObserved { action, .. }
                | ClientEvent::ActionUpdated { action, .. } => {
                    self.accept_action_elicitation(action);
                }
                _ => {}
            }
            match event {
                ClientEvent::ElicitationOpened { elicitation, .. } => {
                    self.accept_elicitation(elicitation);
                }
                ClientEvent::ElicitationUpdated { elicitation, .. } => {
                    self.update_elicitation(elicitation);
                }
                event => {
                    self.collector
                        .accept_event(event, &action_output_delta_ids, &mut self.events)
                }
            }
        }

        if !has_ordered_stream_events {
            for delta in update.stream_deltas {
                self.collector.accept_delta(delta, &mut self.events);
            }
        } else {
            for delta in update
                .stream_deltas
                .into_iter()
                .filter(|delta| matches!(delta, ClientStreamDelta::ActionOutputDelta { .. }))
            {
                self.collector.accept_delta(delta, &mut self.events);
            }
        }
        Ok(())
    }

    pub(super) fn accepts_turn(&self, turn_id: Option<&str>) -> bool {
        self.collector.accepts_turn(turn_id)
    }

    pub(super) fn request_is_complete(&self) -> bool {
        self.request_completed
    }

    pub(super) fn accept_elicitation(&mut self, elicitation: ElicitationSnapshot) {
        if elicitation.phase != "open" {
            self.update_elicitation(elicitation);
            return;
        }
        if !self.accepts_turn(elicitation.turn_id.as_deref()) {
            return;
        }
        if self.pending_elicitation_id.as_deref() == Some(elicitation.id.as_str()) {
            return;
        }
        self.pending_elicitation_id = Some(elicitation.id.clone());
        self.displayed_elicitation_ids
            .insert(elicitation.id.clone());
        let message_part = DisplayMessagePartSnapshot::tool(
            DisplayToolActionSnapshot::from_elicitation(&elicitation),
        );
        self.events
            .push_back(TurnRunEvent::Elicitation { message_part });
    }

    fn accept_action_elicitation(&mut self, action: &ActionSnapshot) {
        if !self.accepts_turn(Some(&action.turn_id)) {
            return;
        }
        let Some(elicitation_id) = action.elicitation_id.as_deref() else {
            return;
        };
        if self.pending_elicitation_id.is_some() {
            return;
        }
        self.pending_elicitation_id = Some(elicitation_id.to_string());
    }

    fn update_elicitation(&mut self, elicitation: ElicitationSnapshot) {
        if !self.accepts_turn(elicitation.turn_id.as_deref()) {
            return;
        }
        if elicitation.phase == "open" {
            self.accept_elicitation(elicitation);
            return;
        }
        let was_displayed = self.displayed_elicitation_ids.contains(&elicitation.id);
        let was_pending = self.pending_elicitation_id.as_deref() == Some(elicitation.id.as_str());
        if !was_displayed && !was_pending {
            return;
        }
        if was_pending {
            self.pending_elicitation_id = None;
        }
        self.displayed_elicitation_ids
            .insert(elicitation.id.clone());
        let message_part = DisplayMessagePartSnapshot::tool(
            DisplayToolActionSnapshot::from_elicitation(&elicitation),
        );
        self.events
            .push_back(TurnRunEvent::Elicitation { message_part });
    }
}
