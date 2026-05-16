# Desktop Agent Runtime QA Checklist

这份清单用于验证一个 agent runtime 在 desktop 内是否表现正常。它以
[`desktop/docs/qa-checklist.md`](./qa-checklist.md) 的桌面高频 path 为基础，
但测试对象收窄到单个 agent 从初始化到恢复历史的完整生命周期。

默认执行对象：`Codex`。测试其他 agent 时，保留同一清单，把 agent 特有能力记录在
“Agent 特定能力”小节。

自动化工具：测试时使用 `$agent-browser`，也就是 `agent-browser` CLI 连接真实
Electron CDP target 后按 snapshot/ref 工作流执行；不要直接打开 Vite renderer URL 来
替代 desktop app。

## 判定标准

- 用户能在 `New chat`、standalone chat、project chat 三种入口稳定选择并使用该
  agent。
- agent 的 model、reasoning effort、agent mode、permission mode、tool/permission/input 能力来自
  engine/client snapshot，而不是 desktop 侧硬编码。
- `Plan` / `Build` 快捷切换必须按当前 runtime 的 snapshot 选择正确通道：有些 agent
  通过 agent mode 实现 plan，有些通过 permission mode 实现 plan，不能在 desktop 侧
  假设二者等价。
- Permission 测试验证的是 Angel Engine 对 agent 边界事件的归一化、投影和 resolve
  流程，不评价 agent 本身的默认权限策略。
- 消息、reasoning、tool call、permission、elicitation、plan、todo、附件、文件
  mention、错误和取消都能被 UI 正确投影。
- 运行中、后台、重启、hydrate、route 切换、多 chat 并发这些状态不会丢消息、卡住
  composer、污染其他 chat，或让 sidebar/header 显示错误状态。
- 失败时有可见反馈；没有 blank page、crash overlay、Vite overlay、未捕获异常或无
  限 loading。

## 环境准备

1. 安装依赖。

   ```sh
   yarn --cwd desktop
   ```

2. 如果改过 Rust engine/client、NAPI crate、snapshot/event/settings 类型，先重建
   native client。

   ```sh
   npm --prefix crates/angel-engine-client-napi run build
   ```

3. 准备测试目录、附件和可被修改的文件。

   ```sh
   mkdir -p /tmp/angel-engine-agent-qa/project/src
   printf 'hello from project\n' > /tmp/angel-engine-agent-qa/project/src/hello.txt
   printf 'before codex edit\n' > /tmp/angel-engine-agent-qa/project/src/edit-me.txt
   printf 'attachment text\n' > /tmp/angel-engine-agent-qa/attachment.txt
   ```

4. 启动 desktop，并用 `$agent-browser` 连接真实 Electron CDP target。

   ```sh
   npm --prefix desktop start -- -- --remote-debugging-port=9222
   agent-browser --session angel-agent-qa connect 9222
   agent-browser --session angel-agent-qa tab
   agent-browser --session angel-agent-qa snapshot -i
   ```

5. 基础 gate。

   ```sh
   npm --prefix desktop run typecheck
   npm --prefix desktop run format:check
   git diff --check
   ```

6. 当前 `npm --prefix desktop run lint` 依赖 ESLint 10，但仓库没有
   `eslint.config.*`。在配置迁移前不要把它当 blocking gate。

## 结果记录位置

本文件只维护 QA 清单，不保存具体执行结果。每次执行时，把运行记录、截图、失败项和
issue 写到单独的 run report，例如
`qa-runs/agent-runtime/YYYY-MM-DD-<agent>.md`。不要在本清单末尾追加 `Passed`、
`Failed`、`Blocked` 或具体 issue 结果。`qa-runs/` 是专门给本地执行产物用的目录，
可以整体加入 `.gitignore`。

每份 run report 至少填这些字段：

- Date:
- Agent:
- App command:
- CDP port/session:
- Project path:
- Commit/worktree state:
- Gates run:
- Passed:
- Failed:
- Blocked:
- Notes:
- Coverage matrix:
  - Basic send:
  - Model/effort/agent mode/permission mode config:
  - Plan/build or equivalent planning mode:
  - Cancel/interrupt:
  - Permission request:
  - Tool call:
  - Attachment/file mention:
  - Hydrate/restart:

每个 matrix 项必须写 `passed`、`failed`、`blocked` 或 `not supported`，不能留空。某
agent 不支持某能力时，记录它的 snapshot/UI 证据或 runtime 能力判断，而不是跳过。

发现问题时用这个格式记录，截图或视频路径可选但推荐：

```md
### ISSUE-001: <title>

- Severity:
- Area:
- Repro:
- Expected:
- Actual:
- Evidence:
- Notes:
```

## 1. 启动和 Runtime 初始化

覆盖：Electron main/preload/renderer、agent settings、runtime inspect、prewarm、
snapshot config。

- [ ] App 启动后显示 `New chat`、sidebar、composer，没有 blank page、crash overlay
      或 Vite overlay。
- [ ] `New chat` 默认 agent 正确，默认值来自 Settings/localStorage 清洗后的
      canonical runtime id。
- [ ] 打开 agent/model/reasoning 菜单时，agent 列表包含 canonical product ids 对应
      的显示名，例如 `Codex`。
- [ ] 选择 `Codex` 后不清空 composer 文本，不跳 route，不创建多余 chat。
- [ ] runtime config inspect 完成后 model、reasoning effort、agent mode、permission
      mode 正常显示；加载失败时 UI 有可见错误或 fallback，不崩溃。
- [ ] 连续打开/关闭配置菜单不会重复创建不可见运行态，也不会让 model 列表回到硬编码
      默认值。
- [ ] Console/errors 没有初始化阶段的未捕获异常。

## 2. Agent / Model / Reasoning / Mode 配置

覆盖：composer menu、draft config、persisted unstarted chat、started chat 禁用逻辑、
`set_model`、`set_mode`、`set_permission_mode`。

- [ ] 在 `New chat` 中切换 agent 到 `Codex`，model/effort 列表随 Codex snapshot 更
      新。
- [ ] 在 model 搜索框输入关键字时菜单不意外关闭，过滤结果可键盘和鼠标选择。
- [ ] 切换 model 后 composer 菜单、header/runtime config 显示同一个值。
- [ ] 切换 reasoning effort 后 composer 菜单、header/runtime config 显示同一个值。
- [ ] Agent Mode 菜单只显示 engine/client 投影出的 agent mode；Permission Mode 菜单
      只显示 engine/client 投影出的 permission mode，二者不会互相污染。
- [ ] 切换 agent mode 后 composer 菜单、header/runtime config 显示同一个值，下一轮
      发送使用同一个 agent mode。
- [ ] 切换 permission mode 后 composer 菜单、header/runtime config 显示同一个值，下
      一轮发送使用同一个 permission mode。
- [ ] 切换 `Plan` / `Build` 快捷按钮后状态正确，并且下一轮发送使用该 agent 实际支持
      的 agent mode 或 permission mode。
- [ ] 在未发送消息的 persisted chat 中可以切换 agent，并清除旧 agent 不兼容的
      model/effort/agent mode/permission mode。
- [ ] 在已开始 chat 中 agent 切换入口禁用或无法提交，并显示明确原因。
- [ ] 运行中不能切换 agent/model/effort/agent mode/permission mode；UI 给出 disabled
      状态或说明。
- [ ] 同一 chat 中第二次发送沿用上一轮确认过的 runtime config，除非用户显式修改。

## 3. Standalone Chat 基础对话

覆盖：chat create/prewarm、assistant-ui runtime adapter、stream IPC、sidebar、route。

- [ ] 在 `New chat` 输入短消息并发送。
- [ ] user message 立即显示，composer 清空。
- [ ] URL 从 draft/new chat 进入真实 chat route。
- [ ] sidebar 新增 chat，标题根据首条 prompt 合理生成和截断。
- [ ] assistant message 开始 streaming 或显示 running 状态。
- [ ] streaming 期间 composer 显示 cancel，send disabled。
- [ ] 完成后 composer 恢复可输入，sidebar running 状态清除。
- [ ] 发送第二条消息复用同一个 chat，不新增重复 sidebar item。
- [ ] 切到其他 route 再回来，当前消息和运行状态保持一致。
- [ ] Console/errors 没有发送阶段的未捕获异常。

建议 Codex prompt：

```text
Say exactly: codex desktop QA ping
```

## 4. 长任务、取消、打断和恢复输入

覆盖：abort signal、active stream abort、interrupt/steer path、pending run state、
post-cancel continuation。

- [ ] 发送长任务后能看到 assistant 正在输出或 pending。
- [ ] 点击 `Cancel` 后输出停止，running 状态清除。
- [ ] 被取消的 turn 不会继续追加隐藏输出。
- [ ] composer 恢复可输入，后续可以继续发送新消息。
- [ ] sidebar/header 的 running/attention 状态和当前 chat 一致。
- [ ] 取消正在等待 permission/input 的 run 后，卡片不会永久阻塞新消息。
- [ ] 快速连续点击 cancel 不会抛异常或产生重复 toast。
- [ ] 如果 UI/runtime 支持运行中打断、steer 或追加用户指令，运行中提交一条短打断指
      令，确认它进入当前 active turn，而不是创建重复 chat 或丢失原 run 状态。
- [ ] 如果该 agent 不支持运行中追加输入，run report 明确记录 `interrupt not
supported`，并把 `Cancel` 作为该 agent 的打断路径覆盖。
- [ ] 打断或 cancel 后立刻发送 follow-up，确认后续 turn 能正常开始、输出和 sidebar
      状态不串到上一轮。

建议 Codex prompt：

```text
Count from 1 to 50 slowly, one number per line.
```

## 5. Permission 和用户输入

覆盖：permission card、elicitation resolve、permission bypass、attention indicator。

- [ ] 先识别该 agent 的权限策略，不把“默认允许某类命令”当成 desktop/engine 问题。
      例如 OpenCode 可能会直接运行大部分命令，Claude Code 默认通常更严格。
- [ ] 为当前 agent 找到会跨过权限边界的安全动作。只使用 `/tmp/angel-engine-agent-qa`
      下的 fixture，逐级尝试：只读 shell、写入临时文件、编辑 project 文件、删除临
      时文件、访问非 cwd 的 fixture 文件。
- [ ] 如果 agent/runtime 暴露显式 permission request 工具或命令，优先用它触发
      permission 确认；不要只依赖普通 shell/write 是否自然触发。
- [ ] 如果低风险动作没有触发确认，继续升级到该 agent 会请求确认的边界动作；目标是
      触发 Angel Engine 的 permission/elicitation 投影，而不是证明 agent 本身有问题。
- [ ] 触发确认后，消息中出现 permission UI，且 UI 内容能说明将执行的动作。
- [ ] `Deny` 后对应动作不执行，agent 收到拒绝结果，chat 不死锁。
- [ ] `Allow` 后动作继续执行，tool result 和最终 assistant message 正常渲染。
- [ ] `Cancel` 或关闭 permission/input UI 后，agent 收到取消/拒绝结果，run 不永久
      running，composer 能恢复。
- [ ] 如果显示 `Bypass permission`，启用后只影响当前 chat/run slot，不影响其他 chat。
- [ ] 支持 session/always allow 的 agent，验证 session 级授权只影响当前 chat/session
      的后续安全 fixture，不污染其他 chat。
- [ ] 切到其他 chat 时，等待 permission 的 chat 在 sidebar/header 有 attention 提示。
- [ ] 回到该 chat 并处理 permission 后，attention 提示清除。
- [ ] agent 提问需要用户输入时，文本输入或选项 UI 可提交；取消后 agent 能收到取消结
      果，不无限等待。
- [ ] permission/input 卡片在 hydrate 后仍能显示正确终态。
- [ ] 如果穷尽本轮安全边界动作仍没有触发 permission，run report 记录为
      `permission boundary not reached`，不是失败；下一轮需要换 agent、模式或更贴近该
      agent 权限策略的安全边界动作。

建议 Codex prompt：

```text
In /tmp/angel-engine-agent-qa/project, create a temporary file named
permission-boundary.txt with the text "permission boundary", then show its final
content.
```

Agent 差异提示：

- Codex 如果默认配置没有触发 permission UI，不算失败。需要专门验证 Codex 权限确认
  时，可用本地 wrapper 启动 runtime，例如给 `codex` 追加
  `-c 'approval_policy="on-request"'`、`-c 'approvals_reviewer="user"'`、
  `-c 'sandbox_mode="read-only"'`、`-c 'features.exec_permission_approvals=true'`
  和 `-c 'features.request_permissions_tool=true'`，再执行本节安全 fixture。
- OpenCode 这类默认较宽松的 agent，如果普通 shell/write 操作直接运行，继续用
  `/tmp/angel-engine-agent-qa` 下的删除、覆盖、跨 cwd 读取等安全 fixture 动作寻找确认
  边界。
- Claude Code 这类默认较严格的 agent，简单 shell、文件读取或文件写入就可能触发确
  认；仍然要分别覆盖 `Deny`、`Allow`、取消和后台 attention。
- 如果某个 agent 支持权限模式切换，先记录当前模式，再在不会影响其他 chat 的前提下
  切到能触发确认的模式。

## 6. Tool Call、Reasoning 和输出投影

覆盖：tool group、action phases、reasoning、usage/model info、markdown/code rendering。

- [ ] shell/file/read/write 等 tool call 以 tool group 或等价 UI 显示。
- [ ] tool 状态从 pending/running 进入 completed/failed/cancelled 时，图标、文案和折
      叠状态合理。
- [ ] 失败 tool 有错误信息，不吞掉 stderr 或 adapter 错误。
- [ ] reasoning 内容存在时显示在 reasoning 区，不覆盖最终文本。
- [ ] completed 后 reasoning/tool UI 不再显示 running 动画。
- [ ] markdown、代码块、列表、链接、表格正常渲染。
- [ ] message hover actions（copy/edit/quote 等高频 action）不报错。
- [ ] token usage、model、turn id 这类 metadata 如果 UI 显示，值来自 snapshot/run
      result。

建议 Codex prompt：

```text
Inspect /tmp/angel-engine-agent-qa/project/src/hello.txt and respond with a
Markdown table containing the filename and first line.
```

## 7. 文件编辑和 Project CWD

覆盖：project route、cwd projection、Codex file edits、tool result、dirty file visibility。

- [ ] 创建 project 时取消 directory picker 不创建 project，也不报错。
- [ ] 添加 `/tmp/angel-engine-agent-qa/project` 后 project 出现在 sidebar。
- [ ] project chat route、header、sidebar active state 一致。
- [ ] project chat 中发送消息时 runtime cwd 使用 project path。
- [ ] 请求 agent 编辑 project 文件时，permission/工具/输出都绑定当前 project chat。
- [ ] 编辑完成后磁盘文件实际改变，且 assistant message 说明改动。
- [ ] standalone chat 不应默认使用 project cwd。
- [ ] 删除 project 后 project chat 从 sidebar 消失；如果当前在 project route，回到安
      全页面。
- [ ] 删除 project 不删除磁盘目录。

建议 Codex prompt：

```text
Append the line "edited by codex desktop QA" to src/edit-me.txt, then show the
final file content.
```

## 8. 附件和 Project 文件 Mention

覆盖：attachment input、drag/paste、file path bridge、project file search、runtime
attachment projection。

- [ ] 点击附件按钮选择 `/tmp/angel-engine-agent-qa/attachment.txt`。
- [ ] composer header 出现附件 tile，文件名、大小、删除按钮正确。
- [ ] 删除附件后 tile 消失，发送内容不包含已删除附件。
- [ ] 发送带附件的消息后，user message 显示附件，runtime 收到附件输入。
- [ ] 在 project chat 输入 `@hello` 时出现 `src/hello.txt` 搜索结果。
- [ ] 选择 mention 后 composer header 出现 mention tile。
- [ ] 发送 mention 后 runtime 收到 file mention，并能读取对应文件。
- [ ] standalone chat 输入 `@` 不触发 project 文件搜索。
- [ ] 附件读取失败或超限时显示可理解错误，不创建半残消息。

建议 Codex prompt：

```text
Use the attached file and the mentioned project file to summarize both first
lines in two bullets.
```

## 9. Plan / Build / 规划模式流程

覆盖：agent plan/build 或等价规划模式、plan card、todo、Start implementation、agent
mode / permission mode transition。

- [ ] 对每个 agent 先从 runtime snapshot/UI 分别记录可用 agent mode 和 permission
      mode；如果有 `Plan`、`Ask`、`Agent`、`Auto Edit`、`Act`、`Build` 等规划/执行模
      式，都要至少覆盖一次切换和发送。
- [ ] 切到 `Plan` 或该 agent 的等价规划模式后发送规划类 prompt，runtime 使用所选
      agent mode 或 permission mode，而不是回落到默认 build/act。
- [ ] plan/todo card 或普通 assistant plan text 正常显示，内容可读；只有 runtime
      明确输出 structured plan/todo 时才要求状态更新清楚。
- [ ] 如果出现 `Start implementation`，点击后通过正确的 agent mode 或 permission
      mode 切到 build/act 模式并发送实现请求。
- [ ] build 实现期间 permission、tool call、file edit 正常走同一个 chat。
- [ ] 从 build 再切回 plan 时，按钮状态和 runtime agent mode / permission mode 一
      致。
- [ ] 运行中 plan/build toggle 禁用。
- [ ] hydrate 后 structured plan/todo 历史可恢复，不变成普通未结构化 JSON；如果该
      runtime 原本只输出普通 assistant plan text，则按普通 assistant message
      恢复是正确行为。
- [ ] 如果该 agent 没有规划模式，run report 记录为 `plan mode not supported`；如果
      只输出普通 assistant plan text，不记录为失败。
- [ ] 如果该 agent 明确不支持 plan mode，不继续强行测试 plan flow，只在 run report
      记录 `plan mode not supported` 和对应 snapshot/UI 证据。

建议 Codex prompt：

```text
Plan a two-step change for src/edit-me.txt. Do not edit files yet.
```

## 10. 历史恢复和 App 生命周期

覆盖：runtime hydrate/replay、desktop DB metadata、window reload、process restart。

- [ ] 重载 renderer 后，sidebar chat metadata 恢复，当前 route 不进入 blank page。
- [ ] 打开已有 Codex chat 后，历史消息来自 runtime hydrate/replay，而不是 desktop DB
      存储的消息副本。
- [ ] 恢复后的 user/assistant/tool/reasoning/permission 终态和重载前一致。
- [ ] 已完成 chat 的 composer 可继续发送新消息。
- [ ] 未完成或被取消的 run 恢复后状态合理，不永久 running。
- [ ] 完全退出并重新启动 app 后，chat/project metadata 保持。
- [ ] runtime remote thread id 关联正确，不把 chat A 的历史恢复到 chat B。

## 11. 多 Chat、后台和通知

覆盖：active chat tracking、background run、attention state、click-to-open route。

- [ ] chat A 运行中切到 chat B，chat A 在 sidebar 显示 running。
- [ ] chat A 完成后有后台提示或系统通知；当前可见 active chat 不重复通知。
- [ ] 点击通知后窗口聚焦并打开 chat A。
- [ ] chat A 等待 permission/input 时，sidebar/header 有 attention 提示。
- [ ] 同时运行两个 Codex chat 时，输出、权限、取消互不串线。
- [ ] cancel chat A 不影响 chat B。
- [ ] chat B 切换 runtime config 不影响 chat A。

## 12. Sidebar、Route 和 Chat 管理

覆盖：router、active state、context menu、rename/delete、invalid route。

- [ ] 点击 `New chat`、standalone chat、project chat、Settings 后 route/header/sidebar
      active 状态一致。
- [ ] 右键 Codex chat，`Rename` 后 sidebar/header 同步更新。
- [ ] 删除非当前 chat 只移除对应 item，不影响当前 chat。
- [ ] 删除当前 chat 后回到首页，运行态 session 被关闭或不再投影到 UI。
- [ ] 访问不存在的 chat/project route 时回到安全页面，不出现 blank page。
- [ ] 后台完成或等待输入的提示在打开对应 chat 后清除。

## 13. Settings 和上次使用的 Agent

覆盖：settings page、last agent localStorage、draft agent initialization。

- [ ] Settings 中没有默认 agent 选择项。
- [ ] 完成一次 Codex chat 后，回到 `New chat`，draft 使用 `Codex`。
- [ ] runtime config 加载后恢复上次 model、reasoning effort、agent mode、permission mode。
- [ ] 重启 app 后上次使用的 agent 和配置保持。
- [ ] localStorage 中写入非法 runtime id 后，app 清洗为安全默认值，不崩溃。
- [ ] `Delete all chats` 取消时不删除；确认后 chat 清空，project 保留，route 回首页。
- [ ] 清空 chat 后新建 Codex chat 仍能初始化 runtime config。

## 14. 错误、离线和缺依赖状态

覆盖：runtime binary/auth missing、adapter errors、IPC rejection、toast/error UI。

- [ ] Codex 未登录或运行失败时，UI 显示可理解错误，composer 可恢复。
- [ ] runtime inspect 失败时，agent 菜单仍可关闭，app 不崩。
- [ ] 发送时 adapter 返回错误，assistant message 或 toast 能展示失败原因。
- [ ] tool call 失败后，tool group 终态是 failed，后续消息可继续发送。
- [ ] permission/input resolve IPC 失败时，UI 不无限 pending。
- [ ] 网络或 provider 错误不会创建重复 chat 或错误 remote thread id。
- [ ] Console/errors 没有未处理 promise rejection。

## 15. 可访问性和键盘路径

覆盖：keyboard navigation、focus management、menus/dialogs、screen-reader labels。

- [ ] `Tab` 能进入 sidebar、composer、agent menu、send/cancel、message actions。
- [ ] `Enter`/`Cmd+Enter` 发送行为与设计一致，IME 组合输入不误发送。
- [ ] `Esc` 能关闭菜单/dialog，不丢 composer 内容。
- [ ] agent/model/reasoning menu 有可见 focus ring，键盘选择不会跳 route。
- [ ] permission/input UI 可通过键盘选择并提交。
- [ ] Rename/Delete dialog focus trap 正常，取消/确认路径明确。
- [ ] 图标按钮有 tooltip 或 accessible name。

## 16. Agent 特定能力

Codex 额外验证：

- [ ] model catalog 来自 Codex adapter 解析结果。
- [ ] reasoning effort 使用 Codex 支持的 effort level，并在发送请求中生效。
- [ ] Codex plan/build mode 能通过 engine/client mode primitive 投影到 desktop。
- [ ] Codex hydrate replay 中的历史 chunks 被 adapter 规范化后进入 engine state。
- [ ] Codex server request/permission 转成 protocol-neutral elicitation 后显示在 UI。
- [ ] Codex tool/action phase 在 desktop 中不依赖 raw Codex payload 分支。
- [ ] Claude Code 的 plan mode 通过 permission mode 投影到 desktop，不通过 ACP 或
      agent mode 兼容分支伪装。
- [ ] ACP/OpenCode 如果通过 config option 暴露 permission/approval mode，desktop
      使用 permission mode primitive；如果通过 session mode 暴露 plan/build，则使用
      agent mode primitive。

测试其他 agent 时，在这里补该 agent 的专属能力，例如 ACP session update、Claude
AskUserQuestion、OpenCode/Qoder/Copilot/Gemini 的 mode/config 差异。
