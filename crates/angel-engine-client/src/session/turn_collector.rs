use std::collections::{HashMap, HashSet, VecDeque, hash_map::Entry};

use crate::event::{ClientEvent, ClientStreamDelta};
use crate::{
    ActionOutputSnapshot, ActionSnapshot, DisplayMessagePartSnapshot, DisplayPlanSnapshot,
    DisplayToolActionSnapshot,
};

use super::helpers::{is_terminal_action_phase_label, turn_run_delta_part};
use super::types::TurnRunEvent;

#[derive(Debug)]
pub(super) struct TurnCollector {
    turn_id: Option<String>,
    action_indexes: HashMap<String, usize>,
    actions: Vec<ActionSnapshot>,
    streaming_actions: HashMap<String, DisplayToolActionSnapshot>,
    plan: DisplayPlanSnapshot,
    todo: DisplayPlanSnapshot,
    reasoning: String,
    text: String,
}

impl TurnCollector {
    pub(super) fn new(turn_id: Option<String>) -> Self {
        Self {
            turn_id,
            action_indexes: HashMap::new(),
            actions: Vec::new(),
            streaming_actions: HashMap::new(),
            plan: DisplayPlanSnapshot::default(),
            todo: DisplayPlanSnapshot {
                kind: "todo".to_string(),
                ..DisplayPlanSnapshot::default()
            },
            reasoning: String::new(),
            text: String::new(),
        }
    }

    pub(super) fn accept_delta(
        &mut self,
        delta: ClientStreamDelta,
        events: &mut VecDeque<TurnRunEvent>,
    ) {
        match delta {
            ClientStreamDelta::AssistantDelta {
                turn_id, content, ..
            } => self.accept_text_delta("text", turn_id, content.text, events),
            ClientStreamDelta::ReasoningDelta {
                turn_id, content, ..
            } => self.accept_text_delta("reasoning", turn_id, content.text, events),
            ClientStreamDelta::PlanDelta {
                turn_id, content, ..
            } => self.accept_plan_delta(turn_id, content.text, events),
            ClientStreamDelta::ActionOutputDelta {
                turn_id,
                action_id,
                content,
                ..
            } => {
                if self.accepts_turn(Some(&turn_id)) {
                    let action = self.accept_output_delta(
                        turn_id.clone(),
                        action_id.clone(),
                        content.clone(),
                    );
                    let message_part = DisplayMessagePartSnapshot::tool(action);
                    events.push_back(TurnRunEvent::ActionOutputDelta {
                        action_id,
                        content,
                        message_part,
                        turn_id,
                    });
                }
            }
        }
    }

    pub(super) fn accept_event(
        &mut self,
        event: ClientEvent,
        action_output_delta_ids: &HashSet<String>,
        events: &mut VecDeque<TurnRunEvent>,
    ) {
        match event {
            ClientEvent::ActionObserved { action, .. } => {
                self.upsert_action(action.clone());
                events.push_back(TurnRunEvent::ActionObserved {
                    message_part: DisplayMessagePartSnapshot::tool((&action).into()),
                });
            }
            ClientEvent::ActionUpdated { action, .. } => {
                if action_output_delta_ids.contains(&action.id) {
                    self.upsert_streaming_action_metadata(action);
                    return;
                }
                self.upsert_action(action.clone());
                events.push_back(TurnRunEvent::ActionUpdated {
                    message_part: DisplayMessagePartSnapshot::tool((&action).into()),
                });
            }
            ClientEvent::AssistantDelta {
                turn_id, content, ..
            } => self.accept_text_delta("text", turn_id, content.text, events),
            ClientEvent::ReasoningDelta {
                turn_id, content, ..
            } => self.accept_text_delta("reasoning", turn_id, content.text, events),
            ClientEvent::PlanDelta {
                turn_id, content, ..
            } => self.accept_plan_delta(turn_id, content.text, events),
            ClientEvent::PlanUpdated { turn_id, plan, .. } => {
                self.accept_plan_update(turn_id, plan, events)
            }
            _ => {}
        }
    }

    fn accept_text_delta(
        &mut self,
        part: &str,
        turn_id: String,
        text: String,
        events: &mut VecDeque<TurnRunEvent>,
    ) {
        if !self.accepts_turn(Some(&turn_id)) || text.is_empty() {
            return;
        }
        match part {
            "reasoning" => self.reasoning.push_str(&text),
            _ => self.text.push_str(&text),
        }
        let message_part = DisplayMessagePartSnapshot::text(part, text.clone());
        events.push_back(TurnRunEvent::Delta {
            part: turn_run_delta_part(part),
            text,
            message_part,
            turn_id: Some(turn_id),
        });
    }

    fn accept_plan_delta(
        &mut self,
        turn_id: String,
        text: String,
        events: &mut VecDeque<TurnRunEvent>,
    ) {
        if !self.accepts_turn(Some(&turn_id)) || text.is_empty() {
            return;
        }
        self.plan.kind = "review".to_string();
        self.plan.text.push_str(&text);
        let plan = self.plan.clone();
        self.push_plan_event(Some(turn_id), plan, events);
    }

    fn accept_plan_update(
        &mut self,
        turn_id: String,
        plan: DisplayPlanSnapshot,
        events: &mut VecDeque<TurnRunEvent>,
    ) {
        if !self.accepts_turn(Some(&turn_id)) {
            return;
        }
        if plan.kind == "todo" {
            self.todo = plan.clone();
        } else {
            self.plan = DisplayPlanSnapshot {
                kind: "review".to_string(),
                ..plan.clone()
            };
        }
        self.push_plan_event(Some(turn_id), plan, events);
    }

    fn push_plan_event(
        &self,
        turn_id: Option<String>,
        plan: DisplayPlanSnapshot,
        events: &mut VecDeque<TurnRunEvent>,
    ) {
        if plan.is_empty() {
            return;
        }
        let message_part = DisplayMessagePartSnapshot::plan(plan.clone());
        events.push_back(TurnRunEvent::PlanUpdated {
            turn_id,
            message_part,
        });
    }

    pub(super) fn accepts_turn(&self, turn_id: Option<&str>) -> bool {
        turn_id.is_none() || self.turn_id.is_none() || self.turn_id.as_deref() == turn_id
    }

    fn upsert_action(&mut self, action: ActionSnapshot) {
        if !self.accepts_turn(Some(&action.turn_id)) {
            return;
        }
        self.streaming_actions
            .insert(action.id.clone(), DisplayToolActionSnapshot::from(&action));
        if let Some(index) = self.action_indexes.get(&action.id).copied() {
            self.actions[index] = action;
        } else {
            self.action_indexes
                .insert(action.id.clone(), self.actions.len());
            self.actions.push(action);
        }
    }

    fn accept_output_delta(
        &mut self,
        turn_id: String,
        action_id: String,
        content: ActionOutputSnapshot,
    ) -> DisplayToolActionSnapshot {
        let action = match self.streaming_actions.entry(action_id.clone()) {
            Entry::Vacant(entry) => entry.insert(DisplayToolActionSnapshot::from_output_delta(
                turn_id,
                action_id,
                content.clone(),
            )),
            Entry::Occupied(entry) => {
                let action = entry.into_mut();
                if !is_terminal_action_phase_label(&action.phase) {
                    action.phase = "streamingResult".to_string();
                }
                action.output_text.push_str(&content.text);
                action.output.push(content.clone());
                action
            }
        };
        action.single_output_delta(content)
    }

    fn upsert_streaming_action_metadata(&mut self, action: ActionSnapshot) {
        let action_id = action.id.clone();
        let previous_output = self
            .streaming_actions
            .get(&action_id)
            .map(|existing| (existing.output.clone(), existing.output_text.clone()));
        self.upsert_action(action.clone());

        let mut display = DisplayToolActionSnapshot::from(&action);
        if let Some((output, output_text)) = previous_output {
            display.output = output;
            display.output_text = output_text;
        } else {
            display.output.clear();
            display.output_text.clear();
        }
        self.streaming_actions.insert(action_id, display);
    }
}
