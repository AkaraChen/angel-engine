# Design Mode：能力边界与限制

Design Mode 让用户在 **project preview** 里点选 UI，把元素上下文（selector、样式、组件名链、截图等）交给当前 agent session，用来改界面。它是 **desktop host** 能力，不是完整浏览器自动化平台。

本文只写一期**明确不做**和**会降级**的边界，避免用户和后续开发者对 Design Mode 产生错误预期。实现细节见 F04 各阶段工单与 `workspace-browser` 代码。

## 分层归属

Design Mode 只存在于 desktop host（`desktop/` 的 main / preload / renderer / workspace-browser）：

| 层 | 是否感知 Design Mode |
| --- | --- |
| `desktop/`（host） | 是：origin 门禁、guest preload、采集、host UI 发送 |
| `angel-engine` | 否 |
| `angel-provider` | 否 |
| `angel-engine-client` / `angel-engine-client-napi` | 否 |

engine / provider / napi **不**出现 Design Mode 类型、事件或策略。发到 agent 的内容经 host 拼成普通 session 输入；下层只看到普通用户消息。

---

## 六条能力边界

### 1. 没有源码 `file:line` 映射

**一期不做**「有 sourcemap 则映射源码文件:行」。

调研结论：竞品 cradle 也未做 sourcemap 解析；它用 **React fiber 组件名链 + selector + `data-testid` + 截图** 替代。angel 一期同样采用这条路径。

若将来要做源码定位，优先：

- React fiber 的 `_debugSource` / react-grab 一类路线

**不要**做 sourcemap 解析——在 Vite dev 下投入产出比很差（hash 路径、多 chunk、HMR、解析成本高，且多数预览场景 fiber 信息已足够）。

### 2. selector 不稳定

采集得到的 CSS selector（例如 `tag.class:nth-of-type(n)`）**只适合一次性定位**，不能当持久锚点。

会漂移的常见原因：

- Tailwind / CSS Modules 的 **hash 类名** 随构建变化
- **动态列表** 插入/删除改变 `nth-of-type`
- 条件渲染、portal、样式主题切换

agent 与文档应把 selector 当作辅助线索，优先结合组件名链、`data-testid`、可见文案与截图，而不是把 selector 当成稳定 ID 存库或写测试断言。

### 3. origin 受限（仅 project preview）

Design Mode **只在当前 project 的 preview origin** 可用（例如 localhost dev server，以及用户为该 project 显式登记的预览地址）。**任意网站**上不提供 Design Mode。

这样设计的原因：

- 防止不可信页面向 **agent session** 注入 prompt（例如页面脚本伪造「用户选中」或诱导发送）
- 发送只能由 **host UI** 触发；guest 页面不得暴露可调用的「发给 agent」API
- main 侧对上报事件做 origin 二次校验，**不信任** preload / 页面自报的 origin

非白名单 origin：UI 上应不可用；main 应拒绝伪造的 design 事件。

### 4. 非 React 应用降级

组件名链依赖 React fiber 内部结构。目标页 **不是 React**，或 fiber 读不到时：

- **仍有**：selector、标签/role/label、计算样式、矩形、截图
- **没有**（或大幅变弱）：React 组件名链

定位精度会下降；agent 只能更多依赖视觉与 DOM 线索。这是预期降级，不是故障。

### 5. 敏感字段不采集

以下输入的 **value 不会进入 agent 上下文**（不采集、不序列化、不随截图旁路塞进 prompt 文本）：

- 密码类（`type="password"` 等）
- 邮箱类
- 验证码 / OTP 类

标签、类型、是否存在等非敏感元数据可以保留；默认策略是 **宁可不给 value，也不把密钥类内容送进模型**。

### 6. 不注入第三方调试脚本

cradle 会从 unpkg / jsdelivr 拉取 **latest** 的 react-scan / react-grab / eruda 等注入页面（无 SRI、无版本锁）。**angel 不做这件事。**

一期只使用本仓库控制的 guest preload / content script。若将来引入同类能力，必须：

- 使用 **本地 vendored** 副本
- **版本锁定**
- 有可审计的更新路径

禁止运行时从 CDN 拉 latest 注入 preview。

---

## 与「普通浏览」的关系

- Design Mode **关闭**时，workspace-browser 应与普通内嵌浏览一致：无 overlay、无采集监听、无 design 事件通路。
- Design Mode **不是** Playwright/CDP 级自动化；没有通用脚本执行、没有任意站点调试、没有把预览页变成 agent 工具运行时。

## 相关代码落点（实现时）

| 区域 | 职责 |
| --- | --- |
| `desktop/src/shared/workspace-browser.ts` | 共享通道与 Design 类型契约 |
| `desktop/src/main/features/workspace-browser/` | main 服务、origin 门禁、事件校验 |
| workspace-browser guest preload | 仅挂给 preview WebContentsView；默认休眠，start 才 mount |
| host renderer（workspace UI） | 开关、高亮反馈、Send to agent |

具体 API 名以代码为准；分层原则以本文与 `desktop/AGENTS.md` 为准。
