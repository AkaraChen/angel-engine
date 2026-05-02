use std::collections::BTreeMap;

use crate::angel_engine::capabilities::{
    CapabilitySupport, ConversationCapabilities, RuntimeCapabilities,
};
use crate::angel_engine::command::{
    EngineCommand, ResumeTarget, StartConversationParams, TurnOverrides, UserInput,
};
use crate::angel_engine::error::{EngineError, ErrorInfo};
use crate::angel_engine::event::{EngineEvent, TransitionReport, UiEvent};
use crate::angel_engine::ids::{
    ActionId, ConversationId, ElicitationId, JsonRpcRequestId, RemoteConversationId, RemoteTurnId,
    TurnId,
};
use crate::angel_engine::protocol::{
    AcpMethod, CodexMethod, ProtocolEffect, ProtocolFlavor, ProtocolMethod,
};
use crate::angel_engine::state::{
    ActionPhase, ActionState, ContentDelta, ContextPatch, ConversationLifecycle, ConversationState,
    ElicitationDecision, ElicitationPhase, ElicitationState, HistoryMutationOp,
    HistoryMutationResult, HydrationSource, ProvisionOp, RuntimeState, TurnOutcome, TurnPhase,
    TurnState, UserInputRef,
};

#[derive(Clone, Debug)]
pub struct AngelEngine {
    pub runtime: RuntimeState,
    pub selected: Option<ConversationId>,
    pub conversations: BTreeMap<ConversationId, ConversationState>,
    pub pending: PendingTable,
    pub protocol: ProtocolFlavor,
    pub default_capabilities: ConversationCapabilities,
    pub policy: EnginePolicy,
    pub generation: u64,
    id_sequence: u64,
    request_sequence: u64,
    turn_sequence: u64,
}

impl AngelEngine {
    pub fn new(protocol: ProtocolFlavor, default_capabilities: ConversationCapabilities) -> Self {
        Self {
            runtime: RuntimeState::Offline,
            selected: None,
            conversations: BTreeMap::new(),
            pending: PendingTable::default(),
            protocol,
            default_capabilities,
            policy: EnginePolicy::default(),
            generation: 0,
            id_sequence: 0,
            request_sequence: 0,
            turn_sequence: 0,
        }
    }

    pub fn with_available_runtime(
        protocol: ProtocolFlavor,
        runtime_capabilities: RuntimeCapabilities,
        default_capabilities: ConversationCapabilities,
    ) -> Self {
        let mut engine = Self::new(protocol, default_capabilities);
        engine.runtime = RuntimeState::Available {
            capabilities: runtime_capabilities,
        };
        engine
    }

    pub fn plan_command(&mut self, command: EngineCommand) -> Result<CommandPlan, EngineError> {
        match command {
            EngineCommand::Initialize => self.plan_initialize(),
            EngineCommand::Authenticate { method } => self.plan_authenticate(method),
            EngineCommand::DiscoverConversations => self.plan_discover_conversations(),
            EngineCommand::StartConversation { params } => self.plan_start_conversation(params),
            EngineCommand::ResumeConversation { target } => self.plan_resume_conversation(target),
            EngineCommand::ForkConversation { source, at } => {
                self.plan_fork_conversation(source, at)
            }
            EngineCommand::StartTurn {
                conversation_id,
                input,
                overrides,
            } => self.plan_start_turn(conversation_id, input, overrides),
            EngineCommand::SteerTurn {
                conversation_id,
                turn_id,
                input,
            } => self.plan_steer_turn(conversation_id, turn_id, input),
            EngineCommand::CancelTurn {
                conversation_id,
                turn_id,
            } => self.plan_cancel_turn(conversation_id, turn_id),
            EngineCommand::ResolveElicitation {
                conversation_id,
                elicitation_id,
                decision,
            } => self.plan_resolve_elicitation(conversation_id, elicitation_id, decision),
            EngineCommand::UpdateContext {
                conversation_id,
                patch,
            } => self.plan_update_context(conversation_id, patch),
            EngineCommand::MutateHistory {
                conversation_id,
                op,
            } => self.plan_mutate_history(conversation_id, op),
            EngineCommand::RunShellCommand {
                conversation_id,
                command,
            } => self.plan_run_shell_command(conversation_id, command),
            EngineCommand::ArchiveConversation { conversation_id } => {
                self.plan_archive_conversation(conversation_id, true)
            }
            EngineCommand::UnarchiveConversation { conversation_id } => {
                self.plan_archive_conversation(conversation_id, false)
            }
            EngineCommand::CloseConversation { conversation_id } => {
                self.plan_close_conversation(conversation_id)
            }
            EngineCommand::Unsubscribe { conversation_id } => {
                self.plan_unsubscribe(conversation_id)
            }
        }
    }

    pub fn apply_event(&mut self, event: EngineEvent) -> Result<TransitionReport, EngineError> {
        match event {
            EngineEvent::RuntimeNegotiated { capabilities } => {
                self.runtime = RuntimeState::Available { capabilities };
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
                capabilities,
            } => {
                let state = ConversationState::new(
                    id.clone(),
                    remote,
                    ConversationLifecycle::Discovered,
                    capabilities,
                );
                self.conversations.insert(id.clone(), state);
                Ok(TransitionReport::one(UiEvent::ConversationChanged(id)))
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

    fn plan_initialize(&mut self) -> Result<CommandPlan, EngineError> {
        let request_id = self.next_request_id();
        self.runtime = RuntimeState::Negotiating;
        self.pending
            .insert(request_id.clone(), PendingRequest::Initialize)?;
        Ok(CommandPlan {
            effects: vec![
                ProtocolEffect::new(self.protocol, self.method_initialize())
                    .request_id(request_id.clone()),
            ],
            request_id: Some(request_id),
            ..CommandPlan::default()
        })
    }

    fn plan_authenticate(
        &mut self,
        method: crate::angel_engine::AuthMethodId,
    ) -> Result<CommandPlan, EngineError> {
        if !matches!(self.runtime, RuntimeState::AwaitingAuth { .. }) {
            return Err(EngineError::InvalidState {
                expected: "AwaitingAuth".to_string(),
                actual: format!("{:?}", self.runtime),
            });
        }
        let request_id = self.next_request_id();
        self.pending
            .insert(request_id.clone(), PendingRequest::Authenticate)?;
        Ok(CommandPlan {
            effects: vec![
                ProtocolEffect::new(self.protocol, self.method_authenticate())
                    .request_id(request_id.clone())
                    .field("method", method.to_string()),
            ],
            request_id: Some(request_id),
            ..CommandPlan::default()
        })
    }

    fn plan_discover_conversations(&mut self) -> Result<CommandPlan, EngineError> {
        self.ensure_runtime_available()?;
        let request_id = self.next_request_id();
        self.pending
            .insert(request_id.clone(), PendingRequest::DiscoverConversations)?;
        Ok(CommandPlan {
            effects: vec![
                ProtocolEffect::new(self.protocol, self.method_list_conversations())
                    .request_id(request_id.clone()),
            ],
            request_id: Some(request_id),
            ..CommandPlan::default()
        })
    }

    fn plan_start_conversation(
        &mut self,
        params: StartConversationParams,
    ) -> Result<CommandPlan, EngineError> {
        self.ensure_runtime_available()?;
        self.default_capabilities
            .lifecycle
            .create
            .require("conversation.create")?;
        let conversation_id = self.next_conversation_id();
        let request_id = self.next_request_id();
        let remote = RemoteConversationId::Pending(conversation_id.to_string());
        let mut conversation = ConversationState::new(
            conversation_id.clone(),
            remote,
            ConversationLifecycle::Provisioning {
                op: ProvisionOp::New,
            },
            self.default_capabilities.clone(),
        );
        conversation.context.apply_patch(params.context.clone());
        self.conversations
            .insert(conversation_id.clone(), conversation);
        self.selected = Some(conversation_id.clone());
        self.pending.insert(
            request_id.clone(),
            PendingRequest::StartConversation {
                conversation_id: conversation_id.clone(),
            },
        )?;

        let mut effect = ProtocolEffect::new(self.protocol, self.method_start_conversation())
            .request_id(request_id.clone())
            .conversation_id(conversation_id.clone());
        if let Some(cwd) = params.cwd {
            effect = effect.field("cwd", cwd);
        }
        if let Some(service_name) = params.service_name {
            effect = effect.field("serviceName", service_name);
        }
        if params.ephemeral {
            effect = effect.field("ephemeral", "true");
        }
        Ok(CommandPlan {
            effects: vec![effect],
            conversation_id: Some(conversation_id),
            request_id: Some(request_id),
            ..CommandPlan::default()
        })
    }

    fn plan_resume_conversation(
        &mut self,
        target: ResumeTarget,
    ) -> Result<CommandPlan, EngineError> {
        self.ensure_runtime_available()?;
        let (conversation_id, remote, op, method, fields) = match target {
            ResumeTarget::Conversation(conversation_id) => {
                let conversation = self.conversation(&conversation_id)?;
                let remote = conversation.remote.clone();
                (
                    conversation_id,
                    remote,
                    ProvisionOp::Resume,
                    self.method_resume_conversation(false),
                    BTreeMap::new(),
                )
            }
            ResumeTarget::AcpSession {
                session_id,
                load_history,
            } => {
                let conversation_id = self.next_conversation_id();
                let mut fields = BTreeMap::new();
                fields.insert("sessionId".to_string(), session_id.clone());
                (
                    conversation_id,
                    RemoteConversationId::AcpSession(session_id),
                    if load_history {
                        ProvisionOp::Load
                    } else {
                        ProvisionOp::Resume
                    },
                    self.method_resume_conversation(load_history),
                    fields,
                )
            }
            ResumeTarget::CodexThread { thread_id } => {
                let conversation_id = self.next_conversation_id();
                let mut fields = BTreeMap::new();
                fields.insert("threadId".to_string(), thread_id.clone());
                (
                    conversation_id,
                    RemoteConversationId::CodexThread(thread_id),
                    ProvisionOp::Resume,
                    self.method_resume_conversation(false),
                    fields,
                )
            }
            ResumeTarget::Path(path) => {
                let conversation_id = self.next_conversation_id();
                let mut fields = BTreeMap::new();
                fields.insert("path".to_string(), path.clone());
                (
                    conversation_id,
                    RemoteConversationId::Pending(path),
                    ProvisionOp::Resume,
                    self.method_resume_conversation(false),
                    fields,
                )
            }
            ResumeTarget::History(history_id) => {
                let conversation_id = self.next_conversation_id();
                let mut fields = BTreeMap::new();
                fields.insert("history".to_string(), history_id.clone());
                (
                    conversation_id,
                    RemoteConversationId::Pending(history_id),
                    ProvisionOp::Resume,
                    self.method_resume_conversation(false),
                    fields,
                )
            }
        };

        let request_id = self.next_request_id();
        let source = if matches!(op, ProvisionOp::Load) {
            HydrationSource::AcpLoad
        } else {
            HydrationSource::CodexResume
        };
        let state = ConversationState::new(
            conversation_id.clone(),
            remote,
            if matches!(op, ProvisionOp::Load) {
                ConversationLifecycle::Hydrating { source }
            } else {
                ConversationLifecycle::Provisioning { op }
            },
            self.default_capabilities.clone(),
        );
        self.conversations.insert(conversation_id.clone(), state);
        self.selected = Some(conversation_id.clone());
        self.pending.insert(
            request_id.clone(),
            PendingRequest::ResumeConversation {
                conversation_id: conversation_id.clone(),
            },
        )?;

        let mut effect = ProtocolEffect::new(self.protocol, method)
            .request_id(request_id.clone())
            .conversation_id(conversation_id.clone());
        for (key, value) in fields {
            effect = effect.field(key, value);
        }
        Ok(CommandPlan {
            effects: vec![effect],
            conversation_id: Some(conversation_id),
            request_id: Some(request_id),
            ..CommandPlan::default()
        })
    }

    fn plan_fork_conversation(
        &mut self,
        source: ConversationId,
        at: Option<TurnId>,
    ) -> Result<CommandPlan, EngineError> {
        self.ensure_runtime_available()?;
        self.default_capabilities
            .lifecycle
            .fork
            .require("conversation.fork")?;
        self.conversation(&source)?;
        let conversation_id = self.next_conversation_id();
        let request_id = self.next_request_id();
        let state = ConversationState::new(
            conversation_id.clone(),
            RemoteConversationId::Pending(conversation_id.to_string()),
            ConversationLifecycle::Provisioning {
                op: ProvisionOp::Fork,
            },
            self.default_capabilities.clone(),
        );
        self.conversations.insert(conversation_id.clone(), state);
        self.pending.insert(
            request_id.clone(),
            PendingRequest::ForkConversation {
                conversation_id: conversation_id.clone(),
            },
        )?;
        let mut effect = ProtocolEffect::new(self.protocol, self.method_fork_conversation())
            .request_id(request_id.clone())
            .conversation_id(conversation_id.clone())
            .field("sourceConversationId", source.to_string());
        if let Some(turn_id) = at {
            effect = effect.field("atTurnId", turn_id.to_string());
        }
        Ok(CommandPlan {
            effects: vec![effect],
            conversation_id: Some(conversation_id),
            request_id: Some(request_id),
            ..CommandPlan::default()
        })
    }

    fn plan_start_turn(
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

        self.pending.insert(
            request_id.clone(),
            PendingRequest::StartTurn {
                conversation_id: conversation_id.clone(),
                turn_id: turn_id.clone(),
            },
        )?;

        let effect = ProtocolEffect::new(self.protocol, self.method_start_turn())
            .request_id(request_id.clone())
            .conversation_id(conversation_id.clone())
            .turn_id(turn_id.clone())
            .field("input", input_text);
        Ok(CommandPlan {
            effects: vec![effect],
            conversation_id: Some(conversation_id),
            turn_id: Some(turn_id),
            request_id: Some(request_id),
        })
    }

    fn plan_steer_turn(
        &mut self,
        conversation_id: ConversationId,
        turn_id: Option<TurnId>,
        input: Vec<UserInput>,
    ) -> Result<CommandPlan, EngineError> {
        let selected_turn_id = {
            let conversation = self.conversation(&conversation_id)?;
            conversation.capabilities.turn.steer.require("turn.steer")?;
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
            selected
        };

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

    fn plan_cancel_turn(
        &mut self,
        conversation_id: ConversationId,
        turn_id: Option<TurnId>,
    ) -> Result<CommandPlan, EngineError> {
        let selected_turn_id = {
            let conversation = self.conversation(&conversation_id)?;
            conversation
                .capabilities
                .turn
                .cancel
                .require("turn.cancel")?;
            turn_id
                .or_else(|| conversation.primary_active_turn().cloned())
                .ok_or_else(|| EngineError::MissingActiveTurn {
                    conversation_id: conversation_id.to_string(),
                })?
        };
        let request_id = self.next_request_id();
        {
            let conversation = self.conversation_mut(&conversation_id)?;
            if !conversation.active_turns.contains(&selected_turn_id) {
                return Err(EngineError::InvalidState {
                    expected: "active turn".to_string(),
                    actual: selected_turn_id.to_string(),
                });
            }
            conversation.lifecycle = ConversationLifecycle::Cancelling {
                turn_id: selected_turn_id.clone(),
            };
            if let Some(turn) = conversation.turns.get_mut(&selected_turn_id) {
                turn.phase = TurnPhase::Cancelling;
            }
        }
        self.pending.insert(
            request_id.clone(),
            PendingRequest::CancelTurn {
                conversation_id: conversation_id.clone(),
                turn_id: selected_turn_id.clone(),
            },
        )?;
        let effect = ProtocolEffect::new(self.protocol, self.method_cancel_turn())
            .request_id(request_id.clone())
            .conversation_id(conversation_id.clone())
            .turn_id(selected_turn_id.clone());
        Ok(CommandPlan {
            effects: vec![effect],
            conversation_id: Some(conversation_id),
            turn_id: Some(selected_turn_id),
            request_id: Some(request_id),
        })
    }

    fn plan_resolve_elicitation(
        &mut self,
        conversation_id: ConversationId,
        elicitation_id: ElicitationId,
        decision: ElicitationDecision,
    ) -> Result<CommandPlan, EngineError> {
        {
            let conversation = self.conversation_mut(&conversation_id)?;
            let elicitation = conversation
                .elicitations
                .get_mut(&elicitation_id)
                .ok_or_else(|| EngineError::ElicitationNotFound {
                    elicitation_id: elicitation_id.to_string(),
                })?;
            if !matches!(elicitation.phase, ElicitationPhase::Open) {
                return Err(EngineError::InvalidState {
                    expected: "open elicitation".to_string(),
                    actual: format!("{:?}", elicitation.phase),
                });
            }
            elicitation.phase = ElicitationPhase::Resolving;
        }
        let request_id = self.next_request_id();
        self.pending.insert(
            request_id.clone(),
            PendingRequest::ResolveElicitation {
                conversation_id: conversation_id.clone(),
                elicitation_id: elicitation_id.clone(),
            },
        )?;
        let effect = ProtocolEffect::new(self.protocol, self.method_resolve_elicitation())
            .request_id(request_id.clone())
            .conversation_id(conversation_id.clone())
            .field("elicitationId", elicitation_id.to_string())
            .field("decision", format!("{decision:?}"));
        Ok(CommandPlan {
            effects: vec![effect],
            conversation_id: Some(conversation_id),
            request_id: Some(request_id),
            ..CommandPlan::default()
        })
    }

    fn plan_update_context(
        &mut self,
        conversation_id: ConversationId,
        patch: ContextPatch,
    ) -> Result<CommandPlan, EngineError> {
        {
            let conversation = self.conversation_mut(&conversation_id)?;
            if matches!(
                conversation.lifecycle,
                ConversationLifecycle::Closed | ConversationLifecycle::Faulted(_)
            ) {
                return Err(EngineError::InvalidState {
                    expected: "loaded conversation".to_string(),
                    actual: format!("{:?}", conversation.lifecycle),
                });
            }
            conversation.context.apply_patch(patch.clone());
        }
        let request_id = self.next_request_id();
        self.pending.insert(
            request_id.clone(),
            PendingRequest::UpdateContext {
                conversation_id: conversation_id.clone(),
            },
        )?;
        let effect = ProtocolEffect::new(self.protocol, self.method_update_context())
            .request_id(request_id.clone())
            .conversation_id(conversation_id.clone())
            .field("updates", patch.updates.len().to_string());
        Ok(CommandPlan {
            effects: vec![effect],
            conversation_id: Some(conversation_id),
            request_id: Some(request_id),
            ..CommandPlan::default()
        })
    }

    fn plan_mutate_history(
        &mut self,
        conversation_id: ConversationId,
        op: HistoryMutationOp,
    ) -> Result<CommandPlan, EngineError> {
        {
            let conversation = self.conversation(&conversation_id)?;
            match &op {
                HistoryMutationOp::Compact => conversation
                    .capabilities
                    .history
                    .compact
                    .require("history.compact")?,
                HistoryMutationOp::Rollback { .. } => conversation
                    .capabilities
                    .history
                    .rollback
                    .require("history.rollback")?,
                HistoryMutationOp::InjectItems { .. } => conversation
                    .capabilities
                    .history
                    .inject_items
                    .require("history.inject_items")?,
                HistoryMutationOp::ReplaceHistory => {}
            }
            if conversation.active_turn_count() > 0 {
                return Err(EngineError::InvalidState {
                    expected: "idle conversation".to_string(),
                    actual: "active turns present".to_string(),
                });
            }
        }
        let request_id = self.next_request_id();
        {
            let conversation = self.conversation_mut(&conversation_id)?;
            conversation.lifecycle = ConversationLifecycle::MutatingHistory { op: op.clone() };
        }
        self.pending.insert(
            request_id.clone(),
            PendingRequest::HistoryMutation {
                conversation_id: conversation_id.clone(),
            },
        )?;
        let effect = ProtocolEffect::new(self.protocol, self.method_history_mutation(&op))
            .request_id(request_id.clone())
            .conversation_id(conversation_id.clone());
        let effect = match op {
            HistoryMutationOp::Compact | HistoryMutationOp::ReplaceHistory => effect,
            HistoryMutationOp::Rollback { num_turns } => {
                effect.field("numTurns", num_turns.to_string())
            }
            HistoryMutationOp::InjectItems { count } => effect.field("count", count.to_string()),
        };
        Ok(CommandPlan {
            effects: vec![effect],
            conversation_id: Some(conversation_id),
            request_id: Some(request_id),
            ..CommandPlan::default()
        })
    }

    fn plan_run_shell_command(
        &mut self,
        conversation_id: ConversationId,
        command: String,
    ) -> Result<CommandPlan, EngineError> {
        {
            let conversation = self.conversation(&conversation_id)?;
            if !conversation.is_loaded() {
                return Err(EngineError::InvalidState {
                    expected: "loaded conversation".to_string(),
                    actual: format!("{:?}", conversation.lifecycle),
                });
            }
            if self.protocol != ProtocolFlavor::CodexAppServer {
                return Err(EngineError::CapabilityUnsupported {
                    capability: "thread.shell_command".to_string(),
                });
            }
        }
        let request_id = self.next_request_id();
        self.pending.insert(
            request_id.clone(),
            PendingRequest::RunShellCommand {
                conversation_id: conversation_id.clone(),
            },
        )?;
        let effect = ProtocolEffect::new(
            self.protocol,
            ProtocolMethod::Codex(CodexMethod::ThreadShellCommand),
        )
        .request_id(request_id.clone())
        .conversation_id(conversation_id.clone())
        .field("command", command);
        Ok(CommandPlan {
            effects: vec![effect],
            conversation_id: Some(conversation_id),
            request_id: Some(request_id),
            ..CommandPlan::default()
        })
    }

    fn plan_archive_conversation(
        &mut self,
        conversation_id: ConversationId,
        archive: bool,
    ) -> Result<CommandPlan, EngineError> {
        {
            let conversation = self.conversation(&conversation_id)?;
            conversation
                .capabilities
                .lifecycle
                .archive
                .require("conversation.archive")?;
        }
        let request_id = self.next_request_id();
        let method = match (self.protocol, archive) {
            (ProtocolFlavor::CodexAppServer, true) => {
                ProtocolMethod::Codex(CodexMethod::ThreadArchive)
            }
            (ProtocolFlavor::CodexAppServer, false) => {
                ProtocolMethod::Codex(CodexMethod::ThreadUnarchive)
            }
            (_, _) => ProtocolMethod::Extension(if archive {
                "conversation/archive".to_string()
            } else {
                "conversation/unarchive".to_string()
            }),
        };
        let effect = ProtocolEffect::new(self.protocol, method)
            .request_id(request_id.clone())
            .conversation_id(conversation_id.clone());
        Ok(CommandPlan {
            effects: vec![effect],
            conversation_id: Some(conversation_id),
            request_id: Some(request_id),
            ..CommandPlan::default()
        })
    }

    fn plan_close_conversation(
        &mut self,
        conversation_id: ConversationId,
    ) -> Result<CommandPlan, EngineError> {
        {
            let conversation = self.conversation(&conversation_id)?;
            conversation
                .capabilities
                .lifecycle
                .close
                .require("conversation.close")?;
        }
        let request_id = self.next_request_id();
        {
            let conversation = self.conversation_mut(&conversation_id)?;
            conversation.lifecycle = ConversationLifecycle::Closing;
        }
        let effect = ProtocolEffect::new(self.protocol, self.method_close_conversation())
            .request_id(request_id.clone())
            .conversation_id(conversation_id.clone());
        Ok(CommandPlan {
            effects: vec![effect],
            conversation_id: Some(conversation_id),
            request_id: Some(request_id),
            ..CommandPlan::default()
        })
    }

    fn plan_unsubscribe(
        &mut self,
        conversation_id: ConversationId,
    ) -> Result<CommandPlan, EngineError> {
        {
            let conversation = self.conversation(&conversation_id)?;
            conversation
                .capabilities
                .observer
                .unsubscribe
                .require("observer.unsubscribe")?;
        }
        let request_id = self.next_request_id();
        {
            let conversation = self.conversation_mut(&conversation_id)?;
            conversation.observer.subscribed = false;
        }
        let effect = ProtocolEffect::new(self.protocol, self.method_unsubscribe())
            .request_id(request_id.clone())
            .conversation_id(conversation_id.clone());
        Ok(CommandPlan {
            effects: vec![effect],
            conversation_id: Some(conversation_id),
            request_id: Some(request_id),
            ..CommandPlan::default()
        })
    }

    fn apply_turn_started(
        &mut self,
        conversation_id: ConversationId,
        turn_id: TurnId,
        remote: RemoteTurnId,
        input: Vec<UserInputRef>,
    ) -> Result<TransitionReport, EngineError> {
        let generation = self.generation;
        let conversation = self.conversation_mut(&conversation_id)?;
        if let Some(existing) = conversation.turns.get_mut(&turn_id) {
            existing.remote = remote;
            existing.input.extend(input);
            if !existing.is_terminal() {
                existing.phase = TurnPhase::Starting;
            }
        } else {
            let mut turn = TurnState::new(turn_id.clone(), remote, generation);
            turn.input = input;
            conversation.turns.insert(turn_id.clone(), turn);
        }
        conversation.active_turns.insert(turn_id.clone());
        conversation.focused_turn = Some(turn_id.clone());
        conversation.lifecycle = ConversationLifecycle::Active;
        Ok(TransitionReport::one(UiEvent::TurnChanged {
            conversation_id,
            turn_id,
        }))
    }

    fn apply_content_delta(
        &mut self,
        conversation_id: ConversationId,
        turn_id: TurnId,
        delta: ContentDelta,
        kind: DeltaKind,
    ) -> Result<TransitionReport, EngineError> {
        let invalid_event_policy = self.policy.invalid_event_policy;
        let conversation = self.conversation_mut(&conversation_id)?;
        let turn =
            conversation
                .turns
                .get_mut(&turn_id)
                .ok_or_else(|| EngineError::TurnNotFound {
                    turn_id: turn_id.to_string(),
                })?;
        if turn.is_terminal() {
            return handle_stale_with_policy(
                invalid_event_policy,
                format!("delta arrived for terminal turn {turn_id}"),
            );
        }
        match kind {
            DeltaKind::Assistant => {
                turn.output.chunks.push(delta);
                turn.phase = TurnPhase::StreamingOutput;
            }
            DeltaKind::Reasoning => {
                turn.reasoning.chunks.push(delta);
                turn.phase = TurnPhase::Reasoning;
            }
        }
        Ok(TransitionReport::one(UiEvent::TurnChanged {
            conversation_id,
            turn_id,
        }))
    }

    fn apply_turn_terminal(
        &mut self,
        conversation_id: ConversationId,
        turn_id: TurnId,
        outcome: TurnOutcome,
    ) -> Result<TransitionReport, EngineError> {
        let conversation = self.conversation_mut(&conversation_id)?;
        let turn =
            conversation
                .turns
                .get_mut(&turn_id)
                .ok_or_else(|| EngineError::TurnNotFound {
                    turn_id: turn_id.to_string(),
                })?;
        turn.phase = TurnPhase::Terminal(outcome.clone());
        turn.outcome = Some(outcome);
        turn.completed_at = Some(turn.completed_at.unwrap_or(turn.started_at + 1));
        conversation.active_turns.remove(&turn_id);
        if conversation.focused_turn.as_ref() == Some(&turn_id) {
            conversation.focused_turn = conversation.active_turns.iter().next_back().cloned();
        }

        for action in conversation.actions.values_mut() {
            if action.turn_id == turn_id && !is_terminal_action_phase(&action.phase) {
                action.phase = match action.phase {
                    ActionPhase::AwaitingDecision { .. } => ActionPhase::Cancelled,
                    _ => ActionPhase::Completed,
                };
            }
        }
        for elicitation in conversation.elicitations.values_mut() {
            if elicitation.turn_id.as_ref() == Some(&turn_id)
                && matches!(
                    elicitation.phase,
                    ElicitationPhase::Open | ElicitationPhase::Resolving
                )
            {
                elicitation.phase = ElicitationPhase::Cancelled;
            }
        }

        if conversation.active_turns.is_empty() {
            conversation.lifecycle = ConversationLifecycle::Idle;
        } else {
            conversation.lifecycle = ConversationLifecycle::Active;
        }
        Ok(TransitionReport::one(UiEvent::TurnChanged {
            conversation_id,
            turn_id,
        }))
    }

    fn apply_action_observed(
        &mut self,
        conversation_id: ConversationId,
        action: ActionState,
    ) -> Result<TransitionReport, EngineError> {
        let action_id = action.id.clone();
        let turn_id = action.turn_id.clone();
        let conversation = self.conversation_mut(&conversation_id)?;
        if !conversation.turns.contains_key(&turn_id) {
            return Err(EngineError::TurnNotFound {
                turn_id: turn_id.to_string(),
            });
        }
        conversation.actions.insert(action_id.clone(), action);
        if let Some(turn) = conversation.turns.get_mut(&turn_id)
            && !turn.is_terminal()
        {
            turn.phase = TurnPhase::Acting {
                action_id: action_id.clone(),
            };
        }
        Ok(TransitionReport::one(UiEvent::ActionChanged {
            conversation_id,
            action_id,
        }))
    }

    fn apply_action_updated(
        &mut self,
        conversation_id: ConversationId,
        action_id: ActionId,
        patch: crate::angel_engine::ActionPatch,
    ) -> Result<TransitionReport, EngineError> {
        let conversation = self.conversation_mut(&conversation_id)?;
        let action = conversation.actions.get_mut(&action_id).ok_or_else(|| {
            EngineError::ActionNotFound {
                action_id: action_id.to_string(),
            }
        })?;
        if let Some(phase) = patch.phase {
            action.phase = phase;
        }
        if let Some(output_delta) = patch.output_delta {
            action.output.chunks.push(output_delta);
            if !is_terminal_action_phase(&action.phase) {
                action.phase = ActionPhase::StreamingResult;
            }
        }
        if let Some(error) = patch.error {
            action.error = Some(error);
            action.phase = ActionPhase::Failed;
        }
        if let Some(title) = patch.title {
            action.title = Some(title);
        }
        Ok(TransitionReport::one(UiEvent::ActionChanged {
            conversation_id,
            action_id,
        }))
    }

    fn apply_elicitation_opened(
        &mut self,
        conversation_id: ConversationId,
        elicitation: ElicitationState,
    ) -> Result<TransitionReport, EngineError> {
        let elicitation_id = elicitation.id.clone();
        let turn_id = elicitation.turn_id.clone();
        let action_id = elicitation.action_id.clone();
        let conversation = self.conversation_mut(&conversation_id)?;
        if let Some(action_id) = action_id {
            let action = conversation.actions.get_mut(&action_id).ok_or_else(|| {
                EngineError::ActionNotFound {
                    action_id: action_id.to_string(),
                }
            })?;
            action.phase = ActionPhase::AwaitingDecision {
                elicitation_id: elicitation_id.clone(),
            };
        }
        if let Some(turn_id) = turn_id {
            let turn =
                conversation
                    .turns
                    .get_mut(&turn_id)
                    .ok_or_else(|| EngineError::TurnNotFound {
                        turn_id: turn_id.to_string(),
                    })?;
            if !turn.is_terminal() {
                turn.phase = TurnPhase::AwaitingUser {
                    elicitation_id: elicitation_id.clone(),
                };
            }
        }
        conversation
            .elicitations
            .insert(elicitation_id.clone(), elicitation);
        conversation.lifecycle = ConversationLifecycle::Active;
        Ok(TransitionReport::one(UiEvent::ElicitationChanged {
            conversation_id,
            elicitation_id,
        }))
    }

    fn apply_elicitation_resolved(
        &mut self,
        conversation_id: ConversationId,
        elicitation_id: ElicitationId,
        decision: ElicitationDecision,
    ) -> Result<TransitionReport, EngineError> {
        let conversation = self.conversation_mut(&conversation_id)?;
        let elicitation = conversation
            .elicitations
            .get_mut(&elicitation_id)
            .ok_or_else(|| EngineError::ElicitationNotFound {
                elicitation_id: elicitation_id.to_string(),
            })?;
        elicitation.phase = ElicitationPhase::Resolved {
            decision: decision.clone(),
        };
        if let Some(action_id) = elicitation.action_id.clone()
            && let Some(action) = conversation.actions.get_mut(&action_id)
        {
            action.phase = match decision {
                ElicitationDecision::Allow
                | ElicitationDecision::AllowForSession
                | ElicitationDecision::Answers(_)
                | ElicitationDecision::DynamicToolResult { success: true }
                | ElicitationDecision::PermissionGrant { .. }
                | ElicitationDecision::ExternalComplete => ActionPhase::Running,
                ElicitationDecision::Deny
                | ElicitationDecision::DynamicToolResult { success: false } => {
                    ActionPhase::Declined
                }
                ElicitationDecision::Cancel => ActionPhase::Cancelled,
                ElicitationDecision::Raw(_) => ActionPhase::Running,
            };
        }
        if let Some(turn_id) = elicitation.turn_id.clone()
            && let Some(turn) = conversation.turns.get_mut(&turn_id)
            && !turn.is_terminal()
        {
            turn.phase = TurnPhase::Reasoning;
        }
        Ok(TransitionReport::one(UiEvent::ElicitationChanged {
            conversation_id,
            elicitation_id,
        }))
    }

    fn apply_history_mutation_finished(
        &mut self,
        conversation_id: ConversationId,
        result: HistoryMutationResult,
    ) -> Result<TransitionReport, EngineError> {
        let conversation = self.conversation_mut(&conversation_id)?;
        conversation.history.workspace_reverted = Some(result.workspace_reverted);
        if result.success {
            conversation.lifecycle = ConversationLifecycle::Idle;
        } else {
            conversation.lifecycle = ConversationLifecycle::Faulted(ErrorInfo::new(
                "history.mutation_failed",
                result
                    .message
                    .unwrap_or_else(|| "history mutation failed".to_string()),
            ));
        }
        Ok(TransitionReport::one(UiEvent::HistoryChanged(
            conversation_id,
        )))
    }

    fn ensure_runtime_available(&self) -> Result<(), EngineError> {
        match self.runtime {
            RuntimeState::Available { .. } => Ok(()),
            _ => Err(EngineError::RuntimeUnavailable {
                actual: format!("{:?}", self.runtime),
            }),
        }
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

    fn method_initialize(&self) -> ProtocolMethod {
        match self.protocol {
            ProtocolFlavor::Acp => ProtocolMethod::Acp(AcpMethod::Initialize),
            ProtocolFlavor::CodexAppServer => ProtocolMethod::Codex(CodexMethod::Initialize),
        }
    }

    fn method_authenticate(&self) -> ProtocolMethod {
        match self.protocol {
            ProtocolFlavor::Acp => ProtocolMethod::Acp(AcpMethod::Authenticate),
            ProtocolFlavor::CodexAppServer => {
                ProtocolMethod::Extension("account/login/start".to_string())
            }
        }
    }

    fn method_list_conversations(&self) -> ProtocolMethod {
        match self.protocol {
            ProtocolFlavor::Acp => ProtocolMethod::Acp(AcpMethod::SessionList),
            ProtocolFlavor::CodexAppServer => ProtocolMethod::Codex(CodexMethod::ThreadList),
        }
    }

    fn method_start_conversation(&self) -> ProtocolMethod {
        match self.protocol {
            ProtocolFlavor::Acp => ProtocolMethod::Acp(AcpMethod::SessionNew),
            ProtocolFlavor::CodexAppServer => ProtocolMethod::Codex(CodexMethod::ThreadStart),
        }
    }

    fn method_resume_conversation(&self, load_history: bool) -> ProtocolMethod {
        match self.protocol {
            ProtocolFlavor::Acp if load_history => ProtocolMethod::Acp(AcpMethod::SessionLoad),
            ProtocolFlavor::Acp => ProtocolMethod::Acp(AcpMethod::SessionResume),
            ProtocolFlavor::CodexAppServer => ProtocolMethod::Codex(CodexMethod::ThreadResume),
        }
    }

    fn method_fork_conversation(&self) -> ProtocolMethod {
        match self.protocol {
            ProtocolFlavor::Acp => ProtocolMethod::Extension("session/fork".to_string()),
            ProtocolFlavor::CodexAppServer => ProtocolMethod::Codex(CodexMethod::ThreadFork),
        }
    }

    fn method_start_turn(&self) -> ProtocolMethod {
        match self.protocol {
            ProtocolFlavor::Acp => ProtocolMethod::Acp(AcpMethod::SessionPrompt),
            ProtocolFlavor::CodexAppServer => ProtocolMethod::Codex(CodexMethod::TurnStart),
        }
    }

    fn method_steer_turn(
        &self,
        conversation_id: &ConversationId,
    ) -> Result<ProtocolMethod, EngineError> {
        match self.protocol {
            ProtocolFlavor::CodexAppServer => Ok(ProtocolMethod::Codex(CodexMethod::TurnSteer)),
            ProtocolFlavor::Acp => {
                let conversation = self.conversation(conversation_id)?;
                match &conversation.capabilities.turn.steer {
                    CapabilitySupport::Extension { name } => {
                        Ok(ProtocolMethod::Extension(name.clone()))
                    }
                    CapabilitySupport::Supported => {
                        Ok(ProtocolMethod::Extension("session/steer".to_string()))
                    }
                    other => Err(EngineError::CapabilityUnsupported {
                        capability: format!("turn.steer ({other:?})"),
                    }),
                }
            }
        }
    }

    fn method_cancel_turn(&self) -> ProtocolMethod {
        match self.protocol {
            ProtocolFlavor::Acp => ProtocolMethod::Acp(AcpMethod::SessionCancel),
            ProtocolFlavor::CodexAppServer => ProtocolMethod::Codex(CodexMethod::TurnInterrupt),
        }
    }

    fn method_resolve_elicitation(&self) -> ProtocolMethod {
        match self.protocol {
            ProtocolFlavor::Acp => ProtocolMethod::Acp(AcpMethod::RequestPermissionResponse),
            ProtocolFlavor::CodexAppServer => {
                ProtocolMethod::Codex(CodexMethod::ServerRequestResponse)
            }
        }
    }

    fn method_update_context(&self) -> ProtocolMethod {
        match self.protocol {
            ProtocolFlavor::Acp => ProtocolMethod::Acp(AcpMethod::SetSessionConfigOption),
            ProtocolFlavor::CodexAppServer => ProtocolMethod::Codex(CodexMethod::ConfigWrite),
        }
    }

    fn method_history_mutation(&self, op: &HistoryMutationOp) -> ProtocolMethod {
        match (self.protocol, op) {
            (ProtocolFlavor::CodexAppServer, HistoryMutationOp::Compact) => {
                ProtocolMethod::Codex(CodexMethod::ThreadCompactStart)
            }
            (ProtocolFlavor::CodexAppServer, HistoryMutationOp::Rollback { .. }) => {
                ProtocolMethod::Codex(CodexMethod::ThreadRollback)
            }
            (ProtocolFlavor::CodexAppServer, HistoryMutationOp::InjectItems { .. }) => {
                ProtocolMethod::Codex(CodexMethod::ThreadInjectItems)
            }
            _ => ProtocolMethod::Extension("history/mutate".to_string()),
        }
    }

    fn method_close_conversation(&self) -> ProtocolMethod {
        match self.protocol {
            ProtocolFlavor::Acp => ProtocolMethod::Acp(AcpMethod::SessionClose),
            ProtocolFlavor::CodexAppServer => ProtocolMethod::Extension("thread/close".to_string()),
        }
    }

    fn method_unsubscribe(&self) -> ProtocolMethod {
        match self.protocol {
            ProtocolFlavor::Acp => ProtocolMethod::Extension("session/unsubscribe".to_string()),
            ProtocolFlavor::CodexAppServer => ProtocolMethod::Codex(CodexMethod::ThreadUnsubscribe),
        }
    }

    fn conversation(
        &self,
        conversation_id: &ConversationId,
    ) -> Result<&ConversationState, EngineError> {
        self.conversations
            .get(conversation_id)
            .ok_or_else(|| EngineError::ConversationNotFound {
                conversation_id: conversation_id.to_string(),
            })
    }

    fn conversation_mut(
        &mut self,
        conversation_id: &ConversationId,
    ) -> Result<&mut ConversationState, EngineError> {
        self.conversations.get_mut(conversation_id).ok_or_else(|| {
            EngineError::ConversationNotFound {
                conversation_id: conversation_id.to_string(),
            }
        })
    }

    fn next_conversation_id(&mut self) -> ConversationId {
        self.id_sequence += 1;
        ConversationId::new(format!("conv-{}", self.id_sequence))
    }

    fn next_turn_id(&mut self) -> TurnId {
        self.id_sequence += 1;
        TurnId::new(format!("turn-{}", self.id_sequence))
    }

    fn next_request_id(&mut self) -> JsonRpcRequestId {
        self.request_sequence += 1;
        JsonRpcRequestId::new(format!("req-{}", self.request_sequence))
    }

    fn next_turn_sequence(&mut self) -> u64 {
        self.turn_sequence += 1;
        self.turn_sequence
    }
}

#[derive(Clone, Debug, Default)]
pub struct PendingTable {
    pub requests: BTreeMap<JsonRpcRequestId, PendingRequest>,
}

impl PendingTable {
    pub fn insert(
        &mut self,
        request_id: JsonRpcRequestId,
        request: PendingRequest,
    ) -> Result<(), EngineError> {
        if self.requests.contains_key(&request_id) {
            return Err(EngineError::DuplicateId {
                id: request_id.to_string(),
            });
        }
        self.requests.insert(request_id, request);
        Ok(())
    }

    pub fn remove(&mut self, request_id: &JsonRpcRequestId) -> Option<PendingRequest> {
        self.requests.remove(request_id)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PendingRequest {
    Initialize,
    Authenticate,
    DiscoverConversations,
    StartConversation {
        conversation_id: ConversationId,
    },
    ResumeConversation {
        conversation_id: ConversationId,
    },
    ForkConversation {
        conversation_id: ConversationId,
    },
    StartTurn {
        conversation_id: ConversationId,
        turn_id: TurnId,
    },
    SteerTurn {
        conversation_id: ConversationId,
        turn_id: TurnId,
    },
    CancelTurn {
        conversation_id: ConversationId,
        turn_id: TurnId,
    },
    ResolveElicitation {
        conversation_id: ConversationId,
        elicitation_id: ElicitationId,
    },
    UpdateContext {
        conversation_id: ConversationId,
    },
    HistoryMutation {
        conversation_id: ConversationId,
    },
    RunShellCommand {
        conversation_id: ConversationId,
    },
}

#[derive(Clone, Debug)]
pub struct EnginePolicy {
    pub invalid_event_policy: InvalidEventPolicy,
}

impl Default for EnginePolicy {
    fn default() -> Self {
        Self {
            invalid_event_policy: InvalidEventPolicy::StrictError,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InvalidEventPolicy {
    StrictError,
    IgnoreStale,
    RecordFault,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct CommandPlan {
    pub effects: Vec<ProtocolEffect>,
    pub conversation_id: Option<ConversationId>,
    pub turn_id: Option<TurnId>,
    pub request_id: Option<JsonRpcRequestId>,
}

#[derive(Clone, Copy, Debug)]
enum DeltaKind {
    Assistant,
    Reasoning,
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

fn is_terminal_action_phase(phase: &ActionPhase) -> bool {
    matches!(
        phase,
        ActionPhase::Completed
            | ActionPhase::Failed
            | ActionPhase::Declined
            | ActionPhase::Cancelled
    )
}

fn handle_stale_with_policy<T>(
    invalid_event_policy: InvalidEventPolicy,
    message: String,
) -> Result<T, EngineError>
where
    T: Default,
{
    match invalid_event_policy {
        InvalidEventPolicy::StrictError | InvalidEventPolicy::RecordFault => {
            Err(EngineError::StaleEvent { message })
        }
        InvalidEventPolicy::IgnoreStale => Ok(T::default()),
    }
}

#[cfg(test)]
mod tests {
    use crate::angel_engine::adapters::acp::{AcpAdapter, AcpStopReason};
    use crate::angel_engine::adapters::codex::CodexAdapter;
    use crate::angel_engine::capabilities::{ConversationCapabilities, RuntimeCapabilities};
    use crate::angel_engine::command::{EngineCommand, TurnOverrides, UserInput};
    use crate::angel_engine::event::EngineEvent;
    use crate::angel_engine::ids::{
        ActionId, ConversationId, ElicitationId, JsonRpcRequestId, RemoteConversationId,
        RemoteRequestId, TurnId,
    };
    use crate::angel_engine::protocol::{CodexMethod, ProtocolFlavor, ProtocolMethod};
    use crate::angel_engine::state::{
        ActionKind, ActionPhase, ActionState, ContentDelta, ConversationLifecycle,
        ElicitationDecision, ElicitationKind, ElicitationPhase, ElicitationState,
        HistoryMutationOp, HistoryMutationResult, TurnOutcome, TurnPhase,
    };

    use super::{AngelEngine, EngineError, EnginePolicy, InvalidEventPolicy};

    fn runtime(name: &str) -> RuntimeCapabilities {
        RuntimeCapabilities::new(name)
    }

    fn engine_with(
        protocol: ProtocolFlavor,
        capabilities: ConversationCapabilities,
    ) -> AngelEngine {
        AngelEngine::with_available_runtime(protocol, runtime("test"), capabilities)
    }

    fn insert_ready_conversation(
        engine: &mut AngelEngine,
        id: &str,
        remote: RemoteConversationId,
        capabilities: ConversationCapabilities,
    ) -> ConversationId {
        let id = ConversationId::new(id);
        let state = crate::angel_engine::ConversationState::new(
            id.clone(),
            remote,
            ConversationLifecycle::Idle,
            capabilities,
        );
        engine.conversations.insert(id.clone(), state);
        engine.selected = Some(id.clone());
        id
    }

    fn start_turn(engine: &mut AngelEngine, conversation_id: ConversationId) -> TurnId {
        engine
            .plan_command(EngineCommand::StartTurn {
                conversation_id,
                input: vec![UserInput::text("hello")],
                overrides: TurnOverrides::default(),
            })
            .expect("start turn")
            .turn_id
            .expect("turn id")
    }

    #[test]
    fn acp_standard_steer_is_capability_unsupported() {
        let adapter = AcpAdapter::standard();
        let mut engine = engine_with(ProtocolFlavor::Acp, adapter.capabilities());
        let conversation_id = insert_ready_conversation(
            &mut engine,
            "conv",
            RemoteConversationId::AcpSession("sess".to_string()),
            adapter.capabilities(),
        );
        start_turn(&mut engine, conversation_id.clone());

        let err = engine
            .plan_command(EngineCommand::SteerTurn {
                conversation_id,
                turn_id: None,
                input: vec![UserInput::text("extra")],
            })
            .expect_err("standard ACP does not support steer");
        assert!(matches!(
            err,
            EngineError::CapabilityUnsupported { capability } if capability == "turn.steer"
        ));
    }

    #[test]
    fn acp_extension_steer_uses_extension_method() {
        let adapter = AcpAdapter::with_steer_extension("acp/session/steer");
        let mut engine = engine_with(ProtocolFlavor::Acp, adapter.capabilities());
        let conversation_id = insert_ready_conversation(
            &mut engine,
            "conv",
            RemoteConversationId::AcpSession("sess".to_string()),
            adapter.capabilities(),
        );
        let turn_id = start_turn(&mut engine, conversation_id.clone());

        let plan = engine
            .plan_command(EngineCommand::SteerTurn {
                conversation_id,
                turn_id: None,
                input: vec![UserInput::text("extra")],
            })
            .expect("extension steer");
        assert_eq!(plan.turn_id, Some(turn_id));
        assert!(matches!(
            &plan.effects[0].method,
            ProtocolMethod::Extension(name) if name == "acp/session/steer"
        ));
    }

    #[test]
    fn codex_standard_steer_uses_turn_steer() {
        let adapter = CodexAdapter::app_server();
        let mut engine = engine_with(ProtocolFlavor::CodexAppServer, adapter.capabilities());
        let conversation_id = insert_ready_conversation(
            &mut engine,
            "conv",
            RemoteConversationId::CodexThread("thread".to_string()),
            adapter.capabilities(),
        );
        start_turn(&mut engine, conversation_id.clone());

        let plan = engine
            .plan_command(EngineCommand::SteerTurn {
                conversation_id,
                turn_id: None,
                input: vec![UserInput::text("extra")],
            })
            .expect("codex steer");
        assert!(matches!(
            &plan.effects[0].method,
            ProtocolMethod::Codex(CodexMethod::TurnSteer)
        ));
    }

    #[test]
    fn codex_shell_command_uses_thread_shell_command() {
        let adapter = CodexAdapter::app_server();
        let mut engine = engine_with(ProtocolFlavor::CodexAppServer, adapter.capabilities());
        let conversation_id = insert_ready_conversation(
            &mut engine,
            "conv",
            RemoteConversationId::CodexThread("thread".to_string()),
            adapter.capabilities(),
        );

        let plan = engine
            .plan_command(EngineCommand::RunShellCommand {
                conversation_id,
                command: "echo hello".to_string(),
            })
            .expect("codex shell command");
        assert!(matches!(
            &plan.effects[0].method,
            ProtocolMethod::Codex(CodexMethod::ThreadShellCommand)
        ));
        assert_eq!(
            plan.effects[0].payload.fields.get("command"),
            Some(&"echo hello".to_string())
        );
    }

    #[test]
    fn active_turn_limit_blocks_second_start_by_default() {
        let adapter = CodexAdapter::app_server();
        let mut engine = engine_with(ProtocolFlavor::CodexAppServer, adapter.capabilities());
        let conversation_id = insert_ready_conversation(
            &mut engine,
            "conv",
            RemoteConversationId::CodexThread("thread".to_string()),
            adapter.capabilities(),
        );
        start_turn(&mut engine, conversation_id.clone());

        let err = engine
            .plan_command(EngineCommand::StartTurn {
                conversation_id,
                input: vec![UserInput::text("second")],
                overrides: TurnOverrides::default(),
            })
            .expect_err("single active turn by default");
        assert!(matches!(err, EngineError::InvalidState { .. }));
    }

    #[test]
    fn cancel_is_two_phase_until_terminal_event() {
        let adapter = CodexAdapter::app_server();
        let mut engine = engine_with(ProtocolFlavor::CodexAppServer, adapter.capabilities());
        let conversation_id = insert_ready_conversation(
            &mut engine,
            "conv",
            RemoteConversationId::CodexThread("thread".to_string()),
            adapter.capabilities(),
        );
        let turn_id = start_turn(&mut engine, conversation_id.clone());

        engine
            .plan_command(EngineCommand::CancelTurn {
                conversation_id: conversation_id.clone(),
                turn_id: None,
            })
            .expect("cancel");
        let conversation = engine.conversations.get(&conversation_id).unwrap();
        assert!(matches!(
            conversation.lifecycle,
            ConversationLifecycle::Cancelling { .. }
        ));
        assert!(matches!(
            conversation.turns.get(&turn_id).unwrap().phase,
            TurnPhase::Cancelling
        ));

        engine
            .apply_event(EngineEvent::TurnTerminal {
                conversation_id: conversation_id.clone(),
                turn_id: turn_id.clone(),
                outcome: TurnOutcome::Interrupted,
            })
            .expect("terminal");
        let conversation = engine.conversations.get(&conversation_id).unwrap();
        assert_eq!(conversation.lifecycle, ConversationLifecycle::Idle);
        assert!(conversation.active_turns.is_empty());
    }

    #[test]
    fn elicitation_drives_action_and_turn_overlay() {
        let adapter = CodexAdapter::app_server();
        let mut engine = engine_with(ProtocolFlavor::CodexAppServer, adapter.capabilities());
        let conversation_id = insert_ready_conversation(
            &mut engine,
            "conv",
            RemoteConversationId::CodexThread("thread".to_string()),
            adapter.capabilities(),
        );
        let turn_id = start_turn(&mut engine, conversation_id.clone());
        let action_id = ActionId::new("action");
        let action = ActionState::new(action_id.clone(), turn_id.clone(), ActionKind::Command);
        engine
            .apply_event(EngineEvent::ActionObserved {
                conversation_id: conversation_id.clone(),
                action,
            })
            .expect("action");

        let elicitation_id = ElicitationId::new("approval");
        let mut elicitation = ElicitationState::new(
            elicitation_id.clone(),
            RemoteRequestId::Codex(JsonRpcRequestId::new("request")),
            ElicitationKind::Approval,
        );
        elicitation.turn_id = Some(turn_id.clone());
        elicitation.action_id = Some(action_id.clone());
        engine
            .apply_event(EngineEvent::ElicitationOpened {
                conversation_id: conversation_id.clone(),
                elicitation,
            })
            .expect("open");

        let conversation = engine.conversations.get(&conversation_id).unwrap();
        assert!(matches!(
            conversation.actions.get(&action_id).unwrap().phase,
            ActionPhase::AwaitingDecision { .. }
        ));
        assert!(matches!(
            conversation.turns.get(&turn_id).unwrap().phase,
            TurnPhase::AwaitingUser { .. }
        ));

        engine
            .apply_event(EngineEvent::ElicitationResolved {
                conversation_id: conversation_id.clone(),
                elicitation_id: elicitation_id.clone(),
                decision: ElicitationDecision::Allow,
            })
            .expect("resolve");
        let conversation = engine.conversations.get(&conversation_id).unwrap();
        assert_eq!(
            conversation.actions.get(&action_id).unwrap().phase,
            ActionPhase::Running
        );
        assert!(matches!(
            conversation
                .elicitations
                .get(&elicitation_id)
                .unwrap()
                .phase,
            ElicitationPhase::Resolved { .. }
        ));
    }

    #[test]
    fn codex_rollback_marks_workspace_not_reverted() {
        let adapter = CodexAdapter::app_server();
        let mut engine = engine_with(ProtocolFlavor::CodexAppServer, adapter.capabilities());
        let conversation_id = insert_ready_conversation(
            &mut engine,
            "conv",
            RemoteConversationId::CodexThread("thread".to_string()),
            adapter.capabilities(),
        );

        let plan = engine
            .plan_command(EngineCommand::MutateHistory {
                conversation_id: conversation_id.clone(),
                op: HistoryMutationOp::Rollback { num_turns: 1 },
            })
            .expect("rollback");
        assert!(matches!(
            &plan.effects[0].method,
            ProtocolMethod::Codex(CodexMethod::ThreadRollback)
        ));

        engine
            .apply_event(EngineEvent::HistoryMutationFinished {
                conversation_id: conversation_id.clone(),
                result: HistoryMutationResult {
                    success: true,
                    workspace_reverted: false,
                    message: None,
                },
            })
            .expect("rollback finished");
        let conversation = engine.conversations.get(&conversation_id).unwrap();
        assert_eq!(conversation.lifecycle, ConversationLifecycle::Idle);
        assert_eq!(conversation.history.workspace_reverted, Some(false));
    }

    #[test]
    fn ignore_stale_delta_does_not_revive_terminal_turn() {
        let adapter = CodexAdapter::app_server();
        let mut engine = engine_with(ProtocolFlavor::CodexAppServer, adapter.capabilities());
        engine.policy = EnginePolicy {
            invalid_event_policy: InvalidEventPolicy::IgnoreStale,
        };
        let conversation_id = insert_ready_conversation(
            &mut engine,
            "conv",
            RemoteConversationId::CodexThread("thread".to_string()),
            adapter.capabilities(),
        );
        let turn_id = start_turn(&mut engine, conversation_id.clone());
        engine
            .apply_event(EngineEvent::TurnTerminal {
                conversation_id: conversation_id.clone(),
                turn_id: turn_id.clone(),
                outcome: TurnOutcome::Succeeded,
            })
            .expect("terminal");
        let report = engine
            .apply_event(EngineEvent::AssistantDelta {
                conversation_id: conversation_id.clone(),
                turn_id: turn_id.clone(),
                delta: ContentDelta::Text("late".to_string()),
            })
            .expect("ignore stale");
        assert!(report.ui_events.is_empty());
        let turn = &engine.conversations[&conversation_id].turns[&turn_id];
        assert!(matches!(turn.phase, TurnPhase::Terminal(_)));
        assert!(turn.output.chunks.is_empty());
    }

    #[test]
    fn acp_stop_reason_maps_to_refused_terminal() {
        let adapter = AcpAdapter::standard();
        let event = adapter.stop_reason_event(
            ConversationId::new("conv"),
            TurnId::new("turn"),
            AcpStopReason::Refusal,
        );
        assert!(matches!(
            event,
            EngineEvent::TurnTerminal {
                outcome: TurnOutcome::Refused,
                ..
            }
        ));
    }
}
