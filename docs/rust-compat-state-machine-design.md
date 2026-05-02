# Rust 兼容层状态机技术设计

本文设计一个 Rust 结构作为 ACP 和 Codex app-server 的兼容层。它的目标不是把两个协议做成一组大而全的 enum mirror，而是把两边的请求、响应、通知、服务端回调翻译成同一个状态 reducer。

这个设计承接两篇上层文档：

- `docs/agent-ui-state-machine.md`: 外部 UI 能看到和调用什么。
- `docs/unified-agent-state-machine.md`: 协议无关的产品语义状态机。

这里进一步回答实现问题：

- Rust struct 应该保存哪些状态。
- 状态转移由哪些事件驱动。
- UI 命令如何变成 ACP 或 Codex app-server 的接口调用。
- ACP 和 Codex 的语义差异如何在 adapter 层对齐。

## 核心结论

兼容层应该拆成三层：

```text
UI command
  -> AgentCompat::plan_command()
  -> ProtocolEffect            # 发送 ACP/Codex 请求或通知

Protocol response/request/notification
  -> ProtocolAdapter::decode()
  -> CompatEvent               # 协议无关事实
  -> AgentCompat::apply_event()
  -> AgentCompatState + UiEvent
```

只有 `apply_event()` 能真正改状态。`plan_command()` 可以乐观记录 pending request，但不能把请求发送成功当作最终业务状态。最终状态必须来自协议响应、服务端通知，或者请求失败。

这点对两边都重要：

- ACP 的 `session/cancel` 是 notification，没有直接响应；原始 `session/prompt` 返回 `cancelled` 才是取消完成。
- Codex 的 `turn/interrupt` 返回 `{}` 只表示 server 接受中断请求；`turn/completed` 且状态为 `interrupted` 才是回合终态。
- Codex 的 `thread/status/changed` 和 `turn/completed` 比 `turn/start` 请求返回更权威。
- ACP 的 `session/update` 是 prompt turn 的主事件流；`session/prompt` response 的 `stopReason` 才关闭 turn。

## Rust 对象模型

建议把兼容层做成一个状态容器加一个纯 reducer。协议 transport、JSON-RPC id、反序列化类型都留在 adapter 层。

```rust
pub struct AgentCompat {
    pub runtime: RuntimeState,
    pub selected: Option<ConversationId>,
    pub conversations: HashMap<ConversationId, ConversationState>,
    pub pending: PendingTable,
    pub protocol: ProtocolFlavor,
    pub policy: CompatPolicy,
    pub generation: u64,
}

pub enum ProtocolFlavor {
    Acp,
    CodexAppServer,
}

pub struct ConversationState {
    pub id: ConversationId,
    pub remote: RemoteConversationId,
    pub lifecycle: ConversationLifecycle,
    pub active_turn: Option<TurnId>,
    pub turns: IndexMap<TurnId, TurnState>,
    pub actions: IndexMap<ActionId, ActionState>,
    pub elicitations: IndexMap<ElicitationId, ElicitationState>,
    pub context: EffectiveContext,
    pub history: HistoryState,
    pub observer: ObserverState,
    pub capabilities: ConversationCapabilities,
    pub generation: u64,
}
```

`ConversationId` 是兼容层自己的 id。`RemoteConversationId` 保留原协议 id：

```rust
pub enum RemoteConversationId {
    AcpSession(String),
    CodexThread(String),
}

pub enum RemoteTurnId {
    AcpLocal {
        session_id: String,
        prompt_request_id: Option<JsonRpcRequestId>,
        user_message_id: Option<String>,
        sequence: u64,
    },
    CodexTurn(String),
}
```

ACP 的稳定远端标识是 `sessionId`，它用于恢复 conversation：`session/load` 会用该 session id 重放历史，`session/resume` 会用该 session id 恢复上下文但不重放历史。这个 id 应进入 `RemoteConversationId::AcpSession`。

ACP 没有稳定的协议级 `turnId`。一个 prompt turn 的线上身份主要由“当前 pending 的 `session/prompt` JSON-RPC 请求”隐式表示，结束时由该请求返回 `stopReason`。因此兼容层需要维护自己的 `TurnId`，并把它绑定到可用的 ACP 线索：

- `sessionId`: 说明 turn 属于哪条 conversation，不足以区分 turn。
- `prompt_request_id`: 当前连接内可区分 pending prompt，但不能跨重连持久化。
- unstable `messageId/userMessageId`: 可作为 user message 级关联线索；它不是稳定 turn id，而且不是所有 agent 都会启用或返回。
- local `sequence`: 兼容层在 session 内按 prompt 顺序生成，用于没有 message id 时保持 UI 状态一致。

Codex app-server 有显式 `turnId`，可以直接保存到 `RemoteTurnId::CodexTurn`。

## 状态 enum

### Runtime

```rust
pub enum RuntimeState {
    Offline,
    Connecting,
    Negotiating,
    AwaitingAuth { methods: Vec<AuthMethod> },
    Available { capabilities: RuntimeCapabilities },
    Faulted(ErrorInfo),
}
```

Runtime 只描述服务可不可用，不描述某个 session/thread 是否 active。

### Conversation

```rust
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

pub enum ProvisionOp {
    New,
    Load,
    Resume,
    Fork,
}
```

`Active` 不表示 agent 具体在做什么，只表示这条 conversation 有一个未终止 turn。

### Turn

```rust
pub struct TurnState {
    pub id: TurnId,
    pub remote: RemoteTurnId,
    pub phase: TurnPhase,
    pub input: Vec<UserInputRef>,
    pub output: OutputBuffer,
    pub reasoning: ReasoningBuffer,
    pub plan: Option<PlanState>,
    pub started_at: Timestamp,
    pub completed_at: Option<Timestamp>,
    pub outcome: Option<TurnOutcome>,
}

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

pub enum TurnOutcome {
    Succeeded,
    Exhausted { reason: ExhaustionReason },
    Refused,
    Interrupted,
    Failed(ErrorInfo),
}
```

一个 conversation 默认只允许一个 active turn，但这也应该是能力表里的策略，而不是写死在 reducer 里。active 时追加输入、并发开启新 turn、还是拒绝输入，都由当前 adapter 暴露的 turn capability 决定。

Codex 的标准能力是 `steer = Supported`：`turn/steer` 向 active turn 增加输入，不创建新 turn。ACP 标准协议没有 steer 方法，因此 ACP 标准 adapter 应报告 `steer = Unsupported`；如果某个 ACP agent 或 proxy 通过扩展实现了 steer，就由该实现把能力表改成 `Extension(...)` 或 `Supported`。兼容层只检查能力表，不按协议名硬编码 drop feature。

## 能力表

每个 protocol adapter 必须在 initialize / session ready / thread ready 后给兼容层一份能力表。状态机只读能力表做 guard。

```rust
pub struct ConversationCapabilities {
    pub lifecycle: LifecycleCapabilities,
    pub turn: TurnCapabilities,
    pub action: ActionCapabilities,
    pub elicitation: ElicitationCapabilities,
    pub history: HistoryCapabilities,
    pub context: ContextCapabilities,
    pub observer: ObserverCapabilities,
}

pub struct TurnCapabilities {
    pub start: CapabilitySupport,
    pub steer: CapabilitySupport,
    pub cancel: CapabilitySupport,
    pub max_active_turns: NonZeroUsize,
    pub requires_expected_turn_id_for_steer: bool,
}

pub enum CapabilitySupport {
    Unsupported,
    Supported,
    Extension { name: String },
    Unknown,
}
```

标准 adapter 的默认值：

| 能力 | ACP 标准 adapter | Codex app-server adapter |
| --- | --- | --- |
| `turn.start` | `Supported` via `session/prompt` | `Supported` via `turn/start` |
| `turn.steer` | `Unsupported`，除非扩展声明 | `Supported` via `turn/steer` |
| `turn.cancel` | `Supported` via `session/cancel` | `Supported` via `turn/interrupt` |
| `turn.max_active_turns` | `1` | `1` |
| `turn.requires_expected_turn_id_for_steer` | `false` 或扩展自定义 | `true` |

`plan_command()` 的规则是：

- `StartTurn` 只在 `active_turns < max_active_turns` 时允许。
- `SteerTurn` 只在 `turn.steer.is_supported()` 且有 active turn 时允许。
- `CapabilitySupport::Unsupported` 返回 `CapabilityUnsupported`，不是静默丢弃输入。
- `CapabilitySupport::Unknown` 应先走能力探测或保守拒绝，不能冒充支持。
- 协议扩展 adapter 可以把 ACP 的非标准 steer 映射成自定义 JSON-RPC method、extension request 或 proxy-local effect；reducer 不需要知道细节。

### Action

```rust
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
```

ACP 的 `ToolCallStatus::Pending` 同时可能代表“参数还在流式生成”和“等待审批”。不要直接把它映射成 `AwaitingDecision`；只有看到 `session/request_permission` 时才打开 elicitation。

### Elicitation

```rust
pub struct ElicitationState {
    pub id: ElicitationId,
    pub turn_id: Option<TurnId>,
    pub action_id: Option<ActionId>,
    pub remote_request_id: RemoteRequestId,
    pub kind: ElicitationKind,
    pub phase: ElicitationPhase,
    pub options: ElicitationOptions,
}

pub enum ElicitationKind {
    Approval,
    UserInput,
    ExternalFlow,
    DynamicToolCall,
    PermissionProfile,
}

pub enum ElicitationPhase {
    Open,
    Resolving,
    Resolved { decision: ElicitationDecision },
    Cancelled,
}
```

Codex 的 `ThreadStatus.activeFlags` 是 elicitation overlay 的摘要，不应该作为唯一事实来源。兼容层应该以 ServerRequest 打开具体 elicitation，以 `serverRequest/resolved` 或响应写入完成关闭它。

### Context

```rust
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
}

pub enum ContextScope {
    RuntimeDefault,
    Conversation,
    TurnAndFuture,
    CurrentTurn,
    TemporaryGrant,
}
```

Codex 的 `turn/start` 覆盖项多数字段是“本 turn 和后续 turns”生效，例如 `cwd`、`approvalPolicy`、`sandboxPolicy`、`permissions`、`model`、`effort`、`personality`、`collaborationMode`。ACP 的 `session/set_config_option` 和 `session/set_mode` 更像 conversation-scoped 设置。

## 统一事件

兼容层 reducer 只接受协议无关事件：

```rust
pub enum CompatEvent {
    RuntimeNegotiated { capabilities: RuntimeCapabilities },
    RuntimeAuthRequired { methods: Vec<AuthMethod> },
    RuntimeFaulted { error: ErrorInfo },

    ConversationDiscovered { id: ConversationId, remote: RemoteConversationId },
    ConversationProvisionStarted { id: ConversationId, remote: RemoteConversationId, op: ProvisionOp },
    ConversationHydrationStarted { id: ConversationId, source: HydrationSource },
    ConversationReady { id: ConversationId, context: EffectiveContext },
    ConversationStatusChanged { id: ConversationId, lifecycle: ConversationLifecycle },
    ConversationClosed { id: ConversationId },

    TurnStarted { conversation_id: ConversationId, turn_id: TurnId, remote: RemoteTurnId },
    TurnSteered { conversation_id: ConversationId, turn_id: TurnId, input: Vec<UserInputRef> },
    AssistantDelta { conversation_id: ConversationId, turn_id: TurnId, delta: ContentDelta },
    ReasoningDelta { conversation_id: ConversationId, turn_id: TurnId, delta: ContentDelta },
    PlanUpdated { conversation_id: ConversationId, turn_id: TurnId, plan: PlanState },
    TurnTerminal { conversation_id: ConversationId, turn_id: TurnId, outcome: TurnOutcome },

    ActionObserved { conversation_id: ConversationId, action: ActionState },
    ActionUpdated { conversation_id: ConversationId, action_id: ActionId, patch: ActionPatch },

    ElicitationOpened { conversation_id: ConversationId, elicitation: ElicitationState },
    ElicitationResolving { conversation_id: ConversationId, elicitation_id: ElicitationId },
    ElicitationResolved { conversation_id: ConversationId, elicitation_id: ElicitationId, decision: ElicitationDecision },
    ElicitationCancelled { conversation_id: ConversationId, elicitation_id: ElicitationId },

    ContextUpdated { conversation_id: ConversationId, patch: ContextPatch },
    HistoryMutationStarted { conversation_id: ConversationId, op: HistoryMutationOp },
    HistoryMutationFinished { conversation_id: ConversationId, result: HistoryMutationResult },
    ObserverChanged { conversation_id: ConversationId, observer: ObserverState },
}
```

## 统一命令

UI 不直接调用 ACP/Codex 方法，而是提交 `CompatCommand`：

```rust
pub enum CompatCommand {
    Initialize,
    Authenticate { method: AuthMethodId },
    DiscoverConversations,
    StartConversation { params: StartConversationParams },
    ResumeConversation { target: ResumeTarget },
    ForkConversation { source: ConversationId, at: Option<TurnId> },
    StartTurn { conversation_id: ConversationId, input: Vec<UserInput>, overrides: TurnOverrides },
    SteerTurn { conversation_id: ConversationId, input: Vec<UserInput> },
    CancelTurn { conversation_id: ConversationId },
    ResolveElicitation { conversation_id: ConversationId, elicitation_id: ElicitationId, decision: ElicitationDecision },
    UpdateContext { conversation_id: ConversationId, patch: ContextPatch },
    MutateHistory { conversation_id: ConversationId, op: HistoryMutationOp },
    ArchiveConversation { conversation_id: ConversationId },
    CloseConversation { conversation_id: ConversationId },
    Unsubscribe { conversation_id: ConversationId },
}
```

`plan_command()` 做三件事：

1. 检查状态前置条件。
2. 生成一个或多个 `ProtocolEffect`。
3. 写入 pending table，用于把响应和后续通知关联回统一事件。

```rust
pub enum ProtocolEffect {
    AcpRequest(AcpRequestEnvelope),
    AcpNotification(AcpNotificationEnvelope),
    CodexRequest(CodexRequestEnvelope),
    CodexNotification(CodexNotificationEnvelope),
}
```

## Reducer 不变量

`apply_event()` 每次执行后必须满足这些约束：

| 不变量 | 原因 |
| --- | --- |
| 每个 conversation 最多一个 non-terminal turn | ACP prompt turn 和 Codex active turn 都默认单并发。 |
| `ConversationLifecycle::Active` 必须有 `active_turn` | UI 需要知道 steer/cancel 指向谁。 |
| `Idle` 不能有 open elicitation | 等待审批或用户输入时 conversation 仍是 active。 |
| open elicitation 必须关联一个 active turn 或明确标为 out-of-band | Codex MCP elicitation 的 `turnId` 可为空，要显式建模。 |
| turn terminal 后，所有非终态 action 必须变成 `Completed/Failed/Declined/Cancelled` 之一 | 避免 UI 永久显示 running。 |
| cancel 后不能直接清空 turn | 取消是两阶段，终态由协议确认。 |
| history mutation 不能暗示工作区回滚 | Codex `thread/rollback` 只改历史，不还原文件。 |
| stale event 不能覆盖更新状态 | 用 request id、remote turn id、conversation generation 做防护。 |

建议 reducer 提供两种策略：

```rust
pub enum InvalidEventPolicy {
    StrictError,
    IgnoreStale,
    RecordFault,
}
```

本地开发和测试用 `StrictError`，生产 UI 用 `IgnoreStale` 加日志更稳。

## 主转移表

| 当前状态 | 事件 | 条件 | 目标状态 | 副作用 |
| --- | --- | --- | --- | --- |
| `Offline/Connecting/Negotiating` | `RuntimeNegotiated` | capabilities accepted | `Available` | 释放 initialize pending。 |
| `Negotiating` | `RuntimeAuthRequired` | 有 auth methods | `AwaitingAuth` | UI 显示登录入口。 |
| `Available` | `ConversationProvisionStarted(New/Resume/Fork)` | request accepted | `Provisioning` | 建立 remote id 映射。 |
| `Provisioning` | `ConversationHydrationStarted` | load/read/resume replay | `Hydrating` | 清空或标记 history buffer。 |
| `Provisioning/Hydrating` | `ConversationReady` | context valid | `Idle` | selected 可指向该 conversation。 |
| `Idle` | `TurnStarted` | no active turn | `Active` + turn `Starting` | active_turn = turn_id。 |
| `Active` | `AssistantDelta` | turn matches active | turn `StreamingOutput` | 追加输出。 |
| `Active` | `ReasoningDelta` | turn matches active | turn `Reasoning` | 追加 reasoning。 |
| `Active` | `PlanUpdated` | turn matches active | turn `Planning` | 整体替换 plan。 |
| `Active` | `ActionObserved` | turn matches active | turn `Acting` | upsert action。 |
| `Active` | `ElicitationOpened` | request id unique | turn `AwaitingUser` 或 action `AwaitingDecision` | active flags 增加等待态。 |
| `Active` | `ElicitationResolved` | elicitation open/resolving | turn 回 `Reasoning/Acting` | 根据 decision 更新 action/context。 |
| `Active` | `TurnTerminal` | turn matches active | `Idle` + turn terminal | 关闭 open elicitations/actions。 |
| `Active` | cancel command accepted | active turn exists | `Cancelling` + turn `Cancelling` | 发送协议取消 effect。 |
| `Cancelling` | `TurnTerminal(Interrupted)` | turn matches | `Idle` | 清理 pending request。 |
| `Idle` | `HistoryMutationStarted` | op supported | `MutatingHistory` | 禁止 start turn，除非 op 明确可并行。 |
| `MutatingHistory` | `HistoryMutationFinished` | success | `Idle` | 替换 history/context。 |
| any loaded | `ConversationClosed` | remote id matches | `Closed` | 清理 pending、取消订阅。 |
| any | `RuntimeFaulted` | unrecovered | `Faulted` | 保留最近状态快照用于恢复。 |

## Turn 转移表

| 当前 turn phase | 事件 | 目标 phase | 说明 |
| --- | --- | --- | --- |
| `Starting` | `ReasoningDelta` | `Reasoning` | agent 开始思考。 |
| `Starting/Reasoning/Planning/Acting` | `AssistantDelta` | `StreamingOutput` | 可流式显示 assistant message。 |
| `StreamingOutput` | `ReasoningDelta` | `Reasoning` | Codex/ACP 都可能交错输出和思考。 |
| any non-terminal | `PlanUpdated` | `Planning` | plan 是 turn 内状态，不结束 turn。 |
| any non-terminal | `ActionObserved/ActionUpdated(Running)` | `Acting` | 当前最活跃 action 可作为 UI highlight。 |
| `Acting` | `ElicitationOpened(Approval)` | `AwaitingUser` | action 同时进入 `AwaitingDecision`。 |
| any non-terminal | `ElicitationOpened(UserInput/ExternalFlow)` | `AwaitingUser` | UI 等待人输入或外部流程完成。 |
| `AwaitingUser` | `ElicitationResolved(allow/answer)` | `Acting` 或 `Reasoning` | 有 action 时回 `Acting`，否则回 `Reasoning`。 |
| any non-terminal | cancel command accepted | `Cancelling` | 仍继续接收输出和 item completion。 |
| any non-terminal | `TurnTerminal(*)` | `Terminal(outcome)` | 唯一真正结束 turn 的事件。 |

## ACP adapter

### UI 命令到 ACP 接口

| `CompatCommand` | ACP 接口 | 前置条件 | 产生的统一事件 |
| --- | --- | --- | --- |
| `Initialize` | `initialize` request | transport connected | response -> `RuntimeNegotiated` 或 `RuntimeAuthRequired`。 |
| `Authenticate` | `authenticate` request | `AwaitingAuth` | success -> `RuntimeNegotiated/Available`。 |
| `DiscoverConversations` | `session/list` request | capability 支持 list | response -> 多个 `ConversationDiscovered`。 |
| `StartConversation` | `session/new` request | runtime available | before send -> `ConversationProvisionStarted(New)`；response -> `ConversationReady`。 |
| `ResumeConversation(load)` | `session/load` request | capability 支持 load | before send -> `Provisioning(Load)`；首个 replay -> `HydrationStarted`；response -> `ConversationReady`。 |
| `ResumeConversation(resume)` | `session/resume` request | capability 支持 resume | before send -> `Provisioning(Resume)`；response -> `ConversationReady`。 |
| `StartTurn` | `session/prompt` request | conversation `Idle` | before send -> synthetic `TurnStarted`；updates -> deltas/actions；response `stopReason` -> `TurnTerminal`。 |
| `SteerTurn` | 无标准 ACP 等价；可由 ACP extension adapter 自定义映射 | conversation `Active` 且 `turn.steer` 支持 | 支持时 -> `TurnSteered`；不支持时返回 `CapabilityUnsupported`；不要退化成第二个 `session/prompt`。 |
| `CancelTurn` | `session/cancel` notification | conversation `Active` | before send -> `Cancelling`；原 `prompt` response `cancelled` -> `TurnTerminal(Interrupted)`。 |
| `ResolveElicitation` | reply to `session/request_permission` | elicitation open | selected option -> `ElicitationResolved`；若 cancelling 则必须回复 cancelled。 |
| `UpdateContext(mode)` | `session/set_mode` request | session exists, mode supported | response/notification -> `ContextUpdated`。 |
| `UpdateContext(config)` | `session/set_config_option` request | option exists | response returns full options -> replace config context。 |
| `CloseConversation` | `session/close` request | capability 支持 close | response -> `ConversationClosed`。 |

### ACP 输入到统一事件

| ACP 来源 | 统一事件 | 备注 |
| --- | --- | --- |
| `InitializeResponse` | `RuntimeNegotiated` 或 `RuntimeAuthRequired` | auth methods 非空且未认证时进入 AwaitingAuth。 |
| `NewSessionResponse/LoadSessionResponse/ResumeSessionResponse` | `ConversationReady` | 写入 session id、modes、config options。 |
| `session/update: UserMessageChunk` | append hydrated/user message | 在 load replay 中写 history；在 active turn 中补 user echo。 |
| `session/update: AgentMessageChunk` | `AssistantDelta` | 若 active turn 不存在，adapter 可合成 hydration message 或报错。 |
| `session/update: AgentThoughtChunk` | `ReasoningDelta` | 对应 turn reasoning buffer。 |
| `session/update: ToolCall` | `ActionObserved` | `Pending` 先映射 `Proposed`。 |
| `session/update: ToolCallUpdate` | `ActionUpdated` | `InProgress/Completed/Failed` 映射 action phase。 |
| `session/update: Plan` | `PlanUpdated` | ACP plan 每次视为完整替换。 |
| `session/update: CurrentModeUpdate` | `ContextUpdated(mode)` | agent 也可主动改 mode。 |
| `session/update: ConfigOptionUpdate` | `ContextUpdated(config)` | full config set，整体替换。 |
| `session/update: SessionInfoUpdate` | metadata patch | title/timestamps/custom metadata。 |
| `session/request_permission` request | `ElicitationOpened(Approval)` | 关联 `tool_call.id` 到 action；打开 approval。 |
| `PromptResponse.stopReason=end_turn` | `TurnTerminal(Succeeded)` | session 回 idle。 |
| `PromptResponse.stopReason=max_tokens` | `TurnTerminal(Exhausted(MaxTokens))` | 可以继续下一轮，但 UI 应提示预算耗尽。 |
| `PromptResponse.stopReason=max_turn_requests` | `TurnTerminal(Exhausted(MaxTurnRequests))` | 同上。 |
| `PromptResponse.stopReason=refusal` | `TurnTerminal(Refused)` | ACP 说明本 user prompt 后续不会进下一轮上下文。 |
| `PromptResponse.stopReason=cancelled` | `TurnTerminal(Interrupted)` | cancellation acknowledged。 |

### ACP 特殊语义

1. `sessionId` 是 conversation/session id，值得作为恢复锚点持久化；它不是 turn id。
2. `session/prompt` 是长请求。请求 pending 期间整条 conversation 是 active。
3. `session/cancel` 不应立即把 UI 置 idle。只能进入 `Cancelling`。
4. 如果 cancel 后还有 `session/request_permission` pending，client 必须以 `Cancelled` 响应该 request。
5. `ToolCallStatus::Pending` 不是 approval 状态。approval 只由 `session/request_permission` 表达。
6. `session/load` 的 replay update 可能看起来像正常输出；adapter 要用 pending load request 把它们归到 `Hydrating`。
7. 若启用了 unstable message id，`PromptRequest.messageId`、`PromptResponse.userMessageId` 和 chunk `messageId` 可帮助恢复消息关联；它们仍然是 message 级 id，不能替代协议级 turn id。
8. ACP 没有 archive、rollback、compact、steer 的标准等价接口；标准 ACP adapter 的能力表应把这些标成 `Unsupported`，目标 agent 暴露扩展方法时由扩展 adapter 覆盖能力表并实现映射。

## Codex app-server adapter

### UI 命令到 Codex 接口

| `CompatCommand` | Codex 接口 | 前置条件 | 产生的统一事件 |
| --- | --- | --- | --- |
| `Initialize` | `initialize` request + `initialized` notification | transport connected | response -> `RuntimeNegotiated`。 |
| `Authenticate` | `account/login/start` 或 transport auth | runtime/account 要求 | login notifications -> runtime/account context update。 |
| `DiscoverConversations` | `thread/list`, `thread/loaded/list`, `thread/read` | runtime available | response -> `ConversationDiscovered` 或 hydrated state。 |
| `StartConversation` | `thread/start` request | runtime available | response/thread notification -> `ConversationReady(Idle)`。 |
| `ResumeConversation` | `thread/resume` request | known thread/path/history | response -> `ConversationReady`；若返回 turns 则 hydrate history。 |
| `ForkConversation` | `thread/fork` request | source thread exists | response -> new `ConversationReady`。 |
| `StartTurn` | `turn/start` request | conversation `Idle` | response/`turn/started` -> `TurnStarted`；overrides -> `ContextUpdated(TurnAndFuture)`。 |
| `SteerTurn` | `turn/steer` request | conversation `Active` 且 `turn.steer` 支持 | uses `expectedTurnId`; success -> `TurnSteered`。 |
| `CancelTurn` | `turn/interrupt` request | active turn exists | before send -> `Cancelling`; `turn/completed(interrupted)` -> terminal。 |
| `ResolveElicitation(command approval)` | response to `item/commandExecution/requestApproval` | request open | decision -> resolving; `serverRequest/resolved` closes it。 |
| `ResolveElicitation(file approval)` | response to `item/fileChange/requestApproval` | request open | same。 |
| `ResolveElicitation(permission)` | response to `item/permissions/requestApproval` | request open | grant scope updates context。 |
| `ResolveElicitation(user input)` | response to `item/tool/requestUserInput` | request open | answers unblock tool。 |
| `ResolveElicitation(MCP)` | response to `mcpServer/elicitation/request` | request open | `accept/decline/cancel` maps to decision。 |
| `ResolveElicitation(dynamic tool)` | response to `item/tool/call` | request open | tool output becomes action result. |
| `UpdateContext(goal)` | `thread/goal/set/get/clear` | loaded thread | goal notifications update context。 |
| `UpdateContext(memory)` | `thread/memoryMode/set`, `memory/reset` | loaded/runtime | updates memory context。 |
| `UpdateContext(config)` | `config/value/write`, `config/batchWrite` | runtime available | global/default context only，不代表 active turn 立即变化。 |
| `MutateHistory(compact)` | `thread/compact/start` | loaded thread | notifications/items -> mutation finished。 |
| `MutateHistory(rollback)` | `thread/rollback` | loaded thread | response -> replace history; workspace changes remain。 |
| `ArchiveConversation` | `thread/archive` / `thread/unarchive` | loaded thread | notification -> archived/idle。 |
| `Unsubscribe` | `thread/unsubscribe` | subscribed thread | observer changes only，不 close。 |

### Codex 输入到统一事件

| Codex 来源 | 统一事件 | 备注 |
| --- | --- | --- |
| `thread/started` | `ConversationReady` | 新 thread 可进入 idle。 |
| `thread/status/changed: notLoaded` | `ConversationStatusChanged(Discovered)` 或 unloaded | 视本地是否已有 selected thread。 |
| `thread/status/changed: idle` | `ConversationStatusChanged(Idle)` | 若 active turn 已 terminal，保持 idle。 |
| `thread/status/changed: active(flags)` | `ConversationStatusChanged(Active)` | flags 只更新 overlay，不创建具体 request。 |
| `thread/status/changed: systemError` | `ConversationStatusChanged(Faulted)` | 保留 error context。 |
| `turn/started` | `TurnStarted` | Codex 有真实 turn id。 |
| `turn/completed: completed` | `TurnTerminal(Succeeded)` | 若 turn error 有具体错误，可映射 `Failed`。 |
| `turn/completed: interrupted` | `TurnTerminal(Interrupted)` | cancellation acknowledged。 |
| `turn/completed: failed` | `TurnTerminal(Failed)` | conversation 可能随后 idle 或 systemError。 |
| `item/started` | `ActionObserved` 或 message item | command/file/MCP/dynamic/sub-agent 等进入 `Running`。 |
| `item/completed` | `ActionUpdated` | 根据 item status 映射 terminal action phase。 |
| `item/agentMessage/delta` | `AssistantDelta` | 追加到 active turn output。 |
| `item/reasoning/*Delta` | `ReasoningDelta` | 追加 reasoning summary/text。 |
| `turn/plan/updated` | `PlanUpdated` | 通常整体替换 plan。 |
| `item/plan/delta` | plan delta | 可以 patch plan buffer。 |
| `turn/diff/updated` | `ActionUpdated(FileChange diff)` | 作为 file action 输出。 |
| `item/commandExecution/outputDelta` | `ActionUpdated(Command output)` | 进入 `StreamingResult`。 |
| `item/fileChange/patchUpdated` | `ActionUpdated(FileChange patch)` | 更新 patch display。 |
| `item/mcpToolCall/progress` | `ActionUpdated(Mcp progress)` | 不一定改变 action terminal 状态。 |
| `serverRequest/resolved` | `ElicitationResolved` 或 close resolving | 按 request id 查 pending。 |
| `thread/compacted` | `HistoryMutationFinished(compact)` | 更新 compact summary/context。 |
| `thread/archived/unarchived/closed` | lifecycle update | archive 不等于 close。 |
| `thread/name/updated`, `thread/goal/*`, `thread/tokenUsage/updated` | `ContextUpdated`/metadata | 不改变 turn phase。 |

### Codex ServerRequest 到 elicitation

| ServerRequest | `ElicitationKind` | action 映射 | response decision |
| --- | --- | --- | --- |
| `item/commandExecution/requestApproval` | `Approval` | `ActionKind::Command`，phase `AwaitingDecision` | `accept`/`acceptForSession`/amendment -> allow；`decline` -> declined；`cancel` -> cancelled。 |
| `item/fileChange/requestApproval` | `Approval` | `ActionKind::FileChange` | `accept`/`acceptForSession`/`decline`/`cancel`。 |
| `item/permissions/requestApproval` | `PermissionProfile` | 可关联 item，也要更新 context | response 的 `scope: turn/session` 决定 `CurrentTurn` 或 `Conversation`。 |
| `item/tool/requestUserInput` | `UserInput` | tool action 等待用户 | answers unblock tool。 |
| `mcpServer/elicitation/request` | `UserInput` 或 `ExternalFlow` | `mode=form` 是结构化输入，`mode=url` 是外部流程 | `accept/decline/cancel`。 |
| `item/tool/call` | `DynamicToolCall` | `ActionKind::DynamicTool` | `contentItems + success`。 |

### Codex item status 映射

| Codex status | 统一 action phase |
| --- | --- |
| command/file/MCP/dynamic/collab `inProgress` | `Running` 或 `StreamingResult` |
| `completed` | `Completed` |
| `failed` | `Failed` |
| command/file `declined` | `Declined` |
| collab `interrupted` | `Cancelled` |
| collab `errored/notFound/shutdown` | `Failed`，除非 shutdown 是主动关闭产生 |

### Codex 特殊语义

1. `turn/start` 的很多 override 是 sticky 的，应该写入 `TurnAndFuture`，不是 `CurrentTurn`。
2. `turn/steer` 必须带 `expectedTurnId`。兼容层应从 `active_turn` 读取；如果没有 active turn，直接拒绝。
3. `thread/unsubscribe` 只改 observer，不 close、不 cancel、不释放 thread 历史。
4. `thread/rollback` 只改 thread history，不 revert 文件系统。兼容层应在 `HistoryMutationResult` 中标记 `workspace_reverted: false`。
5. `thread/status/changed.activeFlags` 可能先于具体 ServerRequest 或晚于 request resolved；它是摘要信号，不能替代 request id 级别的 elicitation。
6. `mcpServer/elicitation/request` 的 `turnId` 可以为 `null`，因此 elicitation 要支持 out-of-band。

## 协议对齐细节

### Conversation 对齐

| 统一语义 | ACP | Codex |
| --- | --- | --- |
| `Conversation` | `session` | `thread` |
| new | `session/new` | `thread/start` |
| load/resume | `session/load` 或 `session/resume` | `thread/resume` |
| fork | 无标准等价 | `thread/fork` |
| archive | 无标准等价 | `thread/archive` / `thread/unarchive` |
| close | `session/close` | `thread/closed` 通知；常用 `unsubscribe` 只代表观察关系结束 |

ACP `session/load` 有显式 replay/hydration 语义。Codex `thread/resume` 可能直接返回 turns，也可能配合 `thread/turns/list` 分页读取。兼容层统一映射到 `Hydrating`。

### Turn 对齐

| 统一语义 | ACP | Codex |
| --- | --- | --- |
| start turn | `session/prompt` | `turn/start` |
| active turn id | 兼容层本地 `TurnId`，绑定 `sessionId`、pending request id、可选 unstable `userMessageId` | server `turnId` |
| steer active turn | 标准 ACP 不支持；扩展 adapter 可提供 | `turn/steer` |
| cancel | `session/cancel` notification | `turn/interrupt` request |
| normal terminal | `stopReason=end_turn` | `TurnStatus=completed` |
| cancelled terminal | `stopReason=cancelled` | `TurnStatus=interrupted` |
| failure terminal | JSON-RPC error / failed tool leading stop | `TurnStatus=failed` |

ACP 的 `session/prompt` 是整个 turn 的 request lifecycle。`sessionId` 可以恢复 conversation，但不能唯一指代某一轮 prompt turn；历史 replay 时可按 user message 边界和可选 message id 重建本地 turn 分组。Codex 的 `turn/start` 创建 turn 后，turn 主要由 notifications 维护。

### Action 对齐

| 统一语义 | ACP | Codex |
| --- | --- | --- |
| action id | `tool_call.id` | `ThreadItem.id` 或 dynamic `callId` |
| pending/proposed | `ToolCallStatus::Pending` | `item/started` with inProgress |
| running | `ToolCallStatus::InProgress` | item status `inProgress` |
| completed | `ToolCallStatus::Completed` | item status `completed` |
| failed | `ToolCallStatus::Failed` | item status `failed` |
| declined | permission option semantics 或 cancelled response | command/file status `declined` |
| streaming output | `ToolCallUpdate.content` | command/file output delta, MCP progress, patch updated |

ACP 的 action 类型较通用，Codex 的 item 类型更细。统一层要优先保留 `ActionKind`，同时把原始 protocol payload 放到 `raw` 或 `source` 字段，方便 UI 做协议特化展示。

### Elicitation 对齐

| 统一语义 | ACP | Codex |
| --- | --- | --- |
| approval request | `session/request_permission` | command/file/permissions approval request |
| user input request | ACP RFD elicitation 或 agent extension | `item/tool/requestUserInput` |
| external flow | ACP extension | MCP elicitation `mode=url` |
| dynamic client tool | ACP client capability requests | `item/tool/call` |
| resolved | client responds to AgentRequest | client responds to ServerRequest + `serverRequest/resolved` |

统一层应该把“回复协议 request”与“状态已解除”拆开：

```text
ResolveElicitation command
  -> ElicitationResolving
  -> protocol response sent
  -> ElicitationResolved after protocol confirms or request call returns
```

Codex 有 `serverRequest/resolved`，可用它做确认。ACP 没有统一 resolved notification，client 发出 response 后可以把 elicitation 置 resolved，但仍要等后续 tool/action update 决定 action 最终状态。

## `plan_command()` 前置条件

| 命令 | 允许状态 | 拒绝状态 | 说明 |
| --- | --- | --- | --- |
| `StartConversation` | `RuntimeState::Available` | offline/auth/faulted | 创建 conversation 不依赖 selected。 |
| `ResumeConversation` | `Available` | offline/auth/faulted | 如果 local 已有同 remote active conversation，应返回 existing。 |
| `StartTurn` | conversation 可接收新 turn，且 `active_turns < turn.max_active_turns` | `Cancelling/Hydrating/MutatingHistory/Closed` 或达到并发上限 | 默认上限是 1；是否支持并发 turn 由能力表决定。 |
| `SteerTurn` | conversation `Active` 且 `turn.steer` 支持 | 非 active、能力不支持、当前 turn 不可 steer | Codex 用 active turn id 填 `expectedTurnId`；ACP 扩展 adapter 自行映射。 |
| `CancelTurn` | `Active` | `Idle/Closed` | active 有 open elicitation 时先标 cancelling，不主动 drop。 |
| `ResolveElicitation` | elicitation `Open` | resolved/cancelled/stale | cancelling 下 ACP permission 必须回复 cancelled。 |
| `UpdateContext` | `Idle` 或 `Active` | `Closed/Faulted` | active 时只承诺后续步骤或后续 turn 生效。 |
| `MutateHistory` | 通常 `Idle` | `Active/Cancelling/Hydrating` | rollback/compact 不应与 active turn 并行。 |
| `Unsubscribe` | loaded/subscribed | unknown remote | observer only。 |

## 典型转移序列

### ACP: 新建 session 并执行一轮

```text
UI StartConversation
  -> session/new
  -> ConversationProvisionStarted(New)
  -> NewSessionResponse(sessionId)
  -> ConversationReady(Idle)

UI StartTurn(input)
  -> create local TurnId and RemoteTurnId::AcpLocal(sessionId, request id, optional messageId, sequence)
  -> session/prompt pending
  -> TurnStarted
  -> session/update AgentThoughtChunk
  -> ReasoningDelta
  -> session/update ToolCall(Pending)
  -> ActionObserved(Proposed)
  -> session/request_permission
  -> ElicitationOpened(Approval), action AwaitingDecision
  -> UI ResolveElicitation(allow)
  -> ElicitationResolved
  -> session/update ToolCallUpdate(InProgress/Completed)
  -> ActionUpdated(Running/Completed)
  -> session/update AgentMessageChunk
  -> AssistantDelta
  -> PromptResponse(stopReason=end_turn)
  -> TurnTerminal(Succeeded)
  -> Conversation Idle
```

### Codex: active turn 中 steer

```text
UI StartTurn(input)
  -> turn/start
  -> turn/started(turnId)
  -> TurnStarted
  -> thread/status/changed active([])
  -> Conversation Active

UI SteerTurn(extra input)
  -> turn/steer(expectedTurnId = active turnId)
  -> TurnSteered
  -> deltas/items continue on same turn
  -> turn/completed(completed)
  -> TurnTerminal(Succeeded)
  -> thread/status/changed idle
```

如果 `expectedTurnId` 不匹配，Codex 请求失败；兼容层应保持原 active turn，不创建新 turn。

### 取消 active turn

```text
UI CancelTurn
  -> ACP: session/cancel notification
     Codex: turn/interrupt request
  -> Conversation Cancelling, turn Cancelling
  -> close open elicitation as Resolving/Cancelled locally if protocol requires response
  -> continue accepting output/action completion notifications
  -> ACP PromptResponse(cancelled) or Codex turn/completed(interrupted)
  -> TurnTerminal(Interrupted)
  -> Conversation Idle
```

### Codex: rollback

```text
UI MutateHistory(Rollback { num_turns })
  -> precondition: Conversation Idle
  -> thread/rollback
  -> HistoryMutationStarted(Rollback)
  -> response Thread
  -> replace turns/history
  -> HistoryMutationFinished { workspace_reverted: false }
  -> Conversation Idle
```

UI 如果想提供“回滚代码”必须另做工作区 diff/revert；兼容层不能把 `thread/rollback` 解释为文件已恢复。

## 错误和乱序处理

兼容层需要显式处理这些情况：

| 场景 | 建议处理 |
| --- | --- |
| 收到未知 conversation 的 notification | 如果是 discover/start 相关，创建 `Discovered`；否则记录 stale event。 |
| 收到非 active turn 的 delta | 如果 turn terminal 后到达，按 `IgnoreStale` 丢弃；strict 模式报错。 |
| Codex `thread/status idle` 先于 `turn/completed` | 不直接清 active turn；等待 `turn/completed` 或把 turn 标为 terminal unknown 后 reconciliation。 |
| ACP prompt request error | `TurnTerminal(Failed)`，conversation 回 `Idle` 或 `Faulted` 取决于 error。 |
| permission request response 失败 | elicitation 回 `Open` 或 `Faulted`，不要假装 action 已允许。 |
| active turn 中 runtime disconnect | runtime `Faulted`，conversation 保留 `Active/Cancelling` 快照；重连后用 resume/read reconciliation。 |

## 测试策略

Reducer 应该用 table-driven unit tests 覆盖，不依赖真实协议 transport。

建议测试组：

- ACP prompt: `TurnStarted -> deltas -> StopReason` 全部 stop reason。
- ACP cancel: cancel notification 后仍收到 permission request，必须回复 cancelled。
- ACP load hydration: replay updates 只写 history，不打开 active turn。
- Codex normal turn: `turn/started -> item/delta -> turn/completed -> idle`。
- Codex approval: ServerRequest 打开 elicitation，decision 后 `serverRequest/resolved` 关闭。
- Codex steer: active turn id 匹配成功，不匹配保持原状态。
- Capability guard: ACP 标准 adapter 的 `SteerTurn` 返回 `CapabilityUnsupported`；ACP 扩展 adapter 声明 steer 后可以通过同一 reducer 转移到 `TurnSteered`。
- Codex rollback: history 替换且 `workspace_reverted=false`。
- stale events: terminal 后 delta 不复活 turn。
- context scope: Codex `turn/start` overrides 写 `TurnAndFuture`，ACP config 写 `Conversation`。

## 实现边界

最小可落地版本只需要这些能力：

1. `AgentCompat` 状态容器。
2. `CompatCommand` -> `ProtocolEffect`。
3. ACP adapter: initialize/session new-load-resume/prompt/cancel/update/request_permission/config。
4. Codex adapter: initialize/thread start-resume/read/turn start-steer-interrupt/status/item/serverRequest。
5. Reducer table tests。

不要在第一版把所有 Codex config、fs、skills、plugin、realtime 接口都放进主状态机。它们可以作为 `ContextUpdated`、`ActionObserved` 或独立 service 状态扩展接入；主干状态机只负责 conversation/turn/action/elicitation/history/context 的一致性。

## 参考

- ACP source: `vendor/agent-client-protocol/src/v2/agent.rs`
- ACP source: `vendor/agent-client-protocol/src/v2/client.rs`
- ACP source: `vendor/agent-client-protocol/src/v2/tool_call.rs`
- ACP docs: `vendor/agent-client-protocol/docs/protocol/*.mdx`
- Codex help: `codex app-server --help`
- Codex generated protocol: `codex app-server generate-ts --experimental --out <DIR>`
