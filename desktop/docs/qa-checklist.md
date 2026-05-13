# Desktop QA Checklist

这份清单覆盖 Angel Engine desktop 的主流程回归测试。重点验证 renderer UI、Electron preload、主进程 IPC、runtime session、chat/project 本地数据库，以及 assistant-ui runtime adapter 之间的端到端行为。

## 相关代码入口

- Workspace 生命周期和路由：`desktop/src/app/workspace/workspace-page.tsx`
- Composer、agent/model/mode、附件、文件 mention：`desktop/src/features/chat/components/assistant-composer.tsx`
- 消息、tool call、permission、plan/todo 展示：`desktop/src/features/chat/components/messages.tsx`
- 运行状态、取消、permission bypass、stream accumulation：`desktop/src/features/chat/state/chat-run-store.ts`
- Runtime adapter：`desktop/src/features/chat/runtime/app-runtime-provider.tsx`、`desktop/src/features/chat/runtime/engine-model-adapter.ts`
- Chat IPC 和主进程 session：`desktop/src/main/features/chat/ipc.ts`、`desktop/src/main/features/chat/angel-client.ts`
- Chat/project 持久化：`desktop/src/main/features/chat/repository.ts`、`desktop/src/main/features/projects/repository.ts`
- Project sidebar 和文件搜索：`desktop/src/features/projects/components/project-sidebar-section.tsx`、`desktop/src/main/features/projects/file-search.ts`

## 环境准备

- 安装 desktop 依赖：

  ```sh
  yarn --cwd desktop
  ```

- 确认 native client 已构建。改过 Rust、NAPI、snapshot/event/settings 类型后先跑：

  ```sh
  npm --prefix crates/angel-engine-client-napi run build
  ```

- 常规静态检查：

  ```sh
  npm --prefix desktop run typecheck
  npm --prefix desktop run format:check
  git diff --check
  ```

- 当前 `npm --prefix desktop run lint` 依赖 ESLint 10，但仓库没有 `eslint.config.*`。在配置迁移前不要把这个命令作为 blocking gate。

## 启动和浏览器验证

### 手动启动

- 运行：

  ```sh
  npm --prefix desktop start
  ```

- 期望：
  - Electron 窗口打开，标题为 Angel Engine。
  - 首页显示 `New chat` 和 composer。
  - sidebar 显示 `Projects`、`Chats`、`Settings`。
  - 没有 Vite/Electron crash overlay。
  - 主进程日志没有 uncaught exception。

### 用 agent-browser 验证 Electron renderer

普通浏览器直接打开 Vite renderer URL 不是有效验证，因为 renderer 依赖 Electron preload，例如 `window.desktopEnvironment.platform`。要连接真实 Electron CDP target：

```sh
npm --prefix desktop start -- -- --remote-debugging-port=9222
agent-browser connect 9222
agent-browser tab
agent-browser wait 1000
```

检查页面和错误状态：

```sh
agent-browser eval 'document.querySelector("[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay") ? "ERROR_OVERLAY" : "OK"'
agent-browser eval 'document.body.innerText.trim().length > 0 ? "HAS_CONTENT" : "BLANK"'
agent-browser eval 'JSON.stringify(window.__consoleErrors || [])'
agent-browser snapshot -i
agent-browser screenshot --annotate
```

期望：

- overlay 检查返回 `"OK"`。
- body 检查返回 `"HAS_CONTENT"`。
- `window.__consoleErrors` 返回 `"[]"`。
- snapshot 至少包含：
  - heading `New chat`
  - textbox `Ask Angel Engine to inspect, patch, test, or explain...`
  - button `Provider, model, and reasoning effort`
  - button `Build` 或 `Plan`
  - button `Send`

## 切换 Agent、模型、推理力度

### 新 chat draft 状态切换

1. 在首页或点击 sidebar 的 `New chat`。
2. 点击 composer 底部的 `Provider, model, and reasoning effort`。
3. 期望打开 `Agent Settings` menu，包含 `Provider`、`Model`、`Effort` 三行。
4. 点击 `Provider` 子菜单。
5. 选择一个不同 agent，例如 `Kimi`。
6. 期望：
   - composer trigger 左侧 provider label 更新为 `Kimi`。
   - model label 切到该 runtime 当前模型，例如 `kimi-for-coding`。
   - URL 保持当前 draft route，不跳转到 `/`，不丢失当前 composer 文本。
   - `Model` 和 `Effort` 的可用性按 runtime config 更新。
7. 切回 `Codex`。
8. 期望：
   - provider label 回到 `Codex`。
   - Codex model list 恢复。

### Model 搜索过滤

这是最近实际跑过的回归路径，细节要保留：

1. 打开 `Agent Settings`。
2. 打开 `Model` 子菜单。
3. 期望子菜单顶部有 `Search models` 输入框。
4. 在搜索框输入 `Spark`。
5. 期望列表只剩匹配项，例如 `GPT-5.3-Codex-Spark`。
6. 点击 `GPT-5.3-Codex-Spark`。
7. 期望：
   - model label 更新为 `GPT-5.3-Codex-Spark`。
   - URL 仍保持当前页面。
   - menu 不触发 new chat、home redirect、project redirect。
   - console error 仍为空。

可用 agent-browser 步骤：

```sh
agent-browser snapshot -i
agent-browser click <provider-model-trigger-ref>
agent-browser snapshot -i
agent-browser click <model-menuitem-ref>
agent-browser fill <search-models-ref> Spark
agent-browser snapshot -i
agent-browser click <spark-menuitem-ref>
agent-browser eval 'location.href'
agent-browser errors
```

### 已开始 chat 的 agent 禁用状态

1. 创建或打开一个已有消息的 chat。
2. 打开 `Agent Settings`。
3. 期望 top-level settings trigger 仍可打开。
4. `Provider` 行应 disabled。
5. hover disabled `Provider` 行。
6. 期望 tooltip 说明原因：
   - 运行中：`Agent cannot be changed while a response is running.`
   - 已开始：`Agent cannot be changed after a chat has started.`
7. 期望 `Model`、`Effort` 仍按 runtime config 能力独立启用或禁用，不能被 provider 锁死误伤。

### 未开始的 persisted chat 切换 agent

1. 从 `New chat` 创建一个 chat，但不要发送消息。
2. 如果该 chat 已出现在 sidebar，打开它。
3. 打开 `Agent Settings`，切换 provider。
4. 期望：
   - chat record 的 runtime 更新。
   - 当前 runtime slot 被重置，旧 config 不残留。
   - route 不变化。
   - 仍能继续发送首条消息。
5. 发送第一条消息后再次打开 `Agent Settings`。
6. 期望 provider disabled 且 tooltip 显示已开始 chat 不能切 agent。

## 对话发送和流式响应

1. 在空 composer 输入一条普通消息，例如 `Say hello in one short sentence.`。
2. 点击 `Send` 或按 Enter。
3. 期望：
   - 空消息时 `Send` disabled；有文本或附件后启用。
   - 发送后 user message 出现在右侧。
   - assistant message 出现在左侧，先显示 `Thinking` 或 reasoning/tool 状态，然后流式输出文本。
   - draft route 自动变成 `/chat/:chatId` 或 `/project/:projectId/:chatId`。
   - sidebar 新增 chat，标题由 prompt 自动生成，最多约 48 字符。
   - chat restore 后消息仍存在，来自 runtime hydrate，不是 desktop DB 存消息。
4. 发送第二轮消息。
5. 期望沿用同一个 chat/session，sidebar 不重复创建 chat。

## 中断运行

1. 发送一条长任务，例如要求扫描项目或生成较长回答。
2. 运行期间确认：
   - composer 显示 `Cancel` 按钮。
   - `Send` disabled。
   - `Provider` disabled，但 settings menu 仍可打开并展示 tooltip。
   - sidebar 对应 chat 显示 running pulse。
3. 点击 `Cancel`。
4. 期望：
   - active run abort，`Cancel` 消失。
   - assistant message 状态变成 cancelled/incomplete，不继续追加 token。
   - 后续可继续发送新消息。
   - 如果 runtime 正在等待 permission，pending elicitation 也会被取消，不应卡住 session。
5. 再次运行任务并在 textarea 聚焦时按 Escape。
6. 期望如果没有 slash/file assist panel，Escape 也能取消运行。

## Permission Check 和 Elicitation

### 普通 permission 请求

1. 发送会触发工具或文件写入权限的请求。
2. 期望 assistant 消息里出现 permission UI，可表现为 inline buttons 或 collapsible card。
3. 检查按钮：
   - `Deny`
   - `Cancel`
   - `Allow session`
   - `Allow`
   - 非 plan approval 时还应有 `Bypass permission`
4. 点击 `Deny`。
5. 期望：
   - runtime 收到 deny。
   - tool/action phase 变成 declined、cancelled 或 failed，不继续执行危险动作。
   - 后续消息仍可发送。
6. 重新触发 permission，点击 `Allow`。
7. 期望：
   - tool/action 从 awaiting decision 进入 running/completed。
   - 输出或错误详情正常渲染。
8. 重新触发 permission，点击 `Allow session`。
9. 期望同一 session 内同类权限按 runtime 语义复用，不要求重复确认。

### Bypass permission

1. 触发非 plan approval 的 permission。
2. 点击 `Bypass permission`。
3. 期望：
   - 当前 permission 自动 allow。
   - 当前 slot 的 permission bypass 状态变为 enabled。
   - 后续 permission elicitation/tool action 在同一 slot 内会被自动批准。
   - `Bypass permission` 按钮禁用，避免重复提交。
4. 切到其他 chat，再触发 permission。
5. 期望 bypass 不跨 slot 泄漏。

### User input elicitation

1. 触发 runtime 提问或需要用户输入的场景。
2. 期望 card 显示问题、选项、Other、secret/password 输入或自由文本输入。
3. 填写答案并点击 `Submit`。
4. 期望卡片 phase 显示 answered/submitting，runtime 继续执行。
5. 点击 `Cancel`。
6. 期望 runtime 收到 cancel，当前 turn 不应无限等待。

## 上传文件和文件 Mention

### 本地附件上传

1. 点击 composer 左下角 `Attach files`。
2. 选择一个文本文件。
3. 期望 composer header 出现附件 tile：
   - type label 为 `File`。
   - 显示文件名。
   - 可点击 remove 移除。
4. 发送消息。
5. 期望 user message 显示附件 tile。
6. 对文本类 MIME，assistant/user message 中应能展示文本 preview。
7. 对图片文件，tile 应显示图片 preview，类型为 `Image`。
8. 主进程收到附件时：
   - 有本地 path 时作为 `resourceLink` 传给 runtime。
   - 无本地 path 的文本作为 `embeddedTextResource`。
   - 无本地 path 的二进制作为 `embeddedBlobResource`。
   - image 作为 image input。

### 拖拽、粘贴和删除

1. 将文件拖到 composer 表单区域。
2. 期望添加为附件。
3. 从剪贴板粘贴图片。
4. 期望添加图片附件。
5. textarea 为空时按 Backspace。
6. 期望删除最后一个附件。
7. 如果文件读取失败，期望 toast 标题为 `Could not read file`。

### Project 文件 mention

1. 先创建 project 并进入 project chat。
2. 在 composer 输入 `@` 或 `@src`。
3. 期望出现 `Files` assist panel。
4. 期望搜索忽略 `.git`、`node_modules`、`dist`、`target` 等目录。
5. 用 Enter、Tab 或点击选择一个文件。
6. 期望：
   - composer header 出现 `Mention` tile。
   - 输入框中的 mention 文本替换成 `@relative/path`。
   - 重复选择同一路径不会重复添加。
7. 发送消息。
8. 期望 runtime 收到 `fileMention`，包含 absolute path、文件名和可选 MIME。

## 切换 Plan 和 Build 模式

1. 在 runtime config 已加载后观察 composer 右侧 toggle。
2. 如果当前是 build/code/default 模式，按钮显示 `Build`，title 为 `Switch to plan mode`。
3. 点击后切到 plan 模式。
4. 期望：
   - 按钮显示 `Plan`。
   - `aria-pressed=true`。
   - 主进程调用 `chatsSetMode` 或 draft mode 更新。
   - 运行中按钮 disabled，不能在 active run 中切换。
5. 再次点击切回 build 模式。
6. 期望按钮显示 `Build`。
7. 在 plan 模式下请求制定计划。
8. 期望 assistant 消息渲染 `Plan` card：
   - 有 entries 时显示完成数。
   - 有 plan path 时显示路径。
   - created/updated 的旧 plan marker 会折叠成 marker，不重复展示完整旧计划。
9. 如果最后一条 plan 是 review plan，且 build mode 可用，期望显示 `Start implementation`。
10. 点击 `Start implementation`。
11. 期望：
    - mode 切到 build。
    - 自动 append `start implementation` 消息。
    - 不在运行中时才允许点击。

## 新建对话

### Standalone new chat

1. 点击 sidebar 顶部 `New chat`。
2. 如果当前已有未开始 standalone chat，期望复用该 chat，不创建重复空 chat。
3. 如果没有可复用未开始 chat，期望创建新 chat 并打开。
4. 期望：
   - route 为 `/chat/:chatId` 或保持 draft route直到发送，取决于入口和当前状态。
   - runtime 使用当前 draft runtime 或 settings default runtime。
   - composer 文本不应因为打开 model menu 被清空。
5. 发送第一条消息后，route 稳定到 `/chat/:chatId`。

### Project new chat

1. hover project 行，点击 `New chat in <project>` 的 plus 按钮。
2. 如果 project 下已有未开始 chat，期望复用。
3. 如果没有，期望创建带 `projectId` 和 project cwd 的 chat。
4. 期望 route 为 `/project/:projectId/:chatId`。
5. Empty state 文案应显示 project 名。
6. 发送消息后，runtime cwd 使用 project path，不是 home 目录。

### Chat context menu

1. 右键 chat item。
2. 选择 `Rename`。
3. 期望弹出 rename dialog，保存后 sidebar 标题更新。
4. 再次右键选择 `Delete`。
5. 期望：
   - chat session close。
   - DB record 删除。
   - 如果删除的是当前 chat，route 回到 `/`。

## 创建 Project

1. 点击 `Projects` header 右侧 `Add project`。
2. 期望 Electron directory picker 打开，title 为 `Choose project folder`。
3. 取消选择。
4. 期望不创建 project，不显示 error toast。
5. 再次点击并选择一个存在的目录。
6. 期望：
   - project 存入 SQLite。
   - sidebar `Projects` 列表出现目录 basename。
   - title tooltip 是完整路径。
   - 新 project 默认展开。
7. 点击 project 行。
8. 期望展开/收起该 project 的 chat 列表。
9. 右键 project。
10. 期望 context menu 包含：
    - `Open in Finder`
    - `Delete`
11. 点击 `Open in Finder`。
12. 期望系统 Finder 打开该路径。
13. 点击 `Delete`。
14. 期望 project 从 sidebar 移除；如果当前 route 属于该 project，导航回 `/`。

## 回归风险重点

- 切换 provider/model 不能触发 `New chat` 导航或 home redirect。
- Draft route、未开始 persisted chat、已开始 chat 三种状态的 agent 切换规则必须不同：
  - draft route 可随时切 runtime。
  - 未开始 persisted chat 可切 runtime，并清掉旧 runtime slot/config。
  - 已开始或运行中 chat 禁止切 runtime，并显示 tooltip。
- model、effort、mode 是 runtime config 能力，不应被 provider lock 误禁用。
- Desktop DB 只存 chat/project metadata，不存消息。消息恢复必须走 runtime hydrate。
- 普通 browser 打开 Vite URL 的 blank page 不能当作 app 失败；Electron preload 缺失会导致 renderer 环境不完整。
- permission bypass 只能影响当前 chat run slot，不能跨 chat 泄漏。
- project file mention 只能在 project chat 中出现，standalone chat 不应触发文件搜索。
