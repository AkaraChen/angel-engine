# Desktop QA Checklist

这份清单来自对 `desktop/` 代码的一次完整路径梳理。目标不是只点几个 happy path，而是覆盖 Electron main/preload/renderer、typed IPC、chat runtime session、assistant-ui adapter、chat/project SQLite metadata、Claude runtime adapter、UI primitives 和打包路径之间的端到端行为。

## 代码路径覆盖地图

| Path                      | 主要代码                                                                                                                             | 必测重点                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Tooling / scripts         | `desktop/package.json`, `desktop/.yarnrc.yml`, `desktop/tsconfig.json`, `desktop/.eslintrc.json`                                     | install、start/package/make/publish 脚本、TypeScript path alias、ESLint 10 配置迁移风险、Yarn node-modules linker             |
| Build config              | `desktop/forge.config.ts`, `desktop/forge.env.d.ts`, `desktop/vite.*.config.*`, `desktop/index.html`                                 | main/preload/renderer bundle、CSP、Forge packager hooks、native modules 和 migration copy                                     |
| DB migrations             | `desktop/drizzle.config.ts`, `desktop/drizzle/*`, `desktop/src/main/db/*`                                                            | migration discovery、SQLite schema、foreign key cascade、dev/release DB path                                                  |
| Assets / shadcn config    | `desktop/assets/*`, `desktop/components.json`, `desktop/src/index.css`                                                               | app icon、packaged iconset、Tailwind/shadcn token、CSS variable/theme contract                                                |
| App 启动和打包            | `desktop/src/main.ts`, `desktop/forge.config.ts`, `desktop/vite.*.config.*`, `desktop/index.html`                                    | Electron window、preload、Vite renderer、CSP、native dependency copy、drizzle migration copy                                  |
| Renderer providers        | `desktop/src/renderer.tsx`, `desktop/src/App.tsx`, `desktop/src/platform/theme.ts`                                                   | `QueryClientProvider`, `ToastProvider`, root `TooltipProvider`, light/dark/system theme, platform dataset                     |
| Router                    | `desktop/src/app/router.tsx`, `desktop/src/app/workspace/workspace-page.tsx`                                                         | `/`, `/settings`, `/chat/:chatId`, `/project/:projectId`, `/project/:projectId/:chatId`, unknown route redirect               |
| Workspace shell           | `desktop/src/app/workspace/*.tsx`, `desktop/src/components/ui/sidebar.tsx`                                                           | sidebar loading/empty/active/collapse, settings page, header attention dots, macOS drag regions                               |
| Renderer API layer        | `desktop/src/platform/api-client.ts`, `desktop/src/platform/ipc.ts`, `desktop/src/features/*/api/queries.ts`                         | TanStack cache keys, invalidation, mutation side effects, query stale/restore behavior                                        |
| Preload bridge            | `desktop/src/preload.ts`, `desktop/src/renderer-env.d.ts`                                                                            | `desktopEnvironment`, `desktopWindow`, `ipcInvoke`, `chatStream`, file path bridge                                            |
| Chat IPC                  | `desktop/src/main/features/chat/ipc.ts`, `desktop/src/main/features/chat/schemas.ts`, `desktop/src/main/features/chat/stream-ipc.ts` | create/load/prewarm/send/setMode/setRuntime/rename/delete/context menu/stream/cancel/elicitation resolve                      |
| Chat repository           | `desktop/src/main/features/chat/repository.ts`, `desktop/src/main/db/*`, `desktop/drizzle/*`                                         | local metadata only, title normalization, cwd validation, remote thread id persistence, cascade behavior                      |
| Engine runtime path       | `desktop/src/main/features/chat/angel-client.ts`, `desktop/src/main/features/chat/projection.ts`                                     | prewarm reuse, draft chat creation, runtime selection, hydrate, mode/config projection, attachments projection                |
| Claude runtime path       | `desktop/src/main/features/chat/claude/*`                                                                                            | Claude SDK init, model/effort/mode loading, permission callbacks, history replay, plan/todo projection                        |
| Chat run store            | `desktop/src/features/chat/state/chat-run-store.ts`                                                                                  | slot aliases, draft-to-chat move, cancel/drop, streaming accumulation, permission bypass, attention state, history conversion |
| Assistant runtime adapter | `desktop/src/features/chat/runtime/*`                                                                                                | assistant-ui external runtime, runtime actions, chat options, project environment, attachments adapter                        |
| Composer                  | `desktop/src/features/chat/components/assistant-composer.tsx`, `desktop/src/components/ai-elements/prompt-input.tsx`                 | provider/model/effort, search, plan/build, slash commands, file mention, attachments, keyboard behavior                       |
| Messages                  | `desktop/src/features/chat/components/messages.tsx`, `desktop/src/components/assistant-ui/*`                                         | text/reasoning/tool groups, permission UI, elicitation questions, plan/todo cards, attachment preview, branch/action bar      |
| Projects                  | `desktop/src/features/projects/*`, `desktop/src/main/features/projects/*`, `desktop/src/shared/projects.ts`                          | directory picker, project DB, context menu, file search, project chat cwd, cascade delete                                     |
| Settings                  | `desktop/src/features/settings/*`, `desktop/src/shared/agents.ts`                                                                    | default runtime localStorage, settings tabs, delete all chats confirmation                                                    |
| Notifications             | `desktop/src/main/window-notifications.ts`, `desktop/src/shared/desktop-window.ts`                                                   | background completion/input notifications, click-to-open route, active chat tracking                                          |
| Shared contracts          | `desktop/src/shared/*.ts`                                                                                                            | normalized chat/project/agent types, attachment input validation, plan/elicitation shape guards                               |
| UI primitives             | `desktop/src/components/ui/*.tsx`, `desktop/src/index.css`                                                                           | Radix portal/provider requirements, dialog/select/dropdown/sheet/sidebar/toast/tooltip behavior, responsive/mobile state      |

## 环境准备

1. 安装 desktop 依赖。

   ```sh
   yarn --cwd desktop
   ```

2. 如果改过 Rust engine/client、NAPI crate、snapshot/event/settings 类型，先重建 native client。

   ```sh
   npm --prefix crates/angel-engine-client-napi run build
   ```

3. 准备测试项目目录，覆盖普通文件、隐藏文件、被忽略目录和图片/文本附件。

   ```sh
   mkdir -p /tmp/angel-engine-qa/project/src
   mkdir -p /tmp/angel-engine-qa/project/node_modules/ignored
   mkdir -p /tmp/angel-engine-qa/project/.git/ignored
   printf 'hello from qa\n' > /tmp/angel-engine-qa/project/src/hello.txt
   printf 'SECRET=qa\n' > /tmp/angel-engine-qa/project/.env
   printf 'ignored\n' > /tmp/angel-engine-qa/project/node_modules/ignored/file.txt
   printf 'attachment text\n' > /tmp/angel-engine-qa/attachment.txt
   ```

4. 常规静态检查。

   ```sh
   npm --prefix desktop run typecheck
   npm --prefix desktop run format:check
   git diff --check
   ```

5. 当前 `npm --prefix desktop run lint` 依赖 ESLint 10，但仓库没有 `eslint.config.*`。在配置迁移前不要把这个命令作为 blocking gate。

6. 注意 dev app 使用 Electron `userData` 下的 `angel-engine.dev.sqlite`。需要干净数据时，先备份或记录 `~/Library/Application Support/Angel Engine/angel-engine.dev.sqlite`，不要误删用户数据。

## Tooling / Config Path

### Package scripts and install

1. 在 repo root 跑 `yarn --cwd desktop`。
2. 期望：
   - 使用 `.yarnrc.yml` 的 `nodeLinker: node-modules` 安装到 `desktop/node_modules`。
   - `desktop/yarn.lock` 不出现无关 churn。
   - native dependency postinstall 不失败。
3. 检查 `desktop/package.json` scripts：
   - `start` 启动 Electron Forge dev app。
   - `package` 能生成本地 packaged app。
   - `make` 能走 Forge maker。
   - `publish` 只在 release/publish 流程执行，不作为普通 QA gate。
   - `typecheck`、`format:check` 是常规 blocking gate。
   - `lint` 在 ESLint 10 flat config 迁移前只是 known-risk check。

### TypeScript, Vite, and aliases

1. 跑：

   ```sh
   npm --prefix desktop run typecheck
   ```

2. 期望：
   - `@/*` alias 正常解析到 `desktop/src/*`。
   - `forge.env.d.ts` 中的 `MAIN_WINDOW_VITE_*` 类型可用。
   - renderer/preload/main 三个 Vite config 不互相污染 Node/browser API。
3. 修改或新增 UI 组件时确认 `components.json` 仍指向正确 alias：
   - `components: "@/components"`
   - `ui: "@/components/ui"`
   - `utils: "@/platform/utils"`
   - `css: "src/index.css"`

### Drizzle migration and DB config

1. 确认 `desktop/drizzle.config.ts` 的 schema 指向 `src/main/db/schema.ts`，输出目录为 `drizzle`。
2. 新增 DB schema 字段后必须生成 migration，并检查：
   - `desktop/drizzle/meta/_journal.json` 版本递增。
   - snapshot JSON 和 SQL migration 同步。
   - packaged app 中 `drizzle/` 可被 `database.ts` 找到。
3. 运行 app 后检查 dev DB：
   - `projects` 表存在。
   - `chats` 表存在。
   - `chats.project_id` foreign key cascade 生效。
   - `chats.remote_thread_id` 可为 null。

### Icons and packaged assets

1. 检查 `desktop/assets/icon.png`、`desktop/assets/icon.icns`、`desktop/assets/icon.iconset/*` 存在。
2. 运行 `npm --prefix desktop run package` 后确认 packaged app 使用正确 icon。
3. 修改 icon 时确认 dev window、packaged macOS app、Finder/Dock icon 都更新。

## 启动和 Shell Path

### 手动启动

1. 运行：

   ```sh
   npm --prefix desktop start
   ```

2. 期望：
   - Electron 窗口打开，标题为 `Angel Engine`。
   - 首页显示 `New chat`、sidebar、composer。
   - sidebar 显示 `Projects`、`Chats`、`Settings`。
   - 没有 Vite/Electron crash overlay。
   - 主进程日志没有 uncaught exception。
   - macOS 下窗口按钮、vibrancy、drag region 正常。

3. 在主进程日志里确认 `restoreShellPath` 没有报错。需要覆盖从 GUI 启动时找不到 shell PATH 的场景，尤其是 `codex`、`claude`、`git`、`node` 等 CLI。

### agent-browser / Electron CDP 验证

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
agent-browser errors
agent-browser snapshot -i
agent-browser screenshot --annotate
```

期望：

- overlay 检查返回 `"OK"`。
- body 检查返回 `"HAS_CONTENT"`。
- browser errors 为空。
- snapshot 至少包含：
  - heading `New chat`
  - textbox `Ask Angel Engine to inspect, patch, test, or explain...`
  - button `Provider, model, and reasoning effort`
  - button `Build` 或 `Plan`
  - button `Send`

### 打包路径

1. 对 release 相关改动额外跑：

   ```sh
   npm --prefix desktop run package
   ```

2. 期望：
   - `drizzle/` 被复制进 build。
   - `@angel-engine/client-napi` 的 `package.json`、`index.js`、`index.d.ts`、`.node` 被复制。
   - `better-sqlite3`、`bindings`、`file-uri-to-path` 被复制。
   - packaged app 可以启动并创建/读取 dev 以外的 `angel-engine.sqlite`。

## Router 和导航 Path

### Route map

1. 打开 `#/`。
2. 期望显示 standalone draft `New chat`。
3. 打开 `#/settings`。
4. 期望显示 settings 页面，sidebar Settings active。
5. 打开不存在 route，例如 `#/does-not-exist`。
6. 期望 replace redirect 到 `#/`，不出现空白页。
7. 打开不存在 chat route，例如 `#/chat/not-a-real-chat-id`。
8. 期望 chat restore error boundary 捕获并 replace redirect 到 `#/`，console 有受控 `Chat restore failed` 日志但页面不崩。

### Chat canonical route

1. 创建 standalone chat，记录 `chat.id`。
2. 访问 `#/chat/:chatId`。
3. 期望留在 `/chat/:chatId`。
4. 创建 project chat，记录 `project.id` 和 `chat.id`。
5. 手动访问 `#/chat/:projectChatId`。
6. 期望 canonical redirect 到 `#/project/:projectId/:chatId`。
7. 手动访问错误 project route，例如 `#/project/wrong/:chatId`。
8. 期望 canonical redirect 到 chat 当前真实 project route。
9. 删除当前 chat。
10. 期望 route replace 到 `#/`，sidebar 不再有该 chat。

### Project route

1. 创建 project 后访问 `#/project/:projectId`。
2. 期望显示 `New chat in <projectName>`，runtime cwd 指向 project path。
3. 删除当前 project 后再访问旧 `#/project/:projectId`。
4. 期望不会 crash；从 UI 触发删除时应自动回到 `#/`。

### Notification route

1. 让 app 最小化或 hide。
2. 在后台 chat 触发 completion 或 permission/input。
3. 点击系统通知。
4. 期望窗口 restore/focus，renderer 收到 `desktop-window:notification:open-chat`，导航到 `/chat/:chatId` 或 `/project/:projectId/:chatId`。

## Settings Path

### Default agent

1. 打开 `Settings`。
2. `Agents` tab 中切换 `Default agent` 到每个可用 runtime：
   - `Codex`
   - `Kimi`
   - `OpenCode`
   - `Qoder`
   - `GitHub Copilot`
   - `Gemini`
   - `Cursor`
   - `Cline`
   - `Claude Code`
3. 回到 `New chat`。
4. 期望新的 standalone draft 使用刚选择的 default runtime。
5. 刷新或重启 app。
6. 期望 default runtime 从 localStorage 恢复。
7. 手动把 localStorage 值改成非法 runtime。
8. 期望 `sanitizeAgentSettings` 回退到 `codex`，settings 页面不崩。

### Delete all chats

1. 打开 `Settings` -> `Danger Area`。
2. 点击 `Delete all chats`。
3. 在确认框点击 Cancel。
4. 期望没有删除，active run 不受影响。
5. 再次点击并确认。
6. 期望：
   - 所有 chat DB record 删除。
   - 所有 active chat run 被 cancel/drop。
   - 所有 chat detail query 被清理。
   - route replace 到 `#/`。
   - toast 显示删除数量。
   - project record 保留。

## Sidebar Path

### Sidebar shell

1. 启动时检查 `Projects` 和 `Chats` loading state。
2. 空数据库时：
   - Projects 显示 `No projects yet`。
   - Chats 显示 `No standalone chats`。
3. 点击 Chats 折叠按钮。
4. 期望 standalone chat list collapse/expand，布局不跳动。
5. 点击 Settings。
6. 期望 Settings active，其他 chat/project active state 清掉。
7. 在窄窗口或移动 viewport 验证 sidebar sheet 路径，`Toggle Sidebar` 可以打开/关闭。

### Chat item

1. 创建多个 standalone chat。
2. 期望按 `updatedAt` 降序显示。
3. 点击 chat item。
4. 期望打开对应 route，header title 和 sidebar active 都更新。
5. 右键 chat item。
6. 期望 context menu 包含 `Rename`、`Delete`。
7. Rename 保存空白标题。
8. 期望 toast 或 dialog error，不应保存空标题。
9. Rename 保存有效标题。
10. 期望 DB、sidebar、header 同步更新。
11. Delete 当前 chat。
12. 期望 session close、DB 删除、route 回 `#/`。

### Running/attention indicators

1. 在 chat A 启动长任务。
2. 切到 chat B。
3. 期望 chat A sidebar 显示 running pulse。
4. chat A 后台完成。
5. 期望 chat A 显示 completed 绿点，header 显示 background status。
6. 触发 chat A 的 permission/input。
7. 期望 chat A 显示 needs input 黄点，header 显示 background status。
8. 打开 chat A。
9. 期望对应 attention 被清除。

## Project Path

### Create project

1. 点击 `Projects` header 的 `Add project`。
2. 期望 Electron directory picker 打开，title 为 `Choose project folder`。
3. 取消选择。
4. 期望不创建 project，不显示 error toast。
5. 再次点击并选择 `/tmp/angel-engine-qa/project`。
6. 期望：
   - project 存入 SQLite。
   - sidebar `Projects` 列表出现目录 basename。
   - title tooltip 是完整 path。
   - 新 project 自动展开。
   - project list 按 path 升序。
7. 再次添加相同路径。
8. 期望 unique constraint 或受控 toast，不应创建重复项。
9. 尝试添加不存在路径或文件路径。
10. 期望受控错误：`Project path does not exist.` 或 `Project path must be a directory.`

### Project context menu

1. 右键 project。
2. 期望 context menu 包含 `Open in Finder`、`Delete`。
3. 选择 `Open in Finder`。
4. 期望系统 Finder 打开该路径，project/chat UI 不变。
5. 选择 `Delete`。
6. 期望：
   - project record 删除。
   - 关联 chat 因 foreign key cascade 删除。
   - project query 和 chat query 都刷新。
   - 如果当前 route 属于该 project，导航回 `#/`。

### Project chat

1. hover project row，点击 `New chat in <project>` 的 plus。
2. 如果 project 下有未开始 chat，期望复用；没有则新建。
3. 期望 route 为 `#/project/:projectId/:chatId`。
4. Empty state 文案显示 project name。
5. 发送消息。
6. 期望 main process `cwdForChat` 使用 project path，不是 home。
7. project chat 在 project 下显示，不出现在 standalone Chats，除非 project 被删除后成为 orphan fallback。

### Project file search

1. 在 project chat 输入 `@`。
2. 期望出现 `Files` assist panel。
3. 输入 `@src`、`@hello`、模糊输入 `@sht`。
4. 期望按 score 排序，最多 12 条 UI 结果。
5. 期望 `.git`、`node_modules`、`dist`、`build`、`target`、`.next`、`.turbo`、`.venv`、`coverage`、`out`、`.cache` 被忽略。
6. 期望 `.env` 可以被搜索到，其他 dotfile 默认被跳过。
7. 用 Enter、Tab、鼠标点击选择文件。
8. 期望：
   - composer header 出现 `Mention` tile。
   - 文本替换为 `@relative/path `。
   - 重复选择同一路径不会重复添加。
   - 发送后 runtime 收到 `fileMention`，包含 absolute path 和 name。
9. 在 standalone chat 输入 `@src`。
10. 期望不触发 file search。

## Agent / Model / Effort Path

### Draft chat runtime switching

1. 打开 `#/` 或 `#/project/:projectId` draft。
2. 在 textarea 输入一段未发送文本。
3. 打开 composer 底部 `Provider, model, and reasoning effort`。
4. 点击 `Provider` 子菜单。
5. 切换到每个 runtime，至少覆盖 Codex、Kimi、Claude Code。
6. 期望：
   - provider label 更新。
   - model/effort/mode options 随 runtime config 更新。
   - URL 保持当前 draft route。
   - textarea 文本不丢。
   - 不触发 `New chat`、home redirect、project redirect。
   - console/browser errors 为空。

### Persisted unstarted chat runtime switching

1. 创建 standalone chat，但不要发送消息。
2. 打开该 chat route。
3. 切换 provider。
4. 期望：
   - `chatsSetRuntime` 更新 DB runtime。
   - 当前 runtime slot 被 cancel/drop，旧 config 不残留。
   - route 不变。
   - 可以继续发送首条消息。
5. 发送第一条消息后再次打开 provider menu。
6. 期望 provider disabled，tooltip 为 `Agent cannot be changed after a chat has started.`

### Started/running chat disabled state

1. 打开已有消息 chat。
2. 打开 `Agent Settings`。
3. 期望 top-level trigger 仍可打开。
4. `Provider` 行 disabled。
5. hover disabled Provider 行。
6. 期望 tooltip 显示 `Agent cannot be changed after a chat has started.`
7. 发送长任务，运行中打开 menu。
8. 期望 Provider disabled tooltip 显示 `Agent cannot be changed while a response is running.`
9. 期望 root `TooltipProvider` 覆盖此路径，不出现 `Tooltip must be used within TooltipProvider`，也不触发 `ChatRestoreErrorBoundary` 回 home。

### Model search/filter

1. 打开 `Agent Settings` -> `Model`。
2. 期望子菜单顶部有 `Search models` 输入框。
3. 输入 `Spark`。
4. 期望列表过滤到匹配 label/value，例如 `GPT-5.3-Codex-Spark`。
5. 输入不存在字符串。
6. 期望显示 `No models found`。
7. 选择一个 model。
8. 期望：
   - label 更新。
   - search query reset。
   - menu 不触发 navigation。
   - model override 传到下一次 send。

### Effort and unavailable options

1. 切到支持 reasoning effort 的 runtime/model。
2. 打开 Effort 子菜单，选择每个 effort，包括 `high`、`xhigh` 等。
3. 期望 label 正确，`Use default` 显示为 `Default`。
4. 切到不支持 effort 的 model/runtime。
5. 期望 Effort disabled，不影响 Provider/Model 可用性。
6. runtime config loading 时 Model 显示 `Loading...`，不可点击。

## Mode / Plan / Build Path

1. 在 runtime config 加载后检查 composer 右侧 mode toggle。
2. 如果当前是 build/code/default 模式，按钮显示 `Build`，title 为 `Switch to plan mode`。
3. 点击后切到 plan。
4. 期望：
   - 按钮显示 `Plan`。
   - `aria-pressed=true`。
   - draft route 更新 draft mode，persisted chat 调用 `chatsSetMode`。
   - 运行中按钮 disabled。
5. 再次点击切回 build。
6. 期望按钮显示 `Build`。
7. 对没有 plan mode 或 build fallback 的 runtime，按钮 disabled。
8. 在 plan 模式请求制定计划。
9. 期望 `Plan` card 渲染：
   - 有 entries 时显示完成数。
   - 有 path 时显示 path。
   - text 用 Streamdown 渲染。
   - 旧 plan/todo 变成 `created`/`updated` marker，最后一个完整展示。
10. 如果最后一条 review plan 可进入 build mode，期望显示 `Start implementation`。
11. 点击 `Start implementation`。
12. 期望 mode 切到 build，然后自动 append `start implementation` 消息。
13. 运行中或 config loading 时 `Start implementation` 不可触发。

## Composer Input Path

### Text submission

1. 空 composer 时确认 `Send` disabled。
2. 输入普通文本后 `Send` enabled。
3. 按 Enter。
4. 期望提交。
5. 按 Shift+Enter。
6. 期望换行，不提交。
7. 使用中文/日文 IME composition 输入时按 Enter。
8. 期望 composition 不被错误提交。
9. 运行中按 Enter。
10. 期望不会再次提交。
11. 运行中按 Escape。
12. 没有 assist panel 时期望 cancel run。

### Slash command assist

1. 在 project chat 输入 `/`。
2. runtime config commands loading 时显示 `Loading commands`。
3. 如果 runtime 没有 commands，显示 `No commands advertised`。
4. 输入 `/foo` 无匹配时显示 `No matching commands`。
5. 有匹配时展示 command name、description、inputHint。
6. 按 Enter/Tab 或点击 command。
7. 期望文本替换为 `/<command> ` 并重新 focus textarea。
8. 按 Escape。
9. 期望关闭 slash panel 并清空 slash draft。
10. 在 standalone chat 输入 `/`。
11. 期望不触发 slash command assist。

### Attachments

1. 点击 `Attach files`。
2. 选择 `/tmp/angel-engine-qa/attachment.txt`。
3. 期望 composer header 出现 `File` tile。
4. 点击 remove。
5. 期望 tile 消失。
6. 再次添加相同文件。
7. 期望 input value reset，能重新选择。
8. 将文件拖到 composer 表单。
9. 期望添加附件。
10. 粘贴图片。
11. 期望添加 `Image` tile。
12. textarea 为空时按 Backspace。
13. 期望删除最后一个附件。
14. 点击图片/text attachment tile。
15. 期望 Dialog 打开 preview，close 正常。
16. 触发文件读取失败。
17. 期望 toast 标题为 `Could not read file`，附件保留以便重试。
18. 测试 attachment-only send。
19. 期望产品决策明确：如果支持附件-only，应成功创建 run；如果不支持，应在 renderer 层禁用/提示，而不是让 stream IPC schema 报内部错误。

### Quote/edit/copy actions

1. 选中 assistant 或 user message 文本。
2. 点击 floating `Quote`。
3. 期望 composer header 出现 quote card。
4. 点击 quote dismiss。
5. 期望 quote 清除。
6. hover user message，点击 Edit。
7. 修改后 Save。
8. 期望 assistant-ui branch/update 行为正常。
9. 点击 Copy、assistant Copy、Export Markdown。
10. 期望 clipboard 写入，不报错。

## Chat Send / Stream / Restore Path

### Standalone draft first send

1. 在 `#/` 输入 `Say hello in one short sentence.`。
2. 点击 Send。
3. 期望：
   - user message 出现在右侧。
   - assistant message 出现在左侧，先显示 `Thinking` 或 reasoning/tool 状态。
   - prewarm session 被复用或安全 fallback。
   - stream 首个 `chat` event 后 route 变成 `#/chat/:chatId`。
   - sidebar 新增 chat，标题从 prompt 截断到约 48 字符。
   - stream result 后 `remoteThreadId` 持久化或 `updatedAt` touch。
4. 发送第二轮消息。
5. 期望沿用同一个 chat/session，sidebar 不重复创建。

### Project draft first send

1. 在 `#/project/:projectId` 输入消息。
2. 点击 Send。
3. 期望 route 变成 `#/project/:projectId/:chatId`。
4. 期望 `projectId` 和 project cwd 传到 main process。
5. sidebar 中 chat 出现在对应 project 下。

### Existing chat restore

1. 打开已有 standalone chat。
2. 期望先显示 `Restoring chat` loading。
3. hydrate 完成后消息从 runtime snapshot 恢复。
4. 重启 app 再打开同一 chat。
5. 期望 DB 只提供 metadata，消息仍来自 runtime hydrate/replay。
6. 对没有 `remoteThreadId` 且 session 无 conversation 的未开始 chat，期望 messages 为空，composer 可用。

### Stream cancel and error

1. 发送长任务。
2. 运行期间确认：
   - composer 显示 `Cancel`。
   - Send disabled。
   - Provider disabled 但 menu 可打开并有 tooltip。
   - sidebar running pulse 显示。
3. 点击 `Cancel`。
4. 期望：
   - renderer active run abort。
   - preload 调用 `chat:stream:cancel`。
   - main active stream abortController abort 并从 map 删除。
   - assistant message status 为 incomplete/cancelled。
   - 后续可以继续发送。
5. 触发 backend error。
6. 期望 assistant message 显示 `Backend chat failed: ...`，run 结束，Send 恢复。
7. 在 runtime 等待 permission 时取消。
8. 期望 pending elicitation 被 reject/清理，不应卡住 session。

### Slot alias and navigation

1. 从 draft 发起 send。
2. 在 chat event 到来前后观察 slot key。
3. 期望 draft slot alias 到真实 chat id，messages 不丢。
4. 快速切换 sidebar 到其他 chat。
5. 期望原 run 继续属于原 chat，completed/needsInput attention 正确。
6. 删除 running chat。
7. 期望 run 被 drop/cancel，route 回 `#/`，没有后续 token 写入已删除 UI。

## Permission / Elicitation Path

### Permission approval

1. 发送会触发工具或文件写入权限的请求。
2. 期望 assistant 消息里出现 permission UI，可能是 inline buttons 或 collapsible card。
3. 检查按钮：
   - `Deny`
   - `Cancel`
   - `Allow session`
   - `Allow`
   - 非 plan approval 时有 `Bypass permission`
4. 点击 `Deny`。
5. 期望 runtime 收到 deny，tool/action phase 变成 declined/cancelled/failed，不继续执行危险动作。
6. 重新触发 permission，点击 `Allow`。
7. 期望 action 从 awaiting decision 进入 running/completed，输出或错误详情正常渲染。
8. 重新触发 permission，点击 `Allow session`。
9. 期望同一 session 内按 runtime 语义复用权限。
10. plan approval permission 不应显示 `Bypass permission`。

### Permission bypass

1. 触发非 plan approval permission。
2. 点击 `Bypass permission`。
3. 期望：
   - 当前 permission 自动 allow。
   - 当前 slot `permissionBypassEnabled` 为 true。
   - 后续同 slot permission 自动批准。
   - 按钮 disabled，避免重复提交。
4. 切到另一个 chat 并触发 permission。
5. 期望 bypass 不跨 slot 泄漏。
6. 删除/切换 runtime 后再触发 permission。
7. 期望旧 bypass 状态不错误继承。

### User input elicitation

1. 触发 runtime 提问。
2. 期望 card 显示 title/body、question header、question text。
3. 有 options 时选择 option。
4. 有 `Other` 时选择 Other 并填写 freeform。
5. 有 secret input 时确认使用 password input。
6. 点击 Submit。
7. 期望 phase 显示 Answered/Submitting，runtime 继续。
8. 点击 Cancel。
9. 期望 runtime 收到 cancel，不无限等待。
10. 对 Claude Code `AskUserQuestion`，期望 answers 被写回 updatedInput。

## Message Rendering Path

1. 普通 assistant text 使用 Streamdown 渲染，覆盖：
   - CJK 文本
   - code block
   - inline code
   - math
   - mermaid
   - table
   - link
2. Reasoning part：
   - running 时自动展开并 shimmer。
   - 停止后可折叠/展开。
3. Tool group：
   - 多个 tool 聚合显示。
   - active tool 显示 spinner。
   - tool 后有 text 时默认折叠细节。
4. Generic tool card：
   - Input、Output、Error 三类详情显示正确。
   - bare hostCapability 空 action 不渲染多余卡片。
5. Attachment part：
   - image preview 可打开 dialog。
   - text file preview 解码 base64/data URL。
   - binary file 不显示乱码 preview。
   - mention tile 显示为 `Mention` 且不打开 file preview。
6. Branch picker：
   - 单分支隐藏。
   - 多分支可 previous/next。
7. Speech adapter：
   - Speak 后按钮变 Stop speaking。
   - Stop 后状态结束。

## Claude Runtime Path

1. 选择 `Claude Code` runtime。
2. 打开 model menu。
3. 期望 Claude models 来自 SDK initialization result；如果模型列表为空，不崩，当前 model 仍可显示。
4. 切换 model。
5. 期望 `SessionModelsUpdated` 和 context `Model` 更新，effort options 随 model 支持情况刷新。
6. 切换 effort。
7. 期望 `SessionConfigOptionsUpdated` 和 context `Reasoning` 更新。
8. 切换 mode。
9. 期望 `SessionModesUpdated` 和 context `Mode` 更新，`bypassPermissions` 不出现在可选 mode。
10. 发送普通消息。
11. 期望 Claude SDK stream_event 的 text_delta/thinking_delta 分别映射为 text/reasoning。
12. 触发 Bash/Read/Write/Edit/WebSearch/Task/AskUserQuestion。
13. 期望 action kind/title/inputSummary 显示正确。
14. 触发 TodoWrite。
15. 期望 todo card 渲染。
16. 触发 ExitPlanMode 或写入 `~/.claude/plans/*.md`。
17. 期望 review plan card 渲染 path/text/entries。
18. 取消 Claude running turn。
19. 期望 active query close/abort，pending permissions reject。
20. 重启后打开 Claude chat。
21. 期望 remote session history replay 能恢复 text/tool/plan/todo。

## Notification Path

1. 打开 chat A 并发起长任务。
2. 最小化窗口。
3. 任务完成。
4. 期望系统通知标题为 `<chat title> finished`，body 最长约 220 字符。
5. 点击通知。
6. 期望窗口 restore/focus 并打开 chat A。
7. 再触发 permission/input。
8. 期望系统通知标题为 `<chat title> needs input` 或 `needs attention`。
9. 窗口可见且当前 chat active 时不应弹 background notification。

## Persistence / DB Path

1. 创建 project、standalone chat、project chat。
2. 退出 app。
3. 重新启动。
4. 期望 projects/chats metadata 从 SQLite 恢复。
5. 检查 DB：
   - `projects.path` unique。
   - `chats.project_id` foreign key cascade。
   - `chats.updated_at` 更新用于排序。
   - messages 不在 DB 中。
6. 删除 project。
7. 期望 project chats cascade 删除。
8. `before-quit` 后 database close，chat sessions close，不留锁。
9. migration folder 缺失场景应有明确错误，不是 silent failure。

## Preload / IPC Smoke Path

在 Electron renderer console 或 agent-browser eval 中检查：

```js
typeof window.desktopEnvironment.getPathForFile === "function";
typeof window.desktopEnvironment.platform === "string";
typeof window.desktopWindow.setActiveChatId === "function";
typeof window.desktopWindow.onOpenChatFromNotification === "function";
typeof window.ipcInvoke === "function";
typeof window.chatStream.send === "function";
```

期望全部为 true。

用 renderer eval 做 IPC smoke：

```js
await window.ipcInvoke("chatsList");
await window.ipcInvoke("projectsList");
```

期望返回数组，不抛 preload 缺失错误。

## UI Primitive / Accessibility Path

1. Tooltip：
   - composer model disabled Provider tooltip 正常。
   - sidebar collapsed tooltip 正常。
   - 没有 provider missing error。
2. Dropdown menu：
   - sub menu 可键盘打开。
   - model search input 内键盘事件不关闭 menu。
   - disabled item 不触发 onSelect。
3. Dialog：
   - attachment preview dialog close button 可用。
   - rename dialog Esc/close/save 正常。
4. Select：
   - settings default agent select 可键盘选择。
5. Toast：
   - destructive toast、normal toast、close、auto dismiss 正常。
6. Sidebar mobile sheet：
   - mobile viewport 下 open/close，不遮挡 composer。
7. Focus：
   - modal/menu 关闭后 focus 返回合理元素。
   - composer assist select 后 focus 回 textarea。
8. Reduced motion：
   - `prefers-reduced-motion` 下 loading signature 不动。

## 回归风险重点

- 切换 provider/model/effort/mode 不能触发 `New chat` 导航或 home redirect。
- Draft route、未开始 persisted chat、已开始 chat 三种状态的 agent 切换规则必须不同：
  - draft route 可随时切 runtime。
  - 未开始 persisted chat 可切 runtime，并清掉旧 runtime slot/config。
  - 已开始或运行中 chat 禁止切 runtime，并显示 tooltip。
- model、effort、mode 是 runtime config 能力，不应被 provider lock 误禁用。
- Desktop DB 只存 chat/project metadata，不存消息。消息恢复必须走 runtime hydrate/replay。
- 普通 browser 打开 Vite URL 的 blank page 不能当作 app 失败；Electron preload 缺失会导致 renderer 环境不完整。
- permission bypass 只能影响当前 chat run slot，不能跨 chat 泄漏。
- project file mention 只能在 project chat 中出现，standalone chat 不应触发文件搜索。
- root providers 必须覆盖所有 route，包括 restore error boundary 下的 menu/tooltip/toast/dialog portal。
- stream cancel 必须同时清 renderer active run、preload listener、main active stream、runtime pending permission。
- project delete 必须同步刷新 project list 和 chat list，且当前 route 要回退。
- Claude runtime 的 provider quirks 只能留在 `desktop/src/main/features/chat/claude/*` adapter/session path，renderer 只消费 normalized config/events。
