# Desktop QA Checklist

这份清单只覆盖 desktop 高频且用户体验至关重要的手动 QA path。它不是单元测试替代品；底层 schema、工具函数、projection 细节、异常分支和 provider adapter 的组合行为应该优先交给单元测试或集成测试。

## 选择原则

- 用户每天都会走的 path。
- 一旦坏掉会直接阻塞使用、丢上下文、跳错页面、卡住运行或误导用户。
- Electron preload/main/renderer 跨层协作的 path，因为这类问题单靠组件测试不容易发现。
- 手动测试只验证用户可感知结果，不穷举内部实现分支。

## 环境准备

1. 安装依赖。

   ```sh
   yarn --cwd desktop
   ```

2. 如果改过 Rust engine/client、NAPI crate、snapshot/event/settings 类型，先重建 native client。

   ```sh
   npm --prefix crates/angel-engine-client-napi run build
   ```

3. 准备一个测试 project 和附件文件。

   ```sh
   mkdir -p /tmp/angel-engine-qa/project/src
   printf 'hello from qa\n' > /tmp/angel-engine-qa/project/src/hello.txt
   printf 'attachment text\n' > /tmp/angel-engine-qa/attachment.txt
   ```

4. 基础 gate。

   ```sh
   npm --prefix desktop run typecheck
   npm --prefix desktop run format:check
   git diff --check
   ```

5. 当前 `npm --prefix desktop run lint` 依赖 ESLint 10，但仓库没有 `eslint.config.*`。在配置迁移前不要把它当 blocking gate。

## App 启动

覆盖：`main.ts`、`preload.ts`、`renderer.tsx`、`App.tsx`、root providers、Electron window。

1. 启动 app。

   ```sh
   npm --prefix desktop start
   ```

2. 期望：
   - Electron 窗口正常打开。
   - 首页显示 `New chat`、sidebar、composer。
   - sidebar 显示 `Projects`、`Chats`、`Settings`。
   - 没有 blank page、Vite overlay、Electron crash overlay。
   - tooltip、toast、dialog 这类 portal 组件没有 provider missing error。

3. 如果要用浏览器自动化，必须连真实 Electron CDP target，不要直接打开 Vite renderer URL。

   ```sh
   npm --prefix desktop start -- -- --remote-debugging-port=9222
   agent-browser connect 9222
   agent-browser snapshot -i
   agent-browser errors
   ```

## 新建对话和发送消息

覆盖：chat create/prewarm、assistant-ui runtime adapter、stream IPC、chat-run-store、sidebar 更新、route 更新。

1. 在首页输入一条短消息并发送。
2. 期望：
   - user message 立刻显示。
   - assistant message 开始流式响应或显示 running 状态。
   - URL 从 draft/new chat 状态稳定到真实 chat route。
   - sidebar 新增 chat，标题合理截断。
   - 运行结束后 composer 恢复可输入。
3. 再发送第二条消息。
4. 期望复用同一个 chat，不重复创建 sidebar item。
5. 重启 app 后打开这个 chat。
6. 期望 chat metadata 恢复，历史消息通过 runtime hydrate/replay 恢复，不依赖 desktop DB 存消息。

## 切换 Agent / Model / Effort

覆盖：composer menu、runtime config、draft setting、persisted unstarted chat、started chat 禁用逻辑。

1. 在 `New chat` 打开 `Provider, model, and reasoning effort`。
2. 切换 agent，例如 Codex 和 Kimi/Claude Code 之间来回切。
3. 期望：
   - 只更新 composer 当前选择，不跳回 home，不清空 composer 文本。
   - model/effort 列表随 agent 更新。
   - model 搜索框可以过滤模型，输入时 menu 不意外关闭。
4. 在未开始的 persisted chat 中切换 agent。
5. 期望可以切换，并且不会保留旧 runtime 的不兼容 model/effort。
6. 在已经发送过消息的 chat 或正在运行的 chat 中尝试切换 agent。
7. 期望切换入口禁用或不可提交，并通过 tooltip 告诉用户为什么现在不能切换。

## Plan / Build 模式

覆盖：mode toggle、runtime available modes、draft mode、persisted chat mode。

1. 在支持模式切换的 chat 中点击 `Plan` / `Build` toggle。
2. 期望：
   - 按钮状态和文案正确切换。
   - 当前 chat 的 mode 被更新。
   - 正在运行时不能切换，并且 UI 给出明确禁用状态。
3. 在 plan 模式请求生成计划。
4. 期望 plan card 正常显示。
5. 如果出现 `Start implementation`，点击后应切到 build 模式并发送实现请求。

## 中断运行

覆盖：renderer cancel、preload stream cancel、main active stream abort、runtime pending state。

1. 发送一个较长任务。
2. 运行中确认：
   - composer 显示 `Cancel`。
   - `Send` disabled。
   - sidebar 对应 chat 有 running 状态。
3. 点击 `Cancel`。
4. 期望：
   - 流式输出停止。
   - running 状态消失。
   - composer 恢复可输入。
   - 后续可以继续发送新消息。
   - 如果当时正在等 permission/input，也不会卡住 session。

## Permission / 用户输入

覆盖：permission card、elicitation resolve、bypass permission、attention indicator。

1. 触发一次会请求权限的操作。
2. 期望消息中出现清晰的 permission UI。
3. 分别验证 `Deny` 和 `Allow`：
   - `Deny` 后危险动作不继续执行，chat 不死锁。
   - `Allow` 后动作继续执行并渲染结果。
4. 对非 plan approval 的 permission 验证 `Bypass permission`。
5. 期望 bypass 只影响当前 chat/run slot，不影响其他 chat。
6. 触发 runtime 需要用户输入的问题。
7. 期望输入/选择答案后 runtime 继续，取消后不无限等待。

## 上传文件和 Project 文件 Mention

覆盖：attachment input、drag/paste、file path bridge、project file search、runtime attachment projection。

1. 点击附件按钮选择 `/tmp/angel-engine-qa/attachment.txt`。
2. 期望 composer header 出现附件 tile，可删除。
3. 发送带附件的消息。
4. 期望 user message 显示附件，runtime 收到附件输入。
5. 在 project chat 输入 `@hello`。
6. 期望出现 project file 搜索结果。
7. 选择 `src/hello.txt`。
8. 期望 composer header 出现 mention tile，发送后 runtime 收到 file mention。
9. standalone chat 输入 `@` 不应该触发 project 文件搜索。

## Project 创建和 Project Chat

覆盖：directory picker、project DB、project route、project chat cwd、sidebar project section。

1. 点击 `Projects` 的添加按钮。
2. 取消 directory picker。
3. 期望不创建 project，不报错。
4. 再次添加 `/tmp/angel-engine-qa/project`。
5. 期望 project 出现在 sidebar，名称和 tooltip 正确。
6. 在 project 下创建 chat 并发送消息。
7. 期望：
   - route 是 project chat route。
   - chat 显示在 project 下，不出现在 standalone Chats。
   - runtime cwd 使用 project path。
8. 删除 project。
9. 期望 project 和其 chat 从 sidebar 消失；如果当前正在该 project route，回到首页。

## Sidebar 和导航

覆盖：router、workspace shell、chat/project active state、context menu、settings route。

1. 点击 `New chat`、已有 chat、project chat、Settings。
2. 期望 route、header、sidebar active 状态一致。
3. 右键 chat，验证 Rename 和 Delete。
4. 期望重命名后 sidebar/header 同步；删除当前 chat 后回到首页。
5. 访问不存在的 route 或不存在的 chat id。
6. 期望回到安全页面，不出现 blank page。
7. 后台 chat 完成或等待输入时，sidebar/header 有可见提示；打开该 chat 后提示清除。

## Settings

覆盖：settings page、default agent localStorage、delete all chats。

1. 打开 Settings。
2. 切换 default agent。
3. 回到 `New chat`。
4. 期望新 draft 使用新的 default agent。
5. 重启 app。
6. 期望 default agent 保持。
7. 点击 `Delete all chats`，先取消，再确认。
8. 期望取消不删除；确认后所有 chat 清空，project 保留，route 回首页。

## Message Rendering

覆盖：assistant text、reasoning、tool group、plan/todo、attachments、message actions。

1. 发送会产生 markdown/code block 的消息。
2. 期望文本、代码块、链接正常渲染。
3. 触发 reasoning 或 tool call。
4. 期望 running 和 completed 状态清晰，不遮挡正文。
5. 触发 plan/todo。
6. 期望 card 可读，状态清楚。
7. hover 消息并验证 copy/edit/quote 这些高频 action 不报错。

## Claude Code Runtime

覆盖：Claude adapter/session、model/mode/config、permission、history replay。

1. 切换到 `Claude Code`。
2. 期望 model/mode/effort 信息能加载；加载失败时 UI 不崩。
3. 发送普通消息。
4. 期望 text/thinking/tool 输出正常映射到消息 UI。
5. 触发一次 Claude permission 或 AskUserQuestion。
6. 期望 permission/input UI 能 resolve，runtime 继续。
7. 重启后打开 Claude chat。
8. 期望历史能恢复。

## Notifications

覆盖：main window notification、active chat tracking、click-to-open route。

1. 在 chat A 发起长任务。
2. 切到 chat B 或最小化窗口。
3. chat A 完成或等待输入。
4. 期望有后台提示或系统通知。
5. 点击通知。
6. 期望窗口聚焦并打开 chat A。
7. 当前可见且 active 的 chat 不应重复弹后台通知。

## 回归重点

- 切换 agent/model 绝不能导致跳回 home 或丢 composer 内容。
- 已开始或运行中的 chat 不能切 agent，禁用原因必须可见。
- New chat、persisted unstarted chat、started chat 三种状态要分清。
- Send/cancel/permission 不能把 chat 卡死。
- Project chat 必须使用 project cwd。
- Desktop DB 只存 chat/project metadata，不存消息。
- Electron preload 缺失导致的普通浏览器 blank page 不能误判为 app 失败。
- Root provider 必须覆盖所有 route，尤其是 tooltip/toast/dialog。
