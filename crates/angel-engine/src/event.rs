use crate::capabilities::{ConversationCapabilities, RuntimeCapabilities};
use crate::error::ErrorInfo;
use crate::ids::{
    ActionId, ConversationId, ElicitationId, RemoteConversationId, RemoteTurnId, TurnId,
};
use crate::state::{
    ActionPatch, ActionState, AvailableCommand, ContentDelta, ContextPatch, ConversationLifecycle,
    ElicitationDecision, ElicitationState, HistoryMutationOp, HistoryMutationResult,
    HistoryReplayEntry, HydrationSource, ObserverState, PlanState, ProvisionOp,
    SessionConfigOption, SessionModeState, SessionModelState, SessionUsageState, TurnOutcome,
    UserInputRef,
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum EngineEvent {
    RuntimeNegotiated {
        capabilities: RuntimeCapabilities,
        conversation_capabilities: Option<ConversationCapabilities>,
    },
    RuntimeAuthRequired {
        methods: Vec<crate::AuthMethod>,
    },
    RuntimeFaulted {
        error: ErrorInfo,
    },
    ConversationDiscovered {
        id: ConversationId,
        remote: RemoteConversationId,
        context: ContextPatch,
        capabilities: ConversationCapabilities,
    },
    ConversationDiscoveryPage {
        cursor: Option<String>,
        next_cursor: Option<String>,
    },
    ConversationProvisionStarted {
        id: ConversationId,
        remote: RemoteConversationId,
        op: ProvisionOp,
        capabilities: ConversationCapabilities,
    },
    ConversationHydrationStarted {
        id: ConversationId,
        source: HydrationSource,
    },
    ConversationReady {
        id: ConversationId,
        remote: Option<RemoteConversationId>,
        context: ContextPatch,
        capabilities: Option<ConversationCapabilities>,
    },
    ConversationStatusChanged {
        id: ConversationId,
        lifecycle: ConversationLifecycle,
    },
    AvailableCommandsUpdated {
        conversation_id: ConversationId,
        commands: Vec<AvailableCommand>,
    },
    SessionConfigOptionsUpdated {
        conversation_id: ConversationId,
        options: Vec<SessionConfigOption>,
    },
    SessionModesUpdated {
        conversation_id: ConversationId,
        modes: SessionModeState,
    },
    SessionModeChanged {
        conversation_id: ConversationId,
        mode_id: String,
    },
    SessionModelsUpdated {
        conversation_id: ConversationId,
        models: SessionModelState,
    },
    SessionUsageUpdated {
        conversation_id: ConversationId,
        usage: SessionUsageState,
    },
    ConversationClosed {
        id: ConversationId,
    },
    TurnStarted {
        conversation_id: ConversationId,
        turn_id: TurnId,
        remote: RemoteTurnId,
        input: Vec<UserInputRef>,
    },
    TurnSteered {
        conversation_id: ConversationId,
        turn_id: TurnId,
        input: Vec<UserInputRef>,
    },
    AssistantDelta {
        conversation_id: ConversationId,
        turn_id: TurnId,
        delta: ContentDelta,
    },
    ReasoningDelta {
        conversation_id: ConversationId,
        turn_id: TurnId,
        delta: ContentDelta,
    },
    PlanDelta {
        conversation_id: ConversationId,
        turn_id: TurnId,
        delta: ContentDelta,
    },
    PlanUpdated {
        conversation_id: ConversationId,
        turn_id: TurnId,
        plan: PlanState,
    },
    PlanPathUpdated {
        conversation_id: ConversationId,
        turn_id: TurnId,
        path: String,
    },
    TurnTerminal {
        conversation_id: ConversationId,
        turn_id: TurnId,
        outcome: TurnOutcome,
    },
    ActionObserved {
        conversation_id: ConversationId,
        action: ActionState,
    },
    ActionUpdated {
        conversation_id: ConversationId,
        action_id: ActionId,
        patch: ActionPatch,
    },
    ElicitationOpened {
        conversation_id: ConversationId,
        elicitation: ElicitationState,
    },
    ElicitationResolving {
        conversation_id: ConversationId,
        elicitation_id: ElicitationId,
    },
    ElicitationResolved {
        conversation_id: ConversationId,
        elicitation_id: ElicitationId,
        decision: ElicitationDecision,
    },
    ElicitationCancelled {
        conversation_id: ConversationId,
        elicitation_id: ElicitationId,
    },
    ContextUpdated {
        conversation_id: ConversationId,
        patch: ContextPatch,
    },
    HistoryMutationStarted {
        conversation_id: ConversationId,
        op: HistoryMutationOp,
    },
    HistoryMutationFinished {
        conversation_id: ConversationId,
        result: HistoryMutationResult,
    },
    HistoryReplayChunk {
        conversation_id: ConversationId,
        entry: HistoryReplayEntry,
    },
    ObserverChanged {
        conversation_id: ConversationId,
        observer: ObserverState,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum UiEvent {
    RuntimeChanged,
    DiscoveryChanged,
    ConversationChanged(ConversationId),
    TurnChanged {
        conversation_id: ConversationId,
        turn_id: TurnId,
    },
    ActionChanged {
        conversation_id: ConversationId,
        action_id: ActionId,
    },
    ElicitationChanged {
        conversation_id: ConversationId,
        elicitation_id: ElicitationId,
    },
    ContextChanged(ConversationId),
    HistoryChanged(ConversationId),
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct TransitionReport {
    pub ui_events: Vec<UiEvent>,
}

impl TransitionReport {
    pub fn one(event: UiEvent) -> Self {
        Self {
            ui_events: vec![event],
        }
    }
}
