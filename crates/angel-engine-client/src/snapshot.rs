use std::collections::BTreeMap;

use angel_engine::{
    ActionKind, ActionOutputDelta, ActionPhase, ActionState, AgentMode, AvailableCommand,
    ContentDelta, ConversationLifecycle, ConversationState, EffectiveContext, ElicitationKind,
    ElicitationPhase, ElicitationState, HistoryReplayEntry, HistoryRole, PlanEntryStatus,
    QuestionValueType, RuntimeState, SessionConfigOption, SessionMode, SessionModeState,
    SessionModel, SessionModelState, SessionUsageCost, SessionUsageState, TurnPhase, TurnState,
    UserQuestion, UserQuestionOption, UserQuestionSchema,
};
use serde::{Deserialize, Serialize};

use crate::event::RuntimeAuthMethod;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientSnapshot {
    pub runtime: RuntimeSnapshot,
    pub selected_conversation_id: Option<String>,
    pub conversations: Vec<ConversationSnapshot>,
}

impl From<&angel_engine::AngelEngine> for ClientSnapshot {
    fn from(engine: &angel_engine::AngelEngine) -> Self {
        Self {
            runtime: RuntimeSnapshot::from(&engine.runtime),
            selected_conversation_id: engine.selected.as_ref().map(ToString::to_string),
            conversations: engine
                .conversations
                .values()
                .map(conversation_snapshot)
                .collect(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum RuntimeSnapshot {
    Offline,
    Connecting,
    Negotiating,
    AwaitingAuth {
        methods: Vec<RuntimeAuthMethod>,
    },
    Available {
        name: String,
        version: Option<String>,
        metadata: BTreeMap<String, String>,
    },
    Faulted {
        code: String,
        message: String,
        recoverable: bool,
    },
}

impl From<&RuntimeState> for RuntimeSnapshot {
    fn from(runtime: &RuntimeState) -> Self {
        match runtime {
            RuntimeState::Offline => Self::Offline,
            RuntimeState::Connecting => Self::Connecting,
            RuntimeState::Negotiating => Self::Negotiating,
            RuntimeState::AwaitingAuth { methods } => Self::AwaitingAuth {
                methods: methods
                    .iter()
                    .map(|method| RuntimeAuthMethod {
                        id: method.id.to_string(),
                        label: method.label.clone(),
                    })
                    .collect(),
            },
            RuntimeState::Available { capabilities } => Self::Available {
                name: capabilities.name.clone(),
                version: capabilities.version.clone(),
                metadata: capabilities.metadata.clone(),
            },
            RuntimeState::Faulted(error) => Self::Faulted {
                code: error.code.clone(),
                message: error.message.clone(),
                recoverable: error.recoverable,
            },
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationSnapshot {
    pub id: String,
    pub remote_id: Option<String>,
    pub remote_kind: String,
    pub lifecycle: String,
    pub active_turn_ids: Vec<String>,
    pub focused_turn_id: Option<String>,
    pub context: ContextSnapshot,
    pub turns: Vec<TurnSnapshot>,
    pub actions: Vec<ActionSnapshot>,
    pub elicitations: Vec<ElicitationSnapshot>,
    pub history: HistorySnapshot,
    pub available_commands: Vec<AvailableCommandSnapshot>,
    pub config_options: Vec<SessionConfigOptionSnapshot>,
    pub modes: Option<SessionModeStateSnapshot>,
    pub models: Option<SessionModelStateSnapshot>,
    pub usage: Option<SessionUsageSnapshot>,
}

pub(crate) fn conversation_snapshot(conversation: &ConversationState) -> ConversationSnapshot {
    let (remote_kind, remote_id) = match &conversation.remote {
        angel_engine::RemoteConversationId::Known(value) => {
            ("known".to_string(), Some(value.clone()))
        }
        angel_engine::RemoteConversationId::Pending(value) => {
            ("pending".to_string(), Some(value.clone()))
        }
        angel_engine::RemoteConversationId::Local(value) => {
            ("local".to_string(), Some(value.clone()))
        }
    };
    ConversationSnapshot {
        id: conversation.id.to_string(),
        remote_id,
        remote_kind,
        lifecycle: lifecycle_label(&conversation.lifecycle),
        active_turn_ids: conversation
            .active_turns
            .iter()
            .map(ToString::to_string)
            .collect(),
        focused_turn_id: conversation.focused_turn.as_ref().map(ToString::to_string),
        context: ContextSnapshot::from(&conversation.context),
        turns: conversation
            .turns
            .values()
            .map(TurnSnapshot::from)
            .collect(),
        actions: conversation
            .actions
            .values()
            .map(ActionSnapshot::from)
            .collect(),
        elicitations: conversation
            .elicitations
            .values()
            .map(ElicitationSnapshot::from)
            .collect(),
        history: HistorySnapshot {
            hydrated: conversation.history.hydrated,
            turn_count: conversation.history.turn_count,
            replay: conversation
                .history
                .replay
                .iter()
                .map(HistoryReplaySnapshot::from)
                .collect(),
        },
        available_commands: conversation
            .available_commands
            .iter()
            .map(AvailableCommandSnapshot::from)
            .collect(),
        config_options: conversation
            .config_options
            .iter()
            .map(SessionConfigOptionSnapshot::from)
            .collect(),
        modes: conversation
            .mode_state
            .as_ref()
            .map(SessionModeStateSnapshot::from),
        models: conversation
            .model_state
            .as_ref()
            .map(SessionModelStateSnapshot::from),
        usage: conversation
            .usage_state
            .as_ref()
            .map(SessionUsageSnapshot::from),
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextSnapshot {
    pub model: Option<String>,
    pub reasoning_effort: Option<String>,
    pub reasoning_summary: Option<String>,
    pub mode: Option<String>,
    pub cwd: Option<String>,
    pub additional_directories: Vec<String>,
    pub approval_policy: Option<String>,
    pub sandbox: Option<String>,
    pub permission_profile: Option<String>,
    pub raw: BTreeMap<String, String>,
}

impl From<&EffectiveContext> for ContextSnapshot {
    fn from(context: &EffectiveContext) -> Self {
        let reasoning = context.reasoning.effective().and_then(Option::as_ref);
        Self {
            model: context.model.effective().and_then(Clone::clone),
            reasoning_effort: reasoning.and_then(|profile| profile.effort.clone()),
            reasoning_summary: reasoning.and_then(|profile| profile.summary.clone()),
            mode: context
                .mode
                .effective()
                .and_then(Option::as_ref)
                .map(|AgentMode { id }| id.clone()),
            cwd: context
                .cwd
                .effective()
                .and_then(Option::as_ref)
                .map(|path| path.display().to_string()),
            additional_directories: context
                .additional_directories
                .effective()
                .map(|directories| {
                    directories
                        .iter()
                        .map(|directory| directory.display().to_string())
                        .collect()
                })
                .unwrap_or_default(),
            approval_policy: context
                .approvals
                .effective()
                .map(|policy| format!("{policy:?}")),
            sandbox: context
                .sandbox
                .effective()
                .map(|sandbox| format!("{sandbox:?}")),
            permission_profile: context
                .permissions
                .effective()
                .map(|permissions| permissions.name.clone()),
            raw: context
                .raw
                .iter()
                .filter_map(|(key, value)| {
                    value.effective().map(|value| (key.clone(), value.clone()))
                })
                .collect(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnSnapshot {
    pub id: String,
    pub remote_id: Option<String>,
    pub remote_kind: String,
    pub phase: String,
    pub input_text: String,
    pub output_text: String,
    pub reasoning_text: String,
    pub plan_text: String,
    pub plan_path: Option<String>,
    pub outcome: Option<String>,
    pub output: Vec<ContentChunk>,
    pub reasoning: Vec<ContentChunk>,
    pub plan: Vec<PlanEntrySnapshot>,
}

impl From<&TurnState> for TurnSnapshot {
    fn from(turn: &TurnState) -> Self {
        let (remote_kind, remote_id) = match &turn.remote {
            angel_engine::RemoteTurnId::Known(value) => ("known".to_string(), Some(value.clone())),
            angel_engine::RemoteTurnId::Pending { request_id } => {
                ("pending".to_string(), Some(request_id.to_string()))
            }
            angel_engine::RemoteTurnId::Local(value) => ("local".to_string(), Some(value.clone())),
        };
        let output = turn
            .output
            .chunks
            .iter()
            .map(ContentChunk::from)
            .collect::<Vec<_>>();
        let reasoning = turn
            .reasoning
            .chunks
            .iter()
            .map(ContentChunk::from)
            .collect::<Vec<_>>();
        let plan_text_chunks = turn
            .plan_text
            .chunks
            .iter()
            .map(ContentChunk::from)
            .collect::<Vec<_>>();
        Self {
            id: turn.id.to_string(),
            remote_id,
            remote_kind,
            phase: turn_phase_label(&turn.phase),
            input_text: turn
                .input
                .iter()
                .map(|input| input.content.as_str())
                .collect::<Vec<_>>()
                .join("\n"),
            output_text: chunks_text(&output),
            reasoning_text: chunks_text(&reasoning),
            plan_text: chunks_text(&plan_text_chunks),
            plan_path: turn.plan_path.clone(),
            outcome: turn.outcome.as_ref().map(|outcome| format!("{outcome:?}")),
            output,
            reasoning,
            plan: turn
                .plan
                .as_ref()
                .map(|plan| plan.entries.iter().map(PlanEntrySnapshot::from).collect())
                .unwrap_or_default(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentChunk {
    pub kind: String,
    pub text: String,
}

impl From<&ContentDelta> for ContentChunk {
    fn from(delta: &ContentDelta) -> Self {
        match delta {
            ContentDelta::Text(text) => Self {
                kind: "text".to_string(),
                text: text.clone(),
            },
            ContentDelta::ResourceRef(uri) => Self {
                kind: "resourceRef".to_string(),
                text: uri.clone(),
            },
            ContentDelta::Structured(value) => Self {
                kind: "structured".to_string(),
                text: value.clone(),
            },
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanEntrySnapshot {
    pub content: String,
    pub status: String,
}

impl From<&angel_engine::PlanEntry> for PlanEntrySnapshot {
    fn from(entry: &angel_engine::PlanEntry) -> Self {
        Self {
            content: entry.content.clone(),
            status: match entry.status {
                PlanEntryStatus::Pending => "pending",
                PlanEntryStatus::InProgress => "inProgress",
                PlanEntryStatus::Completed => "completed",
            }
            .to_string(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionSnapshot {
    pub id: String,
    pub turn_id: String,
    pub kind: String,
    pub phase: String,
    pub title: Option<String>,
    pub input_summary: Option<String>,
    pub raw_input: Option<String>,
    pub output_text: String,
    pub output: Vec<ActionOutputSnapshot>,
    pub error: Option<ErrorSnapshot>,
}

impl From<&ActionState> for ActionSnapshot {
    fn from(action: &ActionState) -> Self {
        let output = action
            .output
            .chunks
            .iter()
            .map(ActionOutputSnapshot::from)
            .collect::<Vec<_>>();
        Self {
            id: action.id.to_string(),
            turn_id: action.turn_id.to_string(),
            kind: action_kind_label(&action.kind),
            phase: action_phase_label(&action.phase),
            title: action.title.clone(),
            input_summary: action.input.summary.clone(),
            raw_input: action.input.raw.clone(),
            output_text: action_output_text(&output),
            output,
            error: action.error.as_ref().map(ErrorSnapshot::from),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionOutputSnapshot {
    pub kind: String,
    pub text: String,
}

impl From<&ActionOutputDelta> for ActionOutputSnapshot {
    fn from(delta: &ActionOutputDelta) -> Self {
        match delta {
            ActionOutputDelta::Text(text) => Self {
                kind: "text".to_string(),
                text: text.clone(),
            },
            ActionOutputDelta::Patch(text) => Self {
                kind: "patch".to_string(),
                text: text.clone(),
            },
            ActionOutputDelta::Terminal(text) => Self {
                kind: "terminal".to_string(),
                text: text.clone(),
            },
            ActionOutputDelta::Structured(text) => Self {
                kind: "structured".to_string(),
                text: text.clone(),
            },
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElicitationSnapshot {
    pub id: String,
    pub turn_id: Option<String>,
    pub action_id: Option<String>,
    pub kind: String,
    pub phase: String,
    pub title: Option<String>,
    pub body: Option<String>,
    pub choices: Vec<String>,
    pub questions: Vec<QuestionSnapshot>,
}

impl From<&ElicitationState> for ElicitationSnapshot {
    fn from(elicitation: &ElicitationState) -> Self {
        Self {
            id: elicitation.id.to_string(),
            turn_id: elicitation.turn_id.as_ref().map(ToString::to_string),
            action_id: elicitation.action_id.as_ref().map(ToString::to_string),
            kind: elicitation_kind_label(&elicitation.kind),
            phase: elicitation_phase_label(&elicitation.phase),
            title: elicitation.options.title.clone(),
            body: elicitation.options.body.clone(),
            choices: elicitation.options.choices.clone(),
            questions: elicitation
                .options
                .questions
                .iter()
                .map(QuestionSnapshot::from)
                .collect(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionSnapshot {
    pub id: String,
    pub header: String,
    pub question: String,
    pub is_secret: bool,
    pub is_other: bool,
    pub options: Vec<QuestionOptionSnapshot>,
    pub schema: Option<QuestionSchemaSnapshot>,
}

impl From<&UserQuestion> for QuestionSnapshot {
    fn from(question: &UserQuestion) -> Self {
        Self {
            id: question.id.clone(),
            header: question.header.clone(),
            question: question.question.clone(),
            is_secret: question.is_secret,
            is_other: question.is_other,
            options: question
                .options
                .iter()
                .map(QuestionOptionSnapshot::from)
                .collect(),
            schema: question.schema.as_ref().map(QuestionSchemaSnapshot::from),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionOptionSnapshot {
    pub label: String,
    pub description: String,
}

impl From<&UserQuestionOption> for QuestionOptionSnapshot {
    fn from(option: &UserQuestionOption) -> Self {
        Self {
            label: option.label.clone(),
            description: option.description.clone(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionSchemaSnapshot {
    pub value_type: String,
    pub item_value_type: Option<String>,
    pub required: bool,
    pub multiple: bool,
    pub format: Option<String>,
    pub default_value: Option<String>,
    pub constraints: QuestionConstraintsSnapshot,
    pub raw_schema: Option<String>,
}

impl From<&UserQuestionSchema> for QuestionSchemaSnapshot {
    fn from(schema: &UserQuestionSchema) -> Self {
        Self {
            value_type: question_value_type(&schema.value_type),
            item_value_type: schema.item_value_type.as_ref().map(question_value_type),
            required: schema.required,
            multiple: schema.multiple,
            format: schema.format.clone(),
            default_value: schema.default_value.clone(),
            constraints: QuestionConstraintsSnapshot {
                pattern: schema.constraints.pattern.clone(),
                minimum: schema.constraints.minimum.clone(),
                maximum: schema.constraints.maximum.clone(),
                min_length: schema.constraints.min_length.clone(),
                max_length: schema.constraints.max_length.clone(),
                min_items: schema.constraints.min_items.clone(),
                max_items: schema.constraints.max_items.clone(),
                unique_items: schema.constraints.unique_items,
            },
            raw_schema: schema.raw_schema.clone(),
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionConstraintsSnapshot {
    pub pattern: Option<String>,
    pub minimum: Option<String>,
    pub maximum: Option<String>,
    pub min_length: Option<String>,
    pub max_length: Option<String>,
    pub min_items: Option<String>,
    pub max_items: Option<String>,
    pub unique_items: Option<bool>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailableCommandSnapshot {
    pub name: String,
    pub description: String,
    pub input_hint: Option<String>,
}

impl From<&AvailableCommand> for AvailableCommandSnapshot {
    fn from(command: &AvailableCommand) -> Self {
        Self {
            name: command.name.clone(),
            description: command.description.clone(),
            input_hint: command.input.as_ref().map(|input| input.hint.clone()),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionConfigOptionSnapshot {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub current_value: String,
    pub values: Vec<SessionConfigValueSnapshot>,
}

impl From<&SessionConfigOption> for SessionConfigOptionSnapshot {
    fn from(option: &SessionConfigOption) -> Self {
        Self {
            id: option.id.clone(),
            name: option.name.clone(),
            description: option.description.clone(),
            category: option.category.clone(),
            current_value: option.current_value.clone(),
            values: option
                .values
                .iter()
                .map(|value| SessionConfigValueSnapshot {
                    value: value.value.clone(),
                    name: value.name.clone(),
                    description: value.description.clone(),
                })
                .collect(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionConfigValueSnapshot {
    pub value: String,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionModeStateSnapshot {
    pub current_mode_id: String,
    pub available_modes: Vec<SessionModeSnapshot>,
}

impl From<&SessionModeState> for SessionModeStateSnapshot {
    fn from(state: &SessionModeState) -> Self {
        Self {
            current_mode_id: state.current_mode_id.clone(),
            available_modes: state
                .available_modes
                .iter()
                .map(SessionModeSnapshot::from)
                .collect(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionModeSnapshot {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

impl From<&SessionMode> for SessionModeSnapshot {
    fn from(mode: &SessionMode) -> Self {
        Self {
            id: mode.id.clone(),
            name: mode.name.clone(),
            description: mode.description.clone(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionModelStateSnapshot {
    pub current_model_id: String,
    pub available_models: Vec<SessionModelSnapshot>,
}

impl From<&SessionModelState> for SessionModelStateSnapshot {
    fn from(state: &SessionModelState) -> Self {
        Self {
            current_model_id: state.current_model_id.clone(),
            available_models: state
                .available_models
                .iter()
                .map(SessionModelSnapshot::from)
                .collect(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionModelSnapshot {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

impl From<&SessionModel> for SessionModelSnapshot {
    fn from(model: &SessionModel) -> Self {
        Self {
            id: model.id.clone(),
            name: model.name.clone(),
            description: model.description.clone(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionUsageSnapshot {
    pub used: u64,
    pub size: u64,
    pub cost: Option<SessionUsageCostSnapshot>,
}

impl From<&SessionUsageState> for SessionUsageSnapshot {
    fn from(usage: &SessionUsageState) -> Self {
        Self {
            used: usage.used,
            size: usage.size,
            cost: usage.cost.as_ref().map(SessionUsageCostSnapshot::from),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionUsageCostSnapshot {
    pub amount: String,
    pub currency: String,
}

impl From<&SessionUsageCost> for SessionUsageCostSnapshot {
    fn from(cost: &SessionUsageCost) -> Self {
        Self {
            amount: cost.amount.clone(),
            currency: cost.currency.clone(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistorySnapshot {
    pub hydrated: bool,
    pub turn_count: usize,
    pub replay: Vec<HistoryReplaySnapshot>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryReplaySnapshot {
    pub role: String,
    pub content: ContentChunk,
}

impl From<&HistoryReplayEntry> for HistoryReplaySnapshot {
    fn from(entry: &HistoryReplayEntry) -> Self {
        Self {
            role: match &entry.role {
                HistoryRole::User => "user".to_string(),
                HistoryRole::Assistant => "assistant".to_string(),
                HistoryRole::Reasoning => "reasoning".to_string(),
                HistoryRole::Tool => "tool".to_string(),
                HistoryRole::Unknown(value) => value.clone(),
            },
            content: ContentChunk::from(&entry.content),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorSnapshot {
    pub code: String,
    pub message: String,
    pub recoverable: bool,
}

impl From<&angel_engine::ErrorInfo> for ErrorSnapshot {
    fn from(error: &angel_engine::ErrorInfo) -> Self {
        Self {
            code: error.code.clone(),
            message: error.message.clone(),
            recoverable: error.recoverable,
        }
    }
}

pub(crate) fn runtime_auth_methods(runtime: &RuntimeState) -> Vec<RuntimeAuthMethod> {
    match runtime {
        RuntimeState::AwaitingAuth { methods } => methods
            .iter()
            .map(|method| RuntimeAuthMethod {
                id: method.id.to_string(),
                label: method.label.clone(),
            })
            .collect(),
        _ => Vec::new(),
    }
}

fn lifecycle_label(lifecycle: &ConversationLifecycle) -> String {
    match lifecycle {
        ConversationLifecycle::Discovered => "discovered".to_string(),
        ConversationLifecycle::Provisioning { op } => format!("provisioning:{op:?}"),
        ConversationLifecycle::Hydrating { source } => format!("hydrating:{source:?}"),
        ConversationLifecycle::Idle => "idle".to_string(),
        ConversationLifecycle::Active => "active".to_string(),
        ConversationLifecycle::Cancelling { .. } => "cancelling".to_string(),
        ConversationLifecycle::MutatingHistory { .. } => "mutatingHistory".to_string(),
        ConversationLifecycle::Archived => "archived".to_string(),
        ConversationLifecycle::Closing => "closing".to_string(),
        ConversationLifecycle::Closed => "closed".to_string(),
        ConversationLifecycle::Faulted(error) => format!("faulted:{}", error.code),
    }
}

fn turn_phase_label(phase: &TurnPhase) -> String {
    match phase {
        TurnPhase::Starting => "starting".to_string(),
        TurnPhase::Reasoning => "reasoning".to_string(),
        TurnPhase::StreamingOutput => "streamingOutput".to_string(),
        TurnPhase::Planning => "planning".to_string(),
        TurnPhase::Acting { .. } => "acting".to_string(),
        TurnPhase::AwaitingUser { .. } => "awaitingUser".to_string(),
        TurnPhase::Cancelling => "cancelling".to_string(),
        TurnPhase::Terminal(outcome) => format!("terminal:{outcome:?}"),
    }
}

fn action_kind_label(kind: &ActionKind) -> String {
    match kind {
        ActionKind::Command => "command",
        ActionKind::FileChange => "fileChange",
        ActionKind::Read => "read",
        ActionKind::Write => "write",
        ActionKind::McpTool => "mcpTool",
        ActionKind::DynamicTool => "dynamicTool",
        ActionKind::SubAgent => "subAgent",
        ActionKind::WebSearch => "webSearch",
        ActionKind::Media => "media",
        ActionKind::Reasoning => "reasoning",
        ActionKind::Plan => "plan",
        ActionKind::HostCapability => "hostCapability",
    }
    .to_string()
}

fn action_phase_label(phase: &ActionPhase) -> String {
    match phase {
        ActionPhase::Proposed => "proposed",
        ActionPhase::AwaitingDecision { .. } => "awaitingDecision",
        ActionPhase::Running => "running",
        ActionPhase::StreamingResult => "streamingResult",
        ActionPhase::Completed => "completed",
        ActionPhase::Failed => "failed",
        ActionPhase::Declined => "declined",
        ActionPhase::Cancelled => "cancelled",
    }
    .to_string()
}

fn elicitation_kind_label(kind: &ElicitationKind) -> String {
    match kind {
        ElicitationKind::Approval => "approval",
        ElicitationKind::UserInput => "userInput",
        ElicitationKind::ExternalFlow => "externalFlow",
        ElicitationKind::DynamicToolCall => "dynamicToolCall",
        ElicitationKind::PermissionProfile => "permissionProfile",
    }
    .to_string()
}

fn elicitation_phase_label(phase: &ElicitationPhase) -> String {
    match phase {
        ElicitationPhase::Open => "open".to_string(),
        ElicitationPhase::Resolving => "resolving".to_string(),
        ElicitationPhase::Resolved { decision } => format!("resolved:{decision:?}"),
        ElicitationPhase::Cancelled => "cancelled".to_string(),
    }
}

fn question_value_type(value_type: &QuestionValueType) -> String {
    match value_type {
        QuestionValueType::String => "string".to_string(),
        QuestionValueType::Number => "number".to_string(),
        QuestionValueType::Integer => "integer".to_string(),
        QuestionValueType::Boolean => "boolean".to_string(),
        QuestionValueType::Array => "array".to_string(),
        QuestionValueType::Object => "object".to_string(),
        QuestionValueType::Unknown(value) => value.clone(),
    }
}

fn chunks_text(chunks: &[ContentChunk]) -> String {
    chunks
        .iter()
        .filter(|chunk| chunk.kind == "text")
        .map(|chunk| chunk.text.as_str())
        .collect::<Vec<_>>()
        .join("")
}

fn action_output_text(chunks: &[ActionOutputSnapshot]) -> String {
    chunks
        .iter()
        .filter(|chunk| chunk.kind == "text" || chunk.kind == "terminal")
        .map(|chunk| chunk.text.as_str())
        .collect::<Vec<_>>()
        .join("")
}
