use std::collections::{BTreeMap, BTreeSet};
use std::path::PathBuf;

use crate::capabilities::{ConversationCapabilities, RuntimeCapabilities};
use crate::error::ErrorInfo;
use crate::ids::{
    ActionId, ConversationId, ElicitationId, JsonRpcRequestId, RemoteActionId,
    RemoteConversationId, RemoteRequestId, RemoteTurnId, TurnId,
};

pub type Timestamp = u64;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RuntimeState {
    Offline,
    Connecting,
    Negotiating,
    AwaitingAuth { methods: Vec<AuthMethod> },
    Available { capabilities: RuntimeCapabilities },
    Faulted(ErrorInfo),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AuthMethod {
    pub id: crate::AuthMethodId,
    pub label: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ConversationLifecycle {
    Discovered,
    Provisioning { op: ProvisionOp },
    Hydrating { source: HydrationSource },
    Idle,
    Active,
    Cancelling { turn_id: TurnId },
    MutatingHistory { op: HistoryMutationOp },
    Archived,
    Closing,
    Closed,
    Faulted(ErrorInfo),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProvisionOp {
    New,
    Load,
    Resume,
    Fork,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum HydrationSource {
    AcpLoad,
    CodexResume,
    CodexRead,
    Imported,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ConversationState {
    pub id: ConversationId,
    pub remote: RemoteConversationId,
    pub lifecycle: ConversationLifecycle,
    pub active_turns: BTreeSet<TurnId>,
    pub focused_turn: Option<TurnId>,
    pub turns: BTreeMap<TurnId, TurnState>,
    pub actions: BTreeMap<ActionId, ActionState>,
    pub elicitations: BTreeMap<ElicitationId, ElicitationState>,
    pub context: EffectiveContext,
    pub history: HistoryState,
    pub observer: ObserverState,
    pub available_commands: Vec<AvailableCommand>,
    pub config_options: Vec<SessionConfigOption>,
    pub mode_state: Option<SessionModeState>,
    pub model_state: Option<SessionModelState>,
    pub capabilities: ConversationCapabilities,
    pub generation: u64,
}

impl ConversationState {
    pub fn new(
        id: ConversationId,
        remote: RemoteConversationId,
        lifecycle: ConversationLifecycle,
        capabilities: ConversationCapabilities,
    ) -> Self {
        Self {
            id,
            remote,
            lifecycle,
            active_turns: BTreeSet::new(),
            focused_turn: None,
            turns: BTreeMap::new(),
            actions: BTreeMap::new(),
            elicitations: BTreeMap::new(),
            context: EffectiveContext::default(),
            history: HistoryState::default(),
            observer: ObserverState::default(),
            available_commands: Vec::new(),
            config_options: Vec::new(),
            mode_state: None,
            model_state: None,
            capabilities,
            generation: 0,
        }
    }

    pub fn active_turn_count(&self) -> usize {
        self.active_turns.len()
    }

    pub fn primary_active_turn(&self) -> Option<&TurnId> {
        self.focused_turn
            .as_ref()
            .filter(|turn_id| self.active_turns.contains(*turn_id))
            .or_else(|| self.active_turns.iter().next_back())
    }

    pub fn is_loaded(&self) -> bool {
        !matches!(
            self.lifecycle,
            ConversationLifecycle::Discovered
                | ConversationLifecycle::Provisioning { .. }
                | ConversationLifecycle::Hydrating { .. }
                | ConversationLifecycle::Closed
        )
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AvailableCommand {
    pub name: String,
    pub description: String,
    pub input: Option<AvailableCommandInput>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AvailableCommandInput {
    pub hint: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SessionConfigOption {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub current_value: String,
    pub values: Vec<SessionConfigValue>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SessionConfigValue {
    pub value: String,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SessionModeState {
    pub current_mode_id: String,
    pub available_modes: Vec<SessionMode>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SessionMode {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SessionModelState {
    pub current_model_id: String,
    pub available_models: Vec<SessionModel>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SessionModel {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TurnState {
    pub id: TurnId,
    pub remote: RemoteTurnId,
    pub phase: TurnPhase,
    pub input: Vec<UserInputRef>,
    pub output: OutputBuffer,
    pub reasoning: ReasoningBuffer,
    pub plan: Option<PlanState>,
    pub plan_text: OutputBuffer,
    pub started_at: Timestamp,
    pub completed_at: Option<Timestamp>,
    pub outcome: Option<TurnOutcome>,
}

impl TurnState {
    pub fn new(id: TurnId, remote: RemoteTurnId, started_at: Timestamp) -> Self {
        Self {
            id,
            remote,
            phase: TurnPhase::Starting,
            input: Vec::new(),
            output: OutputBuffer::default(),
            reasoning: ReasoningBuffer::default(),
            plan: None,
            plan_text: OutputBuffer::default(),
            started_at,
            completed_at: None,
            outcome: None,
        }
    }

    pub fn is_terminal(&self) -> bool {
        matches!(self.phase, TurnPhase::Terminal(_))
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TurnPhase {
    Starting,
    Reasoning,
    StreamingOutput,
    Planning,
    Acting { action_id: ActionId },
    AwaitingUser { elicitation_id: ElicitationId },
    Cancelling,
    Terminal(TurnOutcome),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TurnOutcome {
    Succeeded,
    Exhausted { reason: ExhaustionReason },
    Refused,
    Interrupted,
    Failed(ErrorInfo),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ExhaustionReason {
    MaxTokens,
    MaxTurnRequests,
    ContextWindow,
    UsageLimit,
    Other(String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ActionState {
    pub id: ActionId,
    pub turn_id: TurnId,
    pub remote: Option<RemoteActionId>,
    pub kind: ActionKind,
    pub phase: ActionPhase,
    pub title: Option<String>,
    pub input: ActionInput,
    pub output: ActionOutput,
    pub error: Option<ErrorInfo>,
}

impl ActionState {
    pub fn new(id: ActionId, turn_id: TurnId, kind: ActionKind) -> Self {
        Self {
            id,
            turn_id,
            remote: None,
            kind,
            phase: ActionPhase::Proposed,
            title: None,
            input: ActionInput::default(),
            output: ActionOutput::default(),
            error: None,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ActionKind {
    Command,
    FileChange,
    Read,
    Write,
    McpTool,
    DynamicTool,
    SubAgent,
    WebSearch,
    Media,
    Reasoning,
    Plan,
    HostCapability,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ActionPhase {
    Proposed,
    AwaitingDecision { elicitation_id: ElicitationId },
    Running,
    StreamingResult,
    Completed,
    Failed,
    Declined,
    Cancelled,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ActionInput {
    pub summary: Option<String>,
    pub raw: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ActionOutput {
    pub chunks: Vec<ActionOutputDelta>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ActionOutputDelta {
    Text(String),
    Patch(String),
    Terminal(String),
    Structured(String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ElicitationState {
    pub id: ElicitationId,
    pub turn_id: Option<TurnId>,
    pub action_id: Option<ActionId>,
    pub remote_request_id: RemoteRequestId,
    pub kind: ElicitationKind,
    pub phase: ElicitationPhase,
    pub options: ElicitationOptions,
}

impl ElicitationState {
    pub fn new(
        id: ElicitationId,
        remote_request_id: RemoteRequestId,
        kind: ElicitationKind,
    ) -> Self {
        Self {
            id,
            turn_id: None,
            action_id: None,
            remote_request_id,
            kind,
            phase: ElicitationPhase::Open,
            options: ElicitationOptions::default(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ElicitationKind {
    Approval,
    UserInput,
    ExternalFlow,
    DynamicToolCall,
    PermissionProfile,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ElicitationPhase {
    Open,
    Resolving,
    Resolved { decision: ElicitationDecision },
    Cancelled,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ElicitationDecision {
    Allow,
    AllowForSession,
    Deny,
    Cancel,
    Answers(Vec<UserAnswer>),
    DynamicToolResult { success: bool },
    PermissionGrant { scope: ContextScope },
    ExternalComplete,
    Raw(String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UserAnswer {
    pub id: String,
    pub value: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ElicitationOptions {
    pub title: Option<String>,
    pub body: Option<String>,
    pub choices: Vec<String>,
    pub questions: Vec<UserQuestion>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UserQuestion {
    pub id: String,
    pub header: String,
    pub question: String,
    pub is_secret: bool,
    pub is_other: bool,
    pub options: Vec<UserQuestionOption>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UserQuestionOption {
    pub label: String,
    pub description: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct OutputBuffer {
    pub chunks: Vec<ContentDelta>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ReasoningBuffer {
    pub chunks: Vec<ContentDelta>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ContentDelta {
    Text(String),
    ResourceRef(String),
    Structured(String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UserInputRef {
    pub content: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PlanState {
    pub entries: Vec<PlanEntry>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PlanEntry {
    pub content: String,
    pub status: PlanEntryStatus,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PlanEntryStatus {
    Pending,
    InProgress,
    Completed,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct EffectiveContext {
    pub model: ScopedValue<Option<String>>,
    pub reasoning: ScopedValue<Option<ReasoningProfile>>,
    pub mode: ScopedValue<Option<AgentMode>>,
    pub cwd: ScopedValue<Option<PathBuf>>,
    pub approvals: ScopedValue<ApprovalPolicy>,
    pub sandbox: ScopedValue<SandboxProfile>,
    pub permissions: ScopedValue<PermissionProfile>,
    pub memory: ScopedValue<MemoryMode>,
    pub goal: Option<GoalState>,
    pub raw: BTreeMap<String, ScopedValue<String>>,
}

impl EffectiveContext {
    pub fn apply_patch(&mut self, patch: ContextPatch) {
        for update in patch.updates {
            match update {
                ContextUpdate::Model { scope, model } => self.model.set(scope, model),
                ContextUpdate::Reasoning { scope, reasoning } => {
                    self.reasoning.set(scope, reasoning)
                }
                ContextUpdate::Mode { scope, mode } => self.mode.set(scope, mode),
                ContextUpdate::Cwd { scope, cwd } => self.cwd.set(scope, cwd.map(PathBuf::from)),
                ContextUpdate::ApprovalPolicy { scope, policy } => {
                    self.approvals.set(scope, policy)
                }
                ContextUpdate::Sandbox { scope, sandbox } => self.sandbox.set(scope, sandbox),
                ContextUpdate::Permissions { scope, permissions } => {
                    self.permissions.set(scope, permissions)
                }
                ContextUpdate::Memory { scope, memory } => self.memory.set(scope, memory),
                ContextUpdate::Goal(goal) => self.goal = goal,
                ContextUpdate::Raw { scope, key, value } => {
                    self.raw.entry(key).or_default().set(scope, value);
                }
            }
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ScopedValue<T> {
    pub runtime_default: Option<T>,
    pub conversation: Option<T>,
    pub turn_and_future: Option<T>,
    pub current_turn: Option<T>,
    pub temporary: Vec<T>,
}

impl<T> ScopedValue<T> {
    pub fn set(&mut self, scope: ContextScope, value: T) {
        match scope {
            ContextScope::RuntimeDefault => self.runtime_default = Some(value),
            ContextScope::Conversation => self.conversation = Some(value),
            ContextScope::TurnAndFuture => self.turn_and_future = Some(value),
            ContextScope::CurrentTurn => self.current_turn = Some(value),
            ContextScope::TemporaryGrant => self.temporary.push(value),
        }
    }

    pub fn effective(&self) -> Option<&T> {
        self.temporary
            .last()
            .or(self.current_turn.as_ref())
            .or(self.turn_and_future.as_ref())
            .or(self.conversation.as_ref())
            .or(self.runtime_default.as_ref())
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ContextScope {
    RuntimeDefault,
    Conversation,
    TurnAndFuture,
    CurrentTurn,
    TemporaryGrant,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ContextPatch {
    pub updates: Vec<ContextUpdate>,
}

impl ContextPatch {
    pub fn empty() -> Self {
        Self {
            updates: Vec::new(),
        }
    }

    pub fn one(update: ContextUpdate) -> Self {
        Self {
            updates: vec![update],
        }
    }

    pub fn is_empty(&self) -> bool {
        self.updates.is_empty()
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ContextUpdate {
    Model {
        scope: ContextScope,
        model: Option<String>,
    },
    Reasoning {
        scope: ContextScope,
        reasoning: Option<ReasoningProfile>,
    },
    Mode {
        scope: ContextScope,
        mode: Option<AgentMode>,
    },
    Cwd {
        scope: ContextScope,
        cwd: Option<String>,
    },
    ApprovalPolicy {
        scope: ContextScope,
        policy: ApprovalPolicy,
    },
    Sandbox {
        scope: ContextScope,
        sandbox: SandboxProfile,
    },
    Permissions {
        scope: ContextScope,
        permissions: PermissionProfile,
    },
    Memory {
        scope: ContextScope,
        memory: MemoryMode,
    },
    Goal(Option<GoalState>),
    Raw {
        scope: ContextScope,
        key: String,
        value: String,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReasoningProfile {
    pub effort: Option<String>,
    pub summary: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AgentMode {
    pub id: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub enum ApprovalPolicy {
    Never,
    #[default]
    OnRequest,
    OnFailure,
    UnlessTrusted,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub enum SandboxProfile {
    #[default]
    ReadOnly,
    WorkspaceWrite,
    FullAccess,
    Custom(String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PermissionProfile {
    pub name: String,
}

impl Default for PermissionProfile {
    fn default() -> Self {
        Self {
            name: "default".to_string(),
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub enum MemoryMode {
    #[default]
    Enabled,
    Disabled,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GoalState {
    pub objective: String,
    pub status: GoalStatus,
    pub token_budget: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum GoalStatus {
    Active,
    Paused,
    BudgetLimited,
    Complete,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct HistoryState {
    pub hydrated: bool,
    pub turn_count: usize,
    pub workspace_reverted: Option<bool>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum HistoryMutationOp {
    Compact,
    Rollback { num_turns: usize },
    InjectItems { count: usize },
    ReplaceHistory,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HistoryMutationResult {
    pub success: bool,
    pub workspace_reverted: bool,
    pub message: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ObserverState {
    pub subscribed: bool,
    pub visible: bool,
}

impl Default for ObserverState {
    fn default() -> Self {
        Self {
            subscribed: true,
            visible: true,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ActionPatch {
    pub phase: Option<ActionPhase>,
    pub output_delta: Option<ActionOutputDelta>,
    pub error: Option<ErrorInfo>,
    pub title: Option<String>,
}

impl ActionPatch {
    pub fn phase(phase: ActionPhase) -> Self {
        Self {
            phase: Some(phase),
            output_delta: None,
            error: None,
            title: None,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PromptCorrelation {
    pub request_id: JsonRpcRequestId,
    pub user_message_id: Option<String>,
}
