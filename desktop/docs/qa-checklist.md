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
   pnpm install
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
   pnpm --filter desktop lint
   pnpm --filter desktop typecheck
   pnpm --filter desktop format:check
   git diff --check
   ```

## App 启动

覆盖：`main.ts`、`preload.ts`、`renderer.tsx`、`App.tsx`、root providers、Electron window。

1. 启动 app。

   ```sh
   npm --prefix desktop start
   ```

2. 期望：
   - Electron 窗口正常打开。
   - 首页显示 `New chat`、sidebar、composer。
   - sidebar 顶部有 `Chat` / `Work` mode switcher。
   - `Chat` mode 显示 standalone chats；`Work` mode 显示 projects。
   - sidebar 底部显示 `Settings`。
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

覆盖：directory picker、project DB、project route、project chat cwd、Work Mode sidebar project section。

1. 切到 sidebar `Work` mode。
2. 点击 project section 的添加按钮。
3. 取消 directory picker。
4. 期望不创建 project，不报错。
5. 再次添加 `/tmp/angel-engine-qa/project`。
6. 期望 project 出现在 Work Mode sidebar，名称和 tooltip 正确。
7. 在 project 下创建 chat 并发送消息。
8. 期望：
   - route 是 project chat route。
   - chat 显示在 project 下，不出现在 `Chat` mode 的 standalone list。
   - runtime cwd 使用 project path。
9. 折叠再展开 project。
10. 期望已有 project chat 仍然可见，不需要切换页面才能重新出现。
11. 在 `Chat` / `Work` mode 间切换，再回到 `Work`。
12. 期望 project 展开状态和子 chat 列表稳定，不出现空展开区。
13. 删除 project。
14. 期望 project 和其 chat 从 sidebar 消失；如果当前正在该 project route，回到首页。

## Sidebar 和导航

覆盖：router、workspace shell、Chat/Work mode、chat/project active state、context menu、settings route。

1. 点击 `New chat`、已有 standalone chat、project chat、Settings。
2. 期望 route、header、sidebar active 状态一致。
3. 在 `Chat` mode 和 `Work` mode 间切换。
4. 期望 mode switcher 状态、列表内容和 `New chat` 创建位置一致：
   - `Chat` mode 下 `New chat` 创建 standalone draft。
   - `Work` mode 下有选中 project 时 `New chat` 创建 project draft。
5. 右键 chat，验证 Rename 和 Delete。
6. 期望重命名后 sidebar/header 同步；删除当前 chat 后回到首页。
7. 访问不存在的 route 或不存在的 chat id。
8. 期望回到安全页面，不出现 blank page。
9. 后台 chat 完成或等待输入时，sidebar/header 有可见提示；打开该 chat 后提示清除。

## Workspace Tools

覆盖：workspace tool sidebar/window host、tab state、Files、Git、Browser、Terminal、main/preload IPC。

1. 打开一个 project chat，让右侧 workspace tool 具备 project root。
2. 打开右侧 sidebar tool surface。
3. 期望：
   - sidebar mode 不显示独立 tool title header。
   - 顶部 tool/tab 控件尺寸与主窗口 sidebar 控件一致。
   - 所有 icon button 都有 tooltip 或 accessible name。
   - 切换 sidebar 宽度、隐藏/显示 sidebar 后，Browser WebView 位置和大小跟随可视容器，不停留在旧位置。
4. 将 tool surface 切到 window mode。
5. 期望 window 默认接近全屏，左侧是垂直 tab sidebar，右侧是当前 tool 内容，标题栏内容和 macOS traffic lights 垂直对齐，icon/tab 样式与主窗口一致。
6. 在 sidebar/window 间切换同一个 root。
7. 期望 active tab、打开的文件 tab、git 选中文件和 browser URL 不无故丢失。

## Workspace Files

覆盖：file tree、Monaco editor、multi-tab、unsaved changes、file icon、window mode resize。

1. 在 sidebar mode 的 Files 中点击一个文件。
2. 期望自动打开 window mode，并选中刚点击的文件。
3. 在 window Files 中打开多个文件。
4. 期望右侧是 VS Code 风格 editor tab，可多开、切换和关闭；tab icon 与 file tree icon 一致且有文件类型颜色。
5. 修改一个文件。
6. 期望 tab 右侧显示未保存小点，不显示显式 `Save` 按钮。
7. 按 `Ctrl+S` / `Cmd+S`。
8. 期望文件保存，未保存小点消失，file tree/git status 刷新。
9. 关闭未保存 tab 或离开 editor。
10. 期望系统 dialog 询问是否保存、丢弃或取消；取消时仍停留在当前 tab。
11. 拖动 file tree 和 editor 中间的 resize handle。
12. 期望左右 pane 尺寸稳定，editor 不溢出，文本和 tab 不重叠。
13. 切换 light/dark theme。
14. 期望 Monaco 使用对应亮/暗主题；TypeScript language service 不启动 IDE 级检查，只保留展示/编辑需要的语法体验。

## Workspace Git

覆盖：git status/diff、sidebar compact diff、window diff、commit composer、commit/push IPC、window branch/pull/history。

1. 在有改动的 project root 打开 Git。
2. sidebar mode 期望：
   - 外层没有额外 card padding/border。
   - 顶部仍是 branch status + Push/Publish 状态条（与 #224 一致）。
   - 文件列表紧凑，文件之间用分割线区隔。
   - diff 默认折叠，展开后在原地渲染。
   - 文件行显示 checkbox、文件名、绿色 `+N` 和红色 `-N`，不显示 `unstaged` 文案。
   - **不**显示 Changes/History 分段，也没有 branch 下拉切换。
3. window mode 期望（高度类似 GitHub Desktop）：
   - 顶部 toolbar：Current Branch 下拉、Pull、Push/Publish。
   - 左侧 Changes / History 分段。
   - Changes：文件列表 + small size commit composer；点击文件在右侧显示 diff。
   - History：commit 列表；选中后右侧显示该 commit 的文件与 diff。
   - diff tab 不支持多开；切换文件复用同一个右侧 diff viewer。
4. 勾选/取消勾选部分文件。
5. 期望 composer 的 selected file count 实时更新，commit 只包含选中文件。
6. 输入 commit message 并提交。
7. 期望成功后 git status 刷新；失败时错误显示在 composer 附近，不丢失 message。
8. window mode 切换 branch / Pull / Push：
   - branch 下拉只列本地分支，切换后 status/history 刷新。
   - behind=0 时 Pull 禁用；ahead=0 且已有 upstream 时 Push 禁用。
   - 失败错误显示在 toolbar 下方。

## Settings

覆盖：settings page、last agent localStorage、delete all chats。

1. 打开 Settings。
2. 确认 Settings 不显示默认 agent 选择项。
3. 完成一次 Codex chat。
4. 回到 `New chat`。
5. 期望新 draft 使用 Codex，并在 runtime config 加载后恢复上次 model/reasoning/mode/permission。
6. 重启 app。
7. 期望上次使用的 agent 和配置保持。
8. 点击 `Delete all chats`，先取消，再确认。
9. 期望取消不删除；确认后所有 chat 清空，project 保留，route 回首页。

## Message Rendering

覆盖：assistant text、reasoning、tool group、plan/todo、attachments、message actions。

1. 发送会产生 markdown/code block 的消息。
2. 期望文本、代码块、链接正常渲染。
3. 触发 reasoning 或 tool call。
4. 期望 running 和 completed 状态清晰，不遮挡正文。
5. 触发 plan/todo。
6. 期望 card 可读，状态清楚。
7. hover assistant message。
8. 期望 action bar 只保留 Copy；不显示 Speak、Helpful、Not helpful、Export Markdown。
9. 期望不显示 assistant-ui branch picker。
10. 验证 Copy 不报错，且复制内容与当前消息一致。

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
- Work Mode project 展开后必须稳定显示已有 chat，不能依赖切换页面触发重渲染。
- Workspace tool 的 sidebar/window 两种 host 必须共享同一套 tab/content state。
- Window mode Files/Git 必须走同一套布局判断，不能分别写两套 tab UI。
- Browser WebView 必须在 sidebar/window resize、隐藏和 route 变化后同步 bounds。
- Desktop DB 只存 chat/project metadata，不存消息。
- Electron preload 缺失导致的普通浏览器 blank page 不能误判为 app 失败。
- Root provider 必须覆盖所有 route，尤其是 tooltip/toast/dialog。
