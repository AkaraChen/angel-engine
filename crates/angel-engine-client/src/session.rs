use std::collections::{HashMap, HashSet, VecDeque, hash_map::Entry};
use std::time::Duration;

use garde::Validate;
use serde::{Deserialize, Serialize};

use crate::error::{ClientError, ClientResult};
use crate::event::{ClientEvent, ClientStreamDelta, ClientUpdate};
use crate::snapshot::display_message_from_parts;
use crate::{
    ActionOutputSnapshot, ActionSnapshot, AngelClient, ClientInput, ClientProtocol,
    ConversationSnapshot, ElicitationResponse, ElicitationSnapshot, ResumeConversationRequest,
    RuntimeOptions, RuntimeOptionsOverrides, StartConversationRequest, ThreadEvent, TurnSnapshot,
    create_runtime_options,
};
use crate::{
    DisplayMessagePartSnapshot, DisplayMessageSnapshot, DisplayPlanSnapshot,
    DisplayToolActionSnapshot,
};

pub struct AngelSession {
    client: AngelClient,
    options: RuntimeOptions,
    conversation_id: Option<String>,
    active_turn: Option<ActiveTurn>,
}

fn validate_trimmed_not_empty(value: &str, _: &()) -> garde::Result {
    if value.trim().is_empty() {
        return Err(garde::Error::new("text must not be empty"));
    }
    Ok(())
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct SendTextRequest {
    #[garde(custom(validate_trimmed_not_empty))]
    pub text: String,
    #[serde(default)]
    #[garde(skip)]
    pub input: Vec<ClientInput>,
    #[serde(default)]
    #[garde(skip)]
    pub cwd: Option<String>,
    #[serde(default)]
    #[garde(skip)]
    pub remote_id: Option<String>,
    #[serde(default)]
    #[garde(skip)]
    pub model: Option<String>,
    #[serde(default)]
    #[garde(skip)]
    pub mode: Option<String>,
    #[serde(default)]
    #[garde(skip)]
    pub permission_mode: Option<String>,
    #[serde(default)]
    #[garde(skip)]
    pub reasoning_effort: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct SetModeRequest {
    #[garde(length(min = 1))]
    pub mode: String,
    #[serde(default)]
    #[garde(skip)]
    pub cwd: Option<String>,
    #[serde(default)]
    #[garde(skip)]
    pub remote_id: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct SetPermissionModeRequest {
    #[garde(length(min = 1))]
    pub mode: String,
    #[serde(default)]
    #[garde(skip)]
    pub cwd: Option<String>,
    #[serde(default)]
    #[garde(skip)]
    pub remote_id: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HydrateRequest {
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub remote_id: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectRequest {
    #[serde(default)]
    pub cwd: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnRunResult {
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub remote_thread_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub conversation: Option<ConversationSnapshot>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn: Option<TurnSnapshot>,
    #[serde(default)]
    pub actions: Vec<ActionSnapshot>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<DisplayMessageSnapshot>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
#[allow(clippy::large_enum_variant)]
pub enum TurnRunEvent {
    Delta {
        part: TurnRunDeltaPart,
        text: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        turn_id: Option<String>,
        message_part: DisplayMessagePartSnapshot,
    },
    ActionObserved {
        action: ActionSnapshot,
        message_part: DisplayMessagePartSnapshot,
    },
    ActionUpdated {
        action: ActionSnapshot,
        message_part: DisplayMessagePartSnapshot,
    },
    ActionOutputDelta {
        turn_id: String,
        action_id: String,
        content: ActionOutputSnapshot,
        message_part: DisplayMessagePartSnapshot,
    },
    Elicitation {
        elicitation: ElicitationSnapshot,
        message_part: DisplayMessagePartSnapshot,
    },
    PlanUpdated {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        turn_id: Option<String>,
        plan: DisplayPlanSnapshot,
        message_part: DisplayMessagePartSnapshot,
    },
    Result {
        result: TurnRunResult,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TurnRunDeltaPart {
    Reasoning,
    Text,
}

impl AngelSession {
    pub fn new(options: RuntimeOptions) -> ClientResult<Self> {
        let client = AngelClient::spawn(options.client_options())?;
        Ok(Self {
            client,
            options,
            conversation_id: None,
            active_turn: None,
        })
    }

    pub fn from_runtime(
        runtime_name: Option<&str>,
        overrides: RuntimeOptionsOverrides,
    ) -> ClientResult<Self> {
        Self::new(create_runtime_options(runtime_name, overrides))
    }

    pub fn has_conversation(&self) -> bool {
        self.conversation_id.is_some()
    }

    pub fn close(&mut self) {
        self.client.close();
    }

    pub fn hydrate(&mut self, request: HydrateRequest) -> ClientResult<ConversationSnapshot> {
        self.ensure_started(false, request.cwd, request.remote_id)?;
        self.thread_state()
            .ok_or_else(|| invalid_input("Runtime did not return a conversation snapshot."))
    }

    pub fn inspect(&mut self, request: InspectRequest) -> ClientResult<ConversationSnapshot> {
        self.ensure_started(true, request.cwd, None)?;
        self.thread_state()
            .ok_or_else(|| invalid_input("Runtime did not return a conversation snapshot."))
    }

    pub fn set_mode(&mut self, request: SetModeRequest) -> ClientResult<ConversationSnapshot> {
        let mode = selected_config_value(Some(&request.mode))
            .ok_or_else(|| invalid_input("Mode is required."))?;
        if self.active_turn.is_some() {
            return Err(invalid_input(
                "Cannot change mode while a chat turn is running.",
            ));
        }

        self.ensure_started(true, request.cwd, request.remote_id)?;
        let conversation_id = self.require_conversation_id()?.to_string();
        let result = self.client.set_mode(conversation_id, mode)?;
        self.drain_configuration_updates(result.update)?;
        self.thread_state()
            .ok_or_else(|| invalid_input("Runtime did not return a conversation snapshot."))
    }

    pub fn set_permission_mode(
        &mut self,
        request: SetPermissionModeRequest,
    ) -> ClientResult<ConversationSnapshot> {
        let mode = selected_config_value(Some(&request.mode))
            .ok_or_else(|| invalid_input("Permission mode is required."))?;
        if self.active_turn.is_some() {
            return Err(invalid_input(
                "Cannot change permission mode while a chat turn is running.",
            ));
        }

        self.ensure_started(true, request.cwd, request.remote_id)?;
        let conversation_id = self.require_conversation_id()?.to_string();
        let result = self.client.set_permission_mode(conversation_id, mode)?;
        self.drain_configuration_updates(result.update)?;
        self.thread_state()
            .ok_or_else(|| invalid_input("Runtime did not return a conversation snapshot."))
    }

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
        if command.turn_id.is_none() {
            if let Some(message) = command.message {
                active.collector.text = message;
            }
        }

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

    fn ensure_started(
        &mut self,
        allow_start: bool,
        cwd: Option<String>,
        remote_id: Option<String>,
    ) -> ClientResult<()> {
        if self.conversation_id.is_some() {
            return Ok(());
        }

        let initialize_update = self.client.initialize()?;
        check_update_fault(&initialize_update)?;
        let should_read_history = remote_id.is_some()
            && matches!(self.options.client.protocol, ClientProtocol::CodexAppServer);
        let result = if let Some(remote_id) = remote_id {
            self.client.resume_conversation(ResumeConversationRequest {
                additional_directories: Vec::new(),
                cwd,
                hydrate: true,
                remote_id,
            })?
        } else if allow_start {
            self.client.start_conversation(StartConversationRequest {
                additional_directories: Vec::new(),
                cwd: Some(cwd.ok_or_else(|| invalid_input("Conversation cwd is required."))?),
            })?
        } else {
            return Err(invalid_input(
                "Conversation has no remote thread to resume.",
            ));
        };
        check_update_fault(&result.update)?;

        self.conversation_id = result.conversation_id;
        if should_read_history {
            let conversation_id = self.require_conversation_id()?.to_string();
            let result = self.client.read_conversation(conversation_id)?;
            check_update_fault(&result.update)?;
        }
        Ok(())
    }

    fn ensure_reasoning_effort(
        &mut self,
        conversation_id: &str,
        requested_effort: Option<&str>,
    ) -> ClientResult<()> {
        let env_effort = std::env::var("ANGEL_ENGINE_REASONING_EFFORT").ok();
        let effort = selected_config_value(requested_effort)
            .or_else(|| selected_config_value(self.options.default_reasoning_effort.as_deref()))
            .or_else(|| selected_config_value(env_effort.as_deref()));
        let Some(effort) = effort else {
            return Ok(());
        };

        let result = self.client.send_thread_event(
            conversation_id.to_string(),
            ThreadEvent::set_reasoning_effort(effort),
        )?;
        self.drain_configuration_updates(result.update)
    }

    fn ensure_model(
        &mut self,
        conversation_id: &str,
        requested_model: Option<&str>,
    ) -> ClientResult<()> {
        let Some(model) = selected_config_value(requested_model) else {
            return Ok(());
        };
        let result = self
            .client
            .send_thread_event(conversation_id.to_string(), ThreadEvent::set_model(model))?;
        self.drain_configuration_updates(result.update)
    }

    fn ensure_mode(
        &mut self,
        conversation_id: &str,
        requested_mode: Option<&str>,
    ) -> ClientResult<()> {
        let Some(mode) = selected_config_value(requested_mode) else {
            return Ok(());
        };
        let result = self
            .client
            .send_thread_event(conversation_id.to_string(), ThreadEvent::set_mode(mode))?;
        self.drain_configuration_updates(result.update)
    }

    fn ensure_permission_mode(
        &mut self,
        conversation_id: &str,
        requested_mode: Option<&str>,
    ) -> ClientResult<()> {
        let Some(mode) = selected_config_value(requested_mode) else {
            return Ok(());
        };
        let result = self.client.send_thread_event(
            conversation_id.to_string(),
            ThreadEvent::set_permission_mode(mode),
        )?;
        self.drain_configuration_updates(result.update)
    }

    fn drain_configuration_updates(&mut self, initial: ClientUpdate) -> ClientResult<()> {
        check_update_fault(&initial)?;
        while let Some(update) = self.client.next_update(Some(Duration::from_millis(250)))? {
            check_update_fault(&update)?;
        }
        Ok(())
    }

    fn queue_open_elicitation(&mut self) -> ClientResult<bool> {
        let conversation_id = self.require_conversation_id()?.to_string();
        let Some(elicitation) = self
            .client
            .open_elicitations(&conversation_id)
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
        self.thread_state_by_id(conversation_id)
            .and_then(|conversation| {
                conversation
                    .turns
                    .into_iter()
                    .find(|turn| turn.id == turn_id)
            })
            .map(|turn| turn.is_terminal)
            .unwrap_or(false)
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
        let (actions, message, reasoning, text, turn) = match active.turn_id.as_deref() {
            Some(turn_id) => {
                let snapshot = snapshot.as_ref().ok_or_else(|| {
                    invalid_input("Runtime did not return a final conversation snapshot.")
                })?;
                let turn = find_turn(snapshot, turn_id).ok_or_else(|| {
                    invalid_input(format!(
                        "Final conversation snapshot is missing turn {turn_id}."
                    ))
                })?;
                let message = assistant_message_for_turn(snapshot, turn_id).ok_or_else(|| {
                    invalid_input(format!(
                        "Final conversation snapshot is missing turn {turn_id} assistant message."
                    ))
                })?;
                (
                    actions_for_turn(snapshot, turn_id),
                    Some(message),
                    turn_reasoning_text(Some(&turn)),
                    turn.output_text.clone(),
                    Some(turn),
                )
            }
            None => {
                let request_id = active.request_id.as_deref().ok_or_else(|| {
                    invalid_input("Completed no-turn result is missing request id.")
                })?;
                let mut content = Vec::new();
                if !active.collector.reasoning.is_empty() {
                    content.push(DisplayMessagePartSnapshot::text(
                        "reasoning",
                        active.collector.reasoning.clone(),
                    ));
                }
                if let Some(plan_part) = active.collector.review_plan_message_part() {
                    content.push(plan_part);
                }
                for action in &active.collector.actions {
                    content.push(DisplayMessagePartSnapshot::tool(action.into()));
                }
                if let Some(todo_part) = active.collector.todo_message_part() {
                    content.push(todo_part);
                }
                if !active.collector.text.is_empty() {
                    content.push(DisplayMessagePartSnapshot::text(
                        "text",
                        active.collector.text.clone(),
                    ));
                }
                (
                    Vec::new(),
                    display_message_from_parts(
                        format!("result:{request_id}:assistant"),
                        "assistant",
                        content,
                    ),
                    (!active.collector.reasoning.is_empty())
                        .then_some(active.collector.reasoning.clone()),
                    active.collector.text.clone(),
                    None,
                )
            }
        };

        Ok(TurnRunResult {
            actions,
            conversation: snapshot.clone(),
            message,
            model: snapshot.as_ref().and_then(current_model),
            reasoning,
            remote_thread_id: snapshot
                .as_ref()
                .and_then(|snapshot| snapshot.remote_id.clone()),
            text,
            turn,
            turn_id: result_turn_id,
        })
    }

    fn thread_state(&self) -> Option<ConversationSnapshot> {
        let conversation_id = self.conversation_id.as_deref()?;
        self.thread_state_by_id(conversation_id)
    }

    fn thread_state_by_id(&self, conversation_id: &str) -> Option<ConversationSnapshot> {
        self.client
            .snapshot()
            .conversations
            .into_iter()
            .find(|conversation| conversation.id == conversation_id)
    }

    fn require_conversation_id(&self) -> ClientResult<&str> {
        self.conversation_id
            .as_deref()
            .ok_or_else(|| invalid_input("Runtime did not start a conversation."))
    }

    fn active_turn_mut(&mut self) -> ClientResult<&mut ActiveTurn> {
        self.active_turn
            .as_mut()
            .ok_or_else(|| invalid_input("No active chat turn."))
    }
}

#[derive(Debug)]
struct ActiveTurn {
    conversation_id: String,
    turn_id: Option<String>,
    request_id: Option<String>,
    request_completed: bool,
    collector: TurnCollector,
    displayed_elicitation_ids: HashSet<String>,
    pending_elicitation_id: Option<String>,
    events: VecDeque<TurnRunEvent>,
}

impl ActiveTurn {
    fn new(conversation_id: String, turn_id: Option<String>, request_id: Option<String>) -> Self {
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

    fn pop_event(&mut self) -> Option<TurnRunEvent> {
        self.events.pop_front()
    }

    fn drain_events(&mut self) -> Vec<TurnRunEvent> {
        self.events.drain(..).collect()
    }

    fn handle_update(&mut self, update: ClientUpdate) -> ClientResult<()> {
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

    fn accepts_turn(&self, turn_id: Option<&str>) -> bool {
        self.collector.accepts_turn(turn_id)
    }

    fn request_is_complete(&self) -> bool {
        self.request_completed
    }

    fn accept_elicitation(&mut self, elicitation: ElicitationSnapshot) {
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
        self.events.push_back(TurnRunEvent::Elicitation {
            elicitation,
            message_part,
        });
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
        self.events.push_back(TurnRunEvent::Elicitation {
            elicitation,
            message_part,
        });
    }
}

#[derive(Debug)]
struct TurnCollector {
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
    fn new(turn_id: Option<String>) -> Self {
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

    fn accept_delta(&mut self, delta: ClientStreamDelta, events: &mut VecDeque<TurnRunEvent>) {
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
                    let message_part =
                        DisplayMessagePartSnapshot::tool(action_delta_part(action, &content));
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

    fn accept_event(
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
                    action,
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
                    action,
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

    fn review_plan_message_part(&self) -> Option<DisplayMessagePartSnapshot> {
        (!self.plan.is_empty()).then(|| DisplayMessagePartSnapshot::plan(self.plan.clone()))
    }

    fn todo_message_part(&self) -> Option<DisplayMessagePartSnapshot> {
        (!self.todo.is_empty()).then(|| DisplayMessagePartSnapshot::plan(self.todo.clone()))
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
            plan,
            message_part,
        });
    }

    fn accepts_turn(&self, turn_id: Option<&str>) -> bool {
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
        match self.streaming_actions.entry(action_id.clone()) {
            Entry::Vacant(entry) => entry
                .insert(DisplayToolActionSnapshot::from_output_delta(
                    turn_id, action_id, content,
                ))
                .clone(),
            Entry::Occupied(mut entry) => {
                let action = entry.get_mut();
                if !is_terminal_action_phase_label(&action.phase) {
                    action.phase = "streamingResult".to_string();
                }
                action.output.push(content);
                action.output_text = action
                    .output
                    .iter()
                    .map(|item| item.text.as_str())
                    .collect::<Vec<_>>()
                    .join("");
                action.clone()
            }
        }
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

fn is_ordered_stream_event(event: &ClientEvent) -> bool {
    matches!(
        event,
        ClientEvent::ActionObserved { .. }
            | ClientEvent::ActionUpdated { .. }
            | ClientEvent::AssistantDelta { .. }
            | ClientEvent::PlanDelta { .. }
            | ClientEvent::PlanUpdated { .. }
            | ClientEvent::ReasoningDelta { .. }
    )
}

fn action_output_delta_ids(deltas: &[ClientStreamDelta]) -> HashSet<String> {
    deltas
        .iter()
        .filter_map(|delta| match delta {
            ClientStreamDelta::ActionOutputDelta { action_id, .. } => Some(action_id.clone()),
            _ => None,
        })
        .collect()
}

fn action_delta_part(
    mut action: DisplayToolActionSnapshot,
    content: &ActionOutputSnapshot,
) -> DisplayToolActionSnapshot {
    action.output = vec![content.clone()];
    action.output_text = content.text.clone();
    action
}

fn is_terminal_action_phase_label(phase: &str) -> bool {
    matches!(phase, "completed" | "failed" | "declined" | "cancelled")
}

fn is_result_event(event: &TurnRunEvent) -> bool {
    matches!(event, TurnRunEvent::Result { .. })
}

fn current_model(snapshot: &ConversationSnapshot) -> Option<String> {
    snapshot.settings.model_list.current_model_id.clone()
}

fn find_turn(snapshot: &ConversationSnapshot, turn_id: &str) -> Option<TurnSnapshot> {
    snapshot
        .turns
        .iter()
        .find(|turn| turn.id == turn_id)
        .cloned()
}

fn actions_for_turn(snapshot: &ConversationSnapshot, turn_id: &str) -> Vec<ActionSnapshot> {
    snapshot
        .actions
        .iter()
        .filter(|action| action.turn_id == turn_id)
        .cloned()
        .collect()
}

fn assistant_message_for_turn(
    snapshot: &ConversationSnapshot,
    turn_id: &str,
) -> Option<DisplayMessageSnapshot> {
    let message_id = format!("{turn_id}:assistant");
    snapshot
        .messages
        .iter()
        .find(|message| message.id == message_id)
        .cloned()
}

fn turn_run_delta_part(part: &str) -> TurnRunDeltaPart {
    match part {
        "reasoning" => TurnRunDeltaPart::Reasoning,
        _ => TurnRunDeltaPart::Text,
    }
}

fn turn_reasoning_text(turn: Option<&TurnSnapshot>) -> Option<String> {
    let turn = turn?;
    (!turn.reasoning_text.trim().is_empty()).then(|| turn.reasoning_text.clone())
}

fn selected_config_value(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn invalid_input(message: impl Into<String>) -> ClientError {
    ClientError::InvalidInput {
        message: message.into(),
    }
}

fn check_update_fault(update: &ClientUpdate) -> ClientResult<()> {
    for event in &update.events {
        if let ClientEvent::RuntimeFaulted { code, message } = event {
            return Err(ClientError::RuntimeFaulted {
                code: code.clone(),
                message: message.clone(),
            });
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn active_turn_projects_resolved_elicitation_updates() {
        let mut active =
            ActiveTurn::new("conversation".to_string(), Some("turn".to_string()), None);
        active
            .handle_update(ClientUpdate {
                events: vec![ClientEvent::ElicitationOpened {
                    conversation_id: "conversation".to_string(),
                    elicitation: elicitation("open"),
                }],
                ..ClientUpdate::default()
            })
            .unwrap();

        assert!(matches!(
            active.pop_event(),
            Some(TurnRunEvent::Elicitation { .. })
        ));
        active.pending_elicitation_id = None;

        active
            .handle_update(ClientUpdate {
                events: vec![ClientEvent::ElicitationUpdated {
                    conversation_id: "conversation".to_string(),
                    elicitation: elicitation("resolved:Allow"),
                }],
                ..ClientUpdate::default()
            })
            .unwrap();

        assert!(matches!(
            active.pop_event(),
            Some(TurnRunEvent::Elicitation {
                elicitation,
                message_part,
            }) if elicitation.phase == "resolved:Allow"
                && message_part.action.as_ref().is_some_and(|action| {
                    action.id == "elicitation" && action.phase == "completed"
                })
        ));
        assert!(active.pending_elicitation_id.is_none());
    }

    #[test]
    fn active_turn_preserves_action_lifecycle_events() {
        let mut active =
            ActiveTurn::new("conversation".to_string(), Some("turn".to_string()), None);
        active
            .handle_update(ClientUpdate {
                events: vec![
                    ClientEvent::ActionObserved {
                        conversation_id: "conversation".to_string(),
                        action: action("running"),
                    },
                    ClientEvent::ActionUpdated {
                        conversation_id: "conversation".to_string(),
                        action: action("completed"),
                    },
                ],
                ..ClientUpdate::default()
            })
            .unwrap();

        assert!(matches!(
            active.pop_event(),
            Some(TurnRunEvent::ActionObserved { .. })
        ));
        assert!(matches!(
            active.pop_event(),
            Some(TurnRunEvent::ActionUpdated { .. })
        ));
    }

    #[test]
    fn active_turn_waits_for_action_elicitation() {
        let mut active =
            ActiveTurn::new("conversation".to_string(), Some("turn".to_string()), None);
        let mut action = action("awaitingDecision");
        action.elicitation_id = Some("approval".to_string());

        active
            .handle_update(ClientUpdate {
                events: vec![ClientEvent::ActionUpdated {
                    conversation_id: "conversation".to_string(),
                    action,
                }],
                ..ClientUpdate::default()
            })
            .unwrap();

        assert_eq!(active.pending_elicitation_id.as_deref(), Some("approval"));
        assert!(matches!(
            active.pop_event(),
            Some(TurnRunEvent::ActionUpdated { .. })
        ));
    }

    #[test]
    fn active_turn_streams_action_output_deltas_without_full_action_snapshots() {
        let mut active =
            ActiveTurn::new("conversation".to_string(), Some("turn".to_string()), None);

        active
            .handle_update(ClientUpdate {
                events: vec![ClientEvent::ActionObserved {
                    conversation_id: "conversation".to_string(),
                    action: action("running"),
                }],
                ..ClientUpdate::default()
            })
            .unwrap();
        assert!(matches!(
            active.pop_event(),
            Some(TurnRunEvent::ActionObserved { .. })
        ));

        active
            .handle_update(ClientUpdate {
                events: vec![ClientEvent::ActionUpdated {
                    conversation_id: "conversation".to_string(),
                    action: action_with_output("running", "x\n"),
                }],
                stream_deltas: vec![ClientStreamDelta::ActionOutputDelta {
                    conversation_id: "conversation".to_string(),
                    turn_id: "turn".to_string(),
                    action_id: "action".to_string(),
                    content: output("x\n"),
                }],
                ..ClientUpdate::default()
            })
            .unwrap();
        assert!(matches!(
            active.pop_event(),
            Some(TurnRunEvent::ActionOutputDelta {
                content,
                message_part,
                ..
            }) if content.text == "x\n"
                && message_part.action.as_ref().is_some_and(|action| {
                    action.output_text == "x\n"
                        && action.output == vec![output("x\n")]
                })
        ));
        assert!(active.pop_event().is_none());

        active
            .handle_update(ClientUpdate {
                events: vec![ClientEvent::ActionUpdated {
                    conversation_id: "conversation".to_string(),
                    action: action_with_output("running", "x\nxx\n"),
                }],
                stream_deltas: vec![ClientStreamDelta::ActionOutputDelta {
                    conversation_id: "conversation".to_string(),
                    turn_id: "turn".to_string(),
                    action_id: "action".to_string(),
                    content: output("xx\n"),
                }],
                ..ClientUpdate::default()
            })
            .unwrap();
        assert!(matches!(
            active.pop_event(),
            Some(TurnRunEvent::ActionOutputDelta {
                content,
                message_part,
                ..
            }) if content.text == "xx\n"
                && message_part.action.as_ref().is_some_and(|action| {
                    action.output_text == "xx\n"
                        && action.output == vec![output("xx\n")]
                })
        ));
        assert!(active.pop_event().is_none());
    }

    #[test]
    fn no_turn_active_request_completes_from_update() {
        let mut active = ActiveTurn::new(
            "conversation".to_string(),
            None,
            Some("request-1".to_string()),
        );

        assert!(!active.request_is_complete());
        active
            .handle_update(ClientUpdate {
                completed_request_ids: vec!["request-1".to_string()],
                ..ClientUpdate::default()
            })
            .unwrap();

        assert!(active.request_is_complete());
    }

    #[test]
    fn turn_run_result_serializes_empty_actions() {
        let value = serde_json::to_value(TurnRunResult {
            actions: Vec::new(),
            conversation: None,
            message: None,
            model: None,
            reasoning: None,
            remote_thread_id: None,
            text: "done".to_string(),
            turn: None,
            turn_id: None,
        })
        .unwrap();

        assert_eq!(value.get("actions"), Some(&serde_json::json!([])));
    }

    fn elicitation(phase: &str) -> ElicitationSnapshot {
        ElicitationSnapshot {
            action_id: None,
            body: None,
            choices: Vec::new(),
            id: "elicitation".to_string(),
            kind: "approval".to_string(),
            phase: phase.to_string(),
            questions: Vec::new(),
            title: None,
            turn_id: Some("turn".to_string()),
        }
    }

    fn action(phase: &str) -> ActionSnapshot {
        action_with_output(phase, "")
    }

    fn action_with_output(phase: &str, text: &str) -> ActionSnapshot {
        let output = (!text.is_empty())
            .then(|| output(text))
            .into_iter()
            .collect();
        ActionSnapshot {
            elicitation_id: None,
            error: None,
            id: "action".to_string(),
            input_summary: None,
            kind: "command".to_string(),
            output,
            output_text: text.to_string(),
            phase: phase.to_string(),
            raw_input: None,
            title: Some("Shell".to_string()),
            turn_id: "turn".to_string(),
        }
    }

    fn output(text: &str) -> ActionOutputSnapshot {
        ActionOutputSnapshot {
            kind: "text".to_string(),
            text: text.to_string(),
        }
    }
}
