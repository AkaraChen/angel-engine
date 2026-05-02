# Agent UI 外部控制状态机

本文整理两层协议模型：

- ACP: `vendor/agent-client-protocol` 中的 Agent Client Protocol。它定义通用 Client 和 Agent 之间的 JSON-RPC 方法、通知、能力协商和 session/prompt 生命周期。
- Codex app-server: `codex app-server --help` 暴露的本地 app server，并用 `codex app-server generate-ts --experimental` 生成的协议类型查看具体接口。它不是 ACP 的同名实现，而是 Codex UI 面向的更细粒度 `thread` / `turn` / `item` 模型。

这里说的“状态机”是 UI 可观察、可维护的外部状态机，不等于 agent 内部代码必须有同名 enum。UI 应该用请求响应和通知来归纳状态，而不是假设内部实现细节。

## 一句话结论

如果只看 ACP，agent 的可控状态是：

```text
连接未初始化 -> 已初始化/可选鉴权 -> session ready/idle
  -> prompt turn active
    -> 可选 waiting for permission / tool running
    -> completed/cancelled/refused/limited
  -> session ready/idle
  -> closed
```

如果看 Codex app-server，等价但更细：

```text
thread notLoaded -> thread idle
  -> turn inProgress
    -> thread active(waitingOnApproval | waitingOnUserInput)?
    -> item started/completed 流式更新
    -> turn completed | interrupted | failed
  -> thread idle | systemError
```

实现 UI 时，建议把“会话状态”和“回合状态”分开建模：

- 会话层: 连接、初始化、鉴权、thread/session 是否加载、是否 idle/active/closed。
- 回合层: 当前 turn/prompt 是否 in progress，是否等待审批或用户输入，当前 plan、tool calls、diff、输出流。
- 配置层: model、mode、reasoning effort、sandbox/permission profile、cwd 等，这些可以在 session/thread 或 turn 上变更。

## ACP 模型

ACP 是 JSON-RPC 2.0。Client 是 UI，Agent 是被 UI 控制的 agent 进程。两边都可以发 request，也都可以发 notification。

### ACP 可观察状态

```text
Disconnected
  -> Connected
  -> Initialized
  -> Authenticated?                # 仅当 Agent 要求鉴权
  -> SessionHydrating?             # session/load 会先 replay history
  -> SessionReady / Idle
  -> PromptTurnActive
      -> WaitingForPermission?     # Agent -> Client 的 pending request
      -> ToolPending/ToolRunning?
      -> CancellationPending?
  -> SessionReady / Idle
  -> Closed?
```

关键点：

- `initialize` 之前不能创建 session。
- `session/new`、`session/load`、`session/resume` 之后才有可用 `sessionId`。
- 一个 session 在一个 prompt turn 结束前应视为 active。UI 不应并发发多个 `session/prompt` 到同一 session，除非目标 agent 明确支持。
- `session/load` 会通过 `session/update` 重放历史，重放完成后才返回；UI 可把这段时间标为 hydrating。
- `session/resume` 不重放历史，只恢复上下文。
- `session/cancel` 是 notification，没有直接响应；取消结果体现在原始 `session/prompt` 最终返回 `stopReason: "cancelled"`。

### ACP 可用于改变状态的接口

| 接口 | 方向 | 何时可用 | 结果 |
| --- | --- | --- | --- |
| `initialize` | Client -> Agent | 连接建立后，任何 session 操作前 | 协商协议版本和 capabilities，进入 initialized。 |
| `authenticate` | Client -> Agent | `initialize` 返回 `authMethods` 且 agent 需要鉴权时 | 鉴权成功后才进入可创建 session 的状态。 |
| `session/new` | Client -> Agent | initialized/authenticated 后 | 创建新 session，返回 `sessionId`，可带初始 `modes` 和 `configOptions`。 |
| `session/list` | Client -> Agent | `sessionCapabilities.list` 存在时 | 只发现历史 session，不加载、不改变当前 session。 |
| `session/load` | Client -> Agent | `loadSession: true` 时 | 加载历史 session；agent 先用 `session/update` replay 全量历史，再返回；之后可继续 prompt。 |
| `session/resume` | Client -> Agent | `sessionCapabilities.resume` 存在时 | 恢复 session 但不 replay 历史；返回后 ready。 |
| `session/prompt` | Client -> Agent | session ready/idle 时 | 开始一个 prompt turn；agent 流式发送 `session/update`；请求最终返回 `stopReason`。 |
| `session/cancel` | Client -> Agent notification | prompt turn active 时 | 要求中断当前 turn；UI 仍要接收后续 update，并把 pending permission request 回成 `cancelled`；原 `session/prompt` 返回 `cancelled`。 |
| `session/close` | Client -> Agent | `sessionCapabilities.close` 存在，且 session active/loaded 时 | 等价先 cancel ongoing work，再释放 session 资源；成功返回 `{}`。 |
| `session/set_config_option` | Client -> Agent | session 存在且 agent 返回了 `configOptions` 时；idle 或 active 都可 | 设置某个配置项；返回完整 `configOptions` 当前状态，UI 应整体替换本地配置状态。 |
| `session/set_mode` | Client -> Agent | session 存在且 agent 返回了 `modes` 时；idle 或 active 都可 | 设置当前 mode；响应为空对象。新协议更推荐 `session/set_config_option`。 |
| `session/request_permission` 的响应 | Agent -> Client request，Client 回复 | agent 在 tool call 前请求授权时 | 选择某个 `optionId` 会让 agent 继续、拒绝或记住策略；若 turn 已取消，必须回复 `cancelled`。 |

### ACP 的输出和子状态通知

这些接口主要用于 UI 同步状态，不是 UI 主动改状态：

- `session/update` 是 agent 的主输出流。常见 update 包括 `agent_message_chunk`、`tool_call`、`tool_call_update`、`plan`、`current_mode_update`、`config_option_update`、`session_info_update`。
- tool call 状态是 `pending -> in_progress -> completed | failed`。`pending` 常表示输入还在流式生成，或正在等待审批。
- plan update 每次都发完整 plan，UI 必须整体替换，不要 patch 单个 step。
- `current_mode_update` 和 `config_option_update` 表示 agent 也可以主动改变自身模式或配置。

### ACP prompt 结束原因

`session/prompt` 最终返回 `stopReason`：

- `end_turn`: 正常结束，session 回到 idle。
- `max_tokens`: 到 token 上限，session 回到 idle，UI 可提示继续。
- `max_turn_requests`: 单次用户 turn 内模型请求次数到上限。
- `refusal`: agent 拒绝继续。ACP 文档说明该 user prompt 以及后续内容不会进入下一次 prompt，上层 UI 应明确展示。
- `cancelled`: Client 发过 `session/cancel` 后的语义化成功取消确认。

## Codex app-server 模型

`codex app-server --help` 显示它可以通过以下 transport 运行：

- `stdio://`，默认。
- `unix://` 或 `unix://PATH`。
- `ws://IP:PORT`。
- `off`。

非 loopback websocket listener 支持 `capability-token` 或 `signed-bearer-token` 鉴权。`codex app-server proxy --sock <SOCKET_PATH>` 可以把 stdio bytes 转发到正在运行的 app-server control socket。协议类型可用 `codex app-server generate-ts --experimental --out <DIR>` 生成。

### Codex 状态对象

Codex app-server 的核心对象：

- `Thread`: 类似 ACP session。包含 `id`、`status`、`cwd`、`modelProvider`、`turns`、`name`、`gitInfo` 等。
- `Turn`: 类似 ACP prompt turn。包含 `id`、`status`、`items`、`error`、开始和结束时间。
- `ThreadItem`: turn 内的原子输出或动作，包括 `userMessage`、`agentMessage`、`reasoning`、`plan`、`commandExecution`、`fileChange`、`mcpToolCall`、`dynamicToolCall`、`webSearch`、`contextCompaction` 等。

状态枚举：

```ts
type ThreadStatus =
  | { type: "notLoaded" }
  | { type: "idle" }
  | { type: "systemError" }
  | { type: "active", activeFlags: Array<"waitingOnApproval" | "waitingOnUserInput"> };

type TurnStatus = "completed" | "interrupted" | "failed" | "inProgress";
```

UI 的主状态应该优先从这些通知维护：

- `thread/status/changed`
- `turn/started`
- `turn/completed`
- `item/started`
- `item/completed`
- `item/agentMessage/delta`
- `turn/plan/updated`
- `turn/diff/updated`
- `item/commandExecution/outputDelta`
- `item/fileChange/patchUpdated`
- `serverRequest/resolved`

### Codex 可用于改变状态的接口

| 接口 | 何时可用 | 结果 |
| --- | --- | --- |
| `initialize` | 连接建立后 | 返回 `userAgent`、`codexHome`、platform 信息；client 可通过 capability 开启 experimental API。 |
| `initialized` | `initialize` 成功后，由 client 发 notification | 通知 server 初始化流程结束。 |
| `thread/start` | 初始化后创建新 thread | 返回 `thread` 和当前 runtime 配置，如 model、cwd、approval policy、sandbox、permission profile、reasoning effort。通常进入 idle，等待 `turn/start`。 |
| `thread/resume` | 已有 `threadId`、path 或 history 时 | 恢复 thread，可覆盖 model/cwd/approval/sandbox/permissions/personality 等；返回 thread 和 runtime 配置。 |
| `thread/fork` | 基于已有 thread 分支时 | 创建新 thread，保留历史并可覆盖配置；返回新 thread 和 runtime 配置。 |
| `turn/start` | thread idle 时 | 发送用户输入并启动 turn。返回 `turn`，随后收到 `turn/started`、item/delta、`turn/completed`。turn-scoped overrides 如 `cwd`、`approvalPolicy`、`permissions`、`model`、`effort`、`personality`、`collaborationMode` 会影响本 turn 及后续 turns。 |
| `turn/steer` | 当前 thread 有 active turn 时 | 向正在运行的 turn 注入额外用户输入。必须带 `expectedTurnId`；如果不匹配当前 active turn，请求失败。成功返回 `turnId`。 |
| `turn/interrupt` | 当前 turn in progress 时 | 中断 turn。返回 `{}`；之后应看到 `turn/completed`，turn 状态为 `interrupted`，thread 回到 idle。 |
| `thread/compact/start` | thread 已加载时，通常在 idle 时触发最安全 | 请求上下文压缩。返回 `{}`；通过 `contextCompaction` item 或 `thread/compacted` 通知观察结果。 |
| `thread/rollback` | 需要回滚对话历史时 | 丢弃末尾 `numTurns` 个 turns，返回更新后的 thread。注意只改历史，不会 revert agent 已经写入工作区的文件。 |
| `thread/memoryMode/set` | thread 已加载时 | 设置 thread memory 为 `enabled` 或 `disabled`，返回 `{}`。 |
| `memory/reset` | 需要清空记忆状态时 | 重置 memory，返回 `{}`。影响范围按 Codex 实现处理，UI 应视为全局/跨 thread 的高影响操作。 |
| `thread/name/set` | thread 已加载时 | 设置用户可见名称；返回 `{}`，并可收到 `thread/name/updated`。 |
| `thread/goal/set` | thread 已加载时 | 设置或更新 long-running goal 的 objective/status/token budget，返回 `goal`。 |
| `thread/goal/clear` | thread 有 goal 时 | 清除 goal，返回 `cleared`；可收到 `thread/goal/cleared`。 |
| `thread/metadata/update` | thread 已加载时 | 更新持久化 metadata，例如 Git 信息；不直接改变当前 turn。 |
| `thread/archive` / `thread/unarchive` | 管理历史列表时 | 改变 thread 在列表中的可见/归档状态；archive 返回 `{}`，unarchive 返回 `thread`；对应通知 `thread/archived`、`thread/unarchived`。 |
| `thread/unsubscribe` | UI 不再需要接收某 thread 流时 | 取消订阅该 thread 的后续通知，返回 unsubscribe status；不等于删除或 interrupt。 |
| `thread/increment_elicitation` / `thread/decrement_elicitation` | 外部 helper 有不走 app-server request flow 的用户审批或输入时 | 调整 out-of-band elicitation counter；返回 count 和 timeout 是否 paused。计数大于零时暂停超时核算。 |
| `thread/inject_items` | 需要直接写入 raw Responses API items 时 | 直接改 thread history，不启动用户 turn。该接口偏内部，UI 常规输入不应使用。 |
| `thread/shellCommand` | 需要让 thread 运行 shell command 时 | 返回 `{}`。注意生成类型说明它会保留 shell 语法并以 full access、非 sandbox 运行，普通 UI 应谨慎暴露。 |
| `thread/backgroundTerminals/clean` | 清理 thread 的后台 terminal 时 | 返回 `{}`。 |
| `config/value/write` / `config/batchWrite` | 修改 Codex 配置时 | 改全局或配置层状态，不一定立即改变已经运行中的 turn；更适合设置默认值。 |

### Codex 审批和用户输入接口

这些是 Server -> Client request。它们不出现在 `ClientRequest` 里，但 UI 必须响应，否则 agent 会卡在 `activeFlags`。

| Server request | 出现时机 | Client 响应 | 结果 |
| --- | --- | --- | --- |
| `item/commandExecution/requestApproval` | agent 准备执行命令，且策略要求审批 | `accept`、`acceptForSession`、`acceptWithExecpolicyAmendment`、`applyNetworkPolicyAmendment`、`decline`、`cancel` | 接受则命令继续；session/amendment 类选择会放宽后续同类请求；拒绝或取消会阻止该动作并影响 turn 结果。 |
| `item/fileChange/requestApproval` | agent 准备写文件或扩大写权限 | `accept`、`acceptForSession`、`decline`、`cancel` | 接受则 file change 继续；`acceptForSession` 可放宽本 session；拒绝/取消阻止修改。 |
| `item/permissions/requestApproval` | agent 请求更大的 permission profile | 返回 granted permissions、`scope` 为 `turn` 或 `session`，可带 `strictAutoReview` | 改变本 turn 或本 session 的权限边界。 |
| `item/tool/requestUserInput` | tool 需要额外用户回答 | 返回 question id 到 answer 的映射 | 解除 `waitingOnUserInput`，tool 继续。 |
| `mcpServer/elicitation/request` | MCP server 请求表单或 URL elicitation | `accept`、`decline`、`cancel`，accept 可带结构化 content | 结果回传给 MCP server，影响 tool 后续执行。 |
| `item/tool/call` | dynamic tool 需要 client 端执行 | 返回 content items 和 success | UI/宿主执行工具并把结果交还给 agent。 |

### Codex 配置变更的粒度

Codex app-server 有三种配置入口，UI 需要区分：

1. `thread/start`、`thread/resume`、`thread/fork` 的参数是 thread 初始或恢复时配置。
2. `turn/start` 的 override 是本 turn 生效，并按生成类型注释影响后续 turns。例如 `model`、`effort`、`approvalPolicy`、`permissions`、`cwd`。
3. `config/value/write`、`config/batchWrite` 是配置文件/全局层变更。它更像默认值管理，不应假设它会改掉当前 active turn。

## ACP 和 Codex 的映射

| ACP 概念 | Codex app-server 概念 | UI 里的建议模型 |
| --- | --- | --- |
| `session` | `thread` | Conversation/session。存 `id`、cwd、title/name、runtime config、history。 |
| `session/prompt` | `turn/start` | 用户发起一个新回合。 |
| `session/cancel` | `turn/interrupt` | 中断当前回合。 |
| `session/update` message chunks | `item/agentMessage/delta`、`item/started`、`item/completed` | 流式输出和 item 生命周期。 |
| `session/update` plan | `turn/plan/updated`、`item/plan/delta` | 当前执行计划。 |
| `tool_call` / `tool_call_update` | `ThreadItem` 中的 command/file/MCP/dynamic tool items | 工具调用列表及状态。 |
| `session/request_permission` | `item/*/requestApproval`、`item/tool/requestUserInput` | 审批或用户输入 pending 状态。 |
| `session/set_config_option` | `turn/start` overrides、`thread/*` config、`config/*` | 配置变更。Codex 没有单一等价接口。 |
| `session/load` / `session/resume` | `thread/resume` | 恢复历史或 live state。 |
| `session/close` | 没有完全同名核心接口；可用 `turn/interrupt` + `thread/unsubscribe` 表示停止和取消订阅 | 不要把 unsubscribe 当作 close/free resources。 |

## UI 实现建议

1. 以 notification 为准维护状态。请求成功只说明操作被接受，最终状态仍应从 `thread/status/changed`、`turn/completed`、`item/completed` 等事件落地。
2. 对同一 thread 做单 active turn 约束。idle 时用 `turn/start`，active 时用 `turn/steer` 或 `turn/interrupt`。
3. 取消是两阶段。发 `turn/interrupt` 或 ACP `session/cancel` 后，UI 先进入 cancellation pending，继续消费输出，直到收到 turn/prompt 的终态。
4. 审批是 active 的子状态。看到 approval request 时，把 thread 标为 waiting；响应后等待 `serverRequest/resolved` 或 item 状态更新。
5. 配置变更要记录作用域。区分本 turn、后续 turns、本 session、全局默认值，避免 UI 显示和实际行为错位。
6. rollback 只回滚对话，不回滚文件系统。若 UI 提供“撤回到某 turn”，必须另行处理工作区 diff。
7. 对 `thread/shellCommand`、`thread/inject_items`、`memory/reset` 这类高影响接口加明确确认或隐藏在开发工具里。

## 参考

- ACP docs: `vendor/agent-client-protocol/docs/protocol/overview.mdx`
- ACP prompt lifecycle: `vendor/agent-client-protocol/docs/protocol/prompt-turn.mdx`
- ACP session setup: `vendor/agent-client-protocol/docs/protocol/session-setup.mdx`
- ACP config/modes: `vendor/agent-client-protocol/docs/protocol/session-config-options.mdx`、`vendor/agent-client-protocol/docs/protocol/session-modes.mdx`
- ACP tool permissions: `vendor/agent-client-protocol/docs/protocol/tool-calls.mdx`
- Codex app-server help: `codex app-server --help`
- Codex generated protocol: `codex app-server generate-ts --experimental --out <DIR>`
