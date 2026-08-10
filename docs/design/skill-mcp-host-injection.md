# Skill / MCP Host Injection (Paseo-inspired)

Status: Stage 1 research conclusion (KIT-829 / KIT-828)  
Date: 2026-08-10  
Baseline: `0bee51e9` (angel-engine main checkout)  
Out of scope for this doc: implementing CLI bundle, engine API changes, production skill content, or a full MCP server.

## 1. Goal

Enable coding agents **running under Angel Engine** to manipulate the **host** (desktop app + daemon) the way Paseo agents can manipulate Paseo: list chats, send follow-ups, create worktrees, inspect status — without each agent implementing a custom plugin.

Constraint from KIT-828:

> Each agent only needs **one** injection mode. Prefer **Skill**. Keep a clear MCP extension point for later.

Acceptance for this stage: Stages 2–4 can implement without re-guessing interface boundaries.

## 2. Paseo model (what we studied)

Sources: [paseo.sh/docs/orchestration](https://paseo.sh/docs/orchestration), [skills](https://paseo.sh/docs/skills), [MCP](https://paseo.sh/docs/mcp), [CLI](https://paseo.sh/docs/cli), and the published `/paseo` skill (`getpaseo/paseo` → `skills/paseo/SKILL.md`).

### 2.1 Architecture

```text
┌──────────── desktop / mobile / web / CLI ────────────┐
│                     clients                          │
└───────────────────────┬──────────────────────────────┘
                        │ HTTP / WS / auth
┌───────────────────────▼──────────────────────────────┐
│  Paseo daemon  (packages/server)                     │
│  - agent process lifecycle                           │
│  - workspaces / worktrees                            │
│  - schedules / heartbeats                            │
│  - MCP server (opt-in inject into agents)            │
└───────────────────────┬──────────────────────────────┘
                        │ spawns native agent CLIs
┌───────────────────────▼──────────────────────────────┐
│  Claude / Codex / Copilot / OpenCode / Pi / …       │
│  + injected MCP tools  OR  skill+CLI knowledge       │
└──────────────────────────────────────────────────────┘
```

Key properties:

| Property | Paseo behavior |
| --- | --- |
| Single source of truth | Daemon owns agents, workspaces, terminals; all UIs are clients |
| Agent → host control | Agent calls **MCP tools** and/or **`paseo` CLI** (same ownership semantics) |
| Teaching layer | **Skills** (`SKILL.md`) document tools/CLI so the agent does not invent flags |
| Parentage | Env `PASEO_AGENT_ID` makes CLI-created agents subagents of the caller |
| Distribution | Desktop bundles CLI under app resources; first-run may symlink onto PATH |
| Install | `npx skills add getpaseo/paseo` → `~/.agents/skills/` + per-agent symlinks |
| Opt-in | `daemon.mcp.injectIntoAgents` / Settings → Enable Paseo tools |

### 2.2 Injection surfaces (Paseo)

1. **MCP tools** — large catalog (`create_agent`, `send_agent_prompt`, workspaces, schedules, permissions, …). Injected into agents when enabled. Provider-native tool interface *or* MCP, same capabilities.
2. **CLI** — full daemon surface (`paseo run|ls|send|attach|workspace|schedule|…`). Designed for **agents** as first-class callers (JSON/`-q`, background, wait).
3. **Skills** — orchestration packages (`/paseo`, `/paseo-handoff`, `/paseo-loop`, `/paseo-advisor`, `/paseo-committee`) that teach workflows and CLI/tool usage. Reference skill documents both tool names and CLI equivalents.
4. **Environment / config** — listen address, `PASEO_HOME`, agent id, orchestration preferences file.

Paseo does **not** force every agent to implement two protocols. Shell-capable agents can use **Skill + CLI alone**. MCP is the structured alternative when preferred or when the agent already has strong MCP support.

### 2.3 What to borrow vs not copy

#### Borrow

| Idea | Why it fits Angel Engine |
| --- | --- |
| Daemon-as-host API | We already have `packages/daemon` + Bearer token + `daemon-client` |
| **Skill documents CLI**, not the other way around | Agents already execute shell; no new protocol for Stage 4 MVP |
| Bundled CLI next to app resources + discoverable path | Matches desktop packaging; avoids “agent must install npm package” |
| Machine-readable CLI output (`--json`, quiet IDs) | Stable for skills and scripts |
| Parent/caller identity env (optional later) | Needed only when spawning sub-chats; not MVP |
| Opt-in host tools | Security: agents should not control host by default without product policy |
| Skill install to **standard skill roots** per runtime | We already scan those roots (`AGENT_SKILL_DIRECTORY_RULES`) |

#### Do not copy blindly

| Paseo detail | Angel Engine difference |
| --- | --- |
| Full multi-agent orchestration catalog on day 1 | Product surface is **chat/project/worktree**-centric; start with a **minimal** host CLI |
| MCP-first for every agent | Constraint: skill-first; MCP is extension only |
| `PASEO_AGENT_ID` parentage + Subagents track | We lack an equivalent subagent graph in engine; defer until product needs it |
| Hub / relay / schedules / browser / voice tools | Out of scope for KIT-828 stages |
| Symlink install into every agent’s skill dir on startup | Prefer **one** write strategy (app-managed skill root + optional symlink); avoid fighting user-managed skill trees |
| AGPL packaging assumptions | Ignore license; only copy **patterns** |

## 3. Angel Engine inventory (as of baseline)

### 3.1 What already exists

| Layer | Capability | Location / notes |
| --- | --- | --- |
| Engine protocol | `skills.list`, `skills.mention` capabilities | `crates/angel-engine` `SkillsCapabilities`, `RefreshSkills`, `UserInput::skill_mention` |
| Engine state | `available_skills` on conversation | Updated via `SessionSkillsUpdated` |
| Client discovery | FS scan of `SKILL.md` without booting agent | `crates/angel-engine-client/src/skills.rs` (`list_agent_skills`, `list_agent_skills_from_dirs`) |
| Provider skill mention | Codex encodes skill input; Pi uses `/skill:name` | `angel-provider` codex encode; `packages/pi-client` |
| Daemon API | Rich REST: chats, runs, projects, worktrees, workspace tools, agents, skills list, health | `packages/daemon/src/api.ts`, `server.ts` |
| Typed client | `createDaemonClient({ baseUrl, token })` | `packages/daemon-client` — ideal CLI backend |
| Skill dir rules | Per-runtime global + project relative dirs | `packages/daemon-api/src/agent-catalog.ts` |
| Daemon auth | Primary token (desktop) + optional mobile token; `Authorization: Bearer` | Mobile cannot hit privileged process/shutdown routes |
| MCP **observation** | `ActionKind::McpTool` for provider-originated MCP tool calls | Codex / ACP decode paths |
| Headless runner | `crates/angel` one-shot **runtime** prompt CLI | **Not** a host/daemon CLI |
| Example multi-runtime REPL | `angel_cli` under `angel-engine-client/examples` | Engine dogfood, not product host control |

### 3.2 Gaps (relevant to KIT-828)

| Gap | Evidence |
| --- | --- |
| **No host CLI** talking to daemon | No `angelctl` / product CLI package; `crates/angel` targets engine runtimes, not `/api/*` |
| **No skill injection** into agent sessions | We only **discover** and **mention** skills; we do not install or pin a host skill at session start |
| **No MCP server** for host control | ACP lifecycle hardcodes `"mcpServers": []` (`angel-provider` ACP encode) |
| **No engine capability** for “inject skill roots / MCP servers” | `ConversationCapabilities.skills` is only `list` + `mention` |
| **No agent→host env contract** | Daemon token/base URL not systematically injected into agent process env for CLI use |
| **No bundled binary in desktop package** for host control | electron-builder / forge ship app + daemon; no documented host CLI resource path |

### 3.3 Mental model today

```text
User UI ──► daemon HTTP ──► ChatEngine / AngelClient ──► provider process
                                │
                                └── skills: list from disk for composer mentions
                                    (agent may already load its own skills natively)

Agent cannot call daemon unless it independently knows host+token+HTTP shape.
```

Target after Stages 2–4:

```text
User UI ──► daemon HTTP ──► ChatEngine ──► provider process
                 ▲              │
                 │              ├── install/ensure host skill on skill roots
                 │              └── (later) optional MCP server descriptor
                 │
            host CLI (bundled)
                 ▲
                 │ shell / skill guidance
              agent process
```

## 4. Recommended injection strategy

### 4.1 Ordering (dependency graph)

```text
Stage 1  Research / contracts          ◄── this document
   │
   ▼
Stage 2  Host CLI bundle + auth context
   │         (daemon-client wrapper; package path; env contract)
   ▼
Stage 3  Engine/client “skill inject” API + MCP extension slot
   │         (no full MCP implementation)
   ▼
Stage 4  Desktop/daemon wires skill + ships host skill content
   │         (agent uses CLI under skill guidance)
   ▼
Stage 5  E2E verify + MCP follow-up doc
```

Parallelization note: Stage 2 can start from this doc’s CLI surface alone. Stage 3 needs the skill config shape from §6. Stage 4 needs both.

### 4.2 “One injection mode per agent”

| Mode | Mechanism | Who must implement | MVP? |
| --- | --- | --- | --- |
| **Skill (preferred)** | Host skill on disk + agent shell runs host CLI | Host installs skill + CLI; agent needs shell | **Yes** |
| **MCP (later)** | Host MCP server + provider `mcpServers` / native tools | Host implements MCP; adapter passes config | Extension point only |

Rule for product policy:

- If an agent has **shell + skill loading**, Skill path is sufficient — **do not require MCP**.
- If an agent has **MCP only** (no reliable shell/skill), implement MCP later; do not block Skill MVP on that agent.
- Never require **both** for the same agent to unlock host control.

### 4.3 Why Skill-first here

1. Angel Engine already has skill **discovery/mention** and multi-runtime skill directory knowledge.
2. Daemon already has a complete HTTP API; wrapping it as CLI is the smallest host surface.
3. Claude Code / Codex / Pi agents are shell-native; CLI composition is well-trained behavior.
4. MCP needs protocol lifecycle, auth bridging, tool schema churn, and adapter changes per runtime — higher cost, same product outcome for shell agents.
5. Matches Paseo’s own dual path: skills document CLI even when MCP exists.

## 5. CLI command surface draft (Stage 2 input)

### 5.1 Binary identity

| Item | Proposal |
| --- | --- |
| Command name | `angel` **or** `angelctl` — prefer **`angelctl`** for host control to avoid collision with existing `crates/angel` engine runner |
| Package | e.g. `packages/host-cli` (TS, reusing `@angel-engine/daemon-client`) **or** thin Rust later; TS first is shorter path |
| Desktop bundle path | macOS: `Angel Engine.app/Contents/Resources/bin/angelctl` (names align with final product branding) |
| Dev path | `pnpm`/bun bin from monorepo; same subcommands |

Do **not** repurpose `crates/angel` (engine one-shot) without renaming — different audience.

### 5.2 Connection / auth contract

CLI must resolve daemon contact the same way clients do:

| Variable | Meaning |
| --- | --- |
| `ANGEL_DAEMON_URL` | Base URL, e.g. `http://127.0.0.1:<port>` |
| `ANGEL_DAEMON_TOKEN` | Bearer token (primary desktop token for full API) |
| Optional file | XDG-ish state file written by desktop/daemon on start (path TBD in Stage 2), e.g. `~/.angel-engine/daemon.json` containing `{ host, port, token, version }` with restricted permissions |

Flags override env:

```bash
angelctl --url http://127.0.0.1:PORT --token "$TOKEN" health
```

Security rules for Stage 2+:

- Never print token in `--help`, logs, or error messages.
- Prefer file with `0600` over long-lived env in user shell rc.
- When spawning agent processes that may call the CLI, inject env **only for that process tree** (daemon/session scoped), not global user profile.
- Skill docs must say: do not echo tokens; do not commit daemon.json.

### 5.3 Minimal command set (MVP for host control)

Map 1:1 to existing daemon routes where possible. Output default human; `--json` for machines.

#### A. Meta (must ship first)

| Command | Daemon | Purpose |
| --- | --- | --- |
| `angelctl health` | `GET /api/health` | Smoke / readiness |
| `angelctl version` | health.version or package version | Skill diagnostics |
| `angelctl which` | local | Print resolved URL (redact token) and binary path |

#### B. Chats / runs (core “agent manipulates host”)

| Command | Daemon | Purpose |
| --- | --- | --- |
| `angelctl chat ls` | `GET /api/chats` | List chats |
| `angelctl chat get <id>` | `GET /api/chats/:id` | Read chat metadata / state |
| `angelctl chat create …` | `POST /api/chats` | Create chat (project, runtime, worktree flags as daemon supports) |
| `angelctl chat send <id> "<text>"` | `POST /api/chats/send` | Queue / send user message |
| `angelctl chat archive <id>` | `POST /api/chats/:id/archive` | Soft remove from active list |
| `angelctl run active <chatId>` | `GET /api/chats/:chatId/active-run` | Inspect active run |
| `angelctl run stop <runId>` | `DELETE /api/chat-runs/:runId` | Cancel run |
| `angelctl attention ls` | `GET /api/chat-attention` | Pending human attention |
| `angelctl activity ls` | `GET /api/chat-activity` | Activity snapshot |

Streaming SSE (`/api/chat-runs/:id/events`) can be **Phase 2** of CLI (`run observe`) — not required for first skill demo if `chat get` / `run active` suffice.

#### C. Projects / worktrees (isolation)

| Command | Daemon | Purpose |
| --- | --- | --- |
| `angelctl project ls` | `GET /api/projects` | List projects |
| `angelctl project get <id>` | `GET /api/projects/:id` | Project detail |
| `angelctl worktree ls` | `GET /api/worktrees/managed` | Managed worktrees |
| `angelctl project git-status <id>` | `GET /api/projects/:id/git-status` | Branch/dirty snapshot |

#### D. Agents / skills (introspection)

| Command | Daemon | Purpose |
| --- | --- | --- |
| `angelctl agent ls` | `GET /api/agents` | Available runtimes |
| `angelctl skill ls --runtime <id> [--project <path>]` | `GET /api/agents/skills` | Skill catalog for composer / debug |

#### E. Explicitly deferred (not MVP)

| Area | Why defer |
| --- | --- |
| Process registry kill / daemon shutdown | Privileged; dangerous if skill mis-invokes |
| Workspace file write / git push | High blast radius; expose later with policy |
| Custom agent CRUD | Niche |
| Full SSE attach UX | Nice-to-have after read path works |
| Subagent parentage (`ANGEL_CHAT_ID` recursion) | Needs product model |

### 5.4 Exit codes & output conventions

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | Usage / client error |
| 2 | Auth failure (401/403) |
| 3 | Daemon unreachable |
| 4 | Not found / domain error with known `DaemonErrorCode` |

Always support:

- `--json` → stdout pure JSON matching daemon-api types where possible  
- `--quiet` → ids only for scripting  
- Non-zero exit on `DaemonRequestError`

## 6. Skill contract draft (Stage 3–4 input)

### 6.1 Skill package shape

Standard agentskills layout (compatible with existing scanners):

```text
angel-host/                 # directory name may equal skill name
  SKILL.md                  # required; YAML frontmatter + body
  references/               # optional progressive disclosure
    cli-commands.md
    security.md
```

Frontmatter minimum:

```yaml
---
name: angel-host
description: >
  Control the local Angel Engine desktop daemon: list chats, send messages,
  inspect runs and projects. Use when the user asks to manage Angel chats
  or when orchestration needs host APIs.
---
```

### 6.2 Body obligations (what Stage 4 skill must teach)

1. **How to find the binary** (dev vs packaged), matching Stage 2 install paths.  
2. **How connection works** (env vars / state file) — never invent URLs.  
3. **Safe command examples** for the MVP surface in §5.3.  
4. **Security**: no logging tokens; no `curl` with token in shell history if avoidable; prefer CLI.  
5. **When not to use**: do not restart/kill host processes; do not mass-delete chats without user confirmation.  
6. **Discovery**: `angelctl --help` as source of truth if skill text drifts.

### 6.3 Installation / injection options (Stage 3 chooses one primary)

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| **A. Write into runtime skill roots** | On app/daemon start or session start, ensure `angel-host` exists under global skill dirs for enabled runtimes | Native skill loaders pick it up; works with mention UX | Multi-runtime duplication; user may not want auto-install |
| **B. Single app-managed root + extra scan path** | Host keeps skills under e.g. `~/Library/Application Support/Angel Engine/skills` and engine/client gains `additional_skill_dirs` | One copy; clear ownership | Requires Stage 3 API + each runtime actually reads that path (may need symlink into native roots anyway) |
| **C. Symlink from app resources into `~/.agents/skills`** | Paseo-like | Simple for agents that honor `~/.agents/skills` | Not all runtimes share that root (see catalog rules) |

**Recommendation:** **A with a single source tree** — app-managed canonical skill directory, **symlinked or copied** into each *enabled* runtime’s global skill root from `AGENT_SKILL_DIRECTORY_RULES` (and always into `~/.agents/skills` when listed). Stage 3 API should express:

```ts
// conceptual — not committed API yet
type HostSkillInjection = {
  /** Canonical skill directories owned by the host (read-only for agents). */
  skillRoots: string[];
  /** If true, host may materialize symlinks/copies into runtime skill dirs. */
  materializeIntoRuntimeRoots: boolean;
  /** Skill names the host guarantees to inject (e.g. ["angel-host"]). */
  ensureSkills: string[];
};
```

Engine/client Stage 3 surface (draft):

| Piece | Draft |
| --- | --- |
| Config on session/runtime options | `skill_injection: { roots: path[], ensure: name[] }` |
| Capability flag | `skills.inject: Supported \| Unsupported` (optional; host can inject purely at desktop/daemon layer without engine if it only writes files) |
| Lifecycle | Inject **before** first turn of a new chat session; refresh skills list after |
| MCP placeholder | `mcp_injection: { servers: McpServerConfig[] }` always accepted as empty/default; adapters that cannot apply it ignore with log |

**Important:** File-level skill materialization can be done **entirely in desktop/daemon** without engine changes. Engine Stage 3 is still valuable for:

- declaring capability honestly  
- passing extra roots into providers that support config-time skill paths  
- future MCP server descriptors on the same options object  

If Stage 3 time is tight: **daemon-only materialization + skill mention** is enough for Stage 4 demo; engine trait remains the extension slot.

### 6.4 Interaction with existing `list` / `mention`

- After inject, `GET /api/agents/skills` and engine `RefreshSkills` should see `angel-host`.  
- Composer can `@` / mention the skill.  
- Agents that auto-load all skills will pick it up without mention; others need mention or system guidance — product choice for Stage 4.

## 7. MCP extension point (design only)

### 7.1 Where to hang it

| Layer | Slot |
| --- | --- |
| Session/runtime options | `mcp_servers: Vec<McpServerConfig>` (name, transport: stdio/sse/http, command/url, env) |
| ACP encode | Replace hard-coded `mcpServers: []` with options (today: always empty) |
| Claude path | SDK MCP config when Claude moves fully behind provider; until then document TS gap |
| Codex | App-server MCP config if/when we choose to pass it |
| Daemon | Optional process hosting **Angel Host MCP** that wraps the same services as CLI |

### 7.2 Tool catalog (future parity with CLI MVP)

Mirror §5.3 only:

- `list_chats`, `get_chat`, `create_chat`, `send_chat_message`  
- `get_active_run`, `stop_run`  
- `list_projects`, `list_worktrees`  
- `list_agents`, `list_skills`  
- `health`

Do **not** design schedules/browser/voice tools now.

### 7.3 Coexistence policy

| Policy | Rule |
| --- | --- |
| Mutual sufficiency | Skill+CLI **or** MCP is enough |
| Prefer Skill in docs | Host skill remains canonical teaching layer even if MCP exists (Paseo pattern) |
| No double inject by default | Product flag: `hostControl: "skill" \| "mcp" \| "both" \| "off"`; default `"skill"` after Stage 4 |

## 8. Desktop / daemon distribution implications

| Concern | Decision for later stages |
| --- | --- |
| Bundle CLI in app resources | Stage 2 packaging (electron-builder / forge extraResources) |
| PATH install | Optional; skill must work with absolute bundled path |
| Token to agent | Session spawn injects `ANGEL_DAEMON_*` into provider env when host control enabled |
| Mobile | Mobile token is restricted; host skill should use **primary** token context only on the machine running agents (desktop host) |
| Telemetry / logs | Redact Authorization headers and token-bearing env in any debug dump |

## 9. Stage handoff checklists

### Stage 2 — App automatic bundle host CLI

- [ ] Implement `angelctl` (name final) over `daemon-client`  
- [ ] Commands: at least `health`, `chat ls`, `chat get`, `run active`  
- [ ] Auth: env + optional state file; flags override  
- [ ] Package into desktop resources; document absolute path  
- [ ] Smoke: call health with desktop-issued token  

### Stage 3 — Engine Skill inject API + MCP slot

- [ ] Document/implement `skill_injection` / `mcp_injection` on runtime or conversation options  
- [ ] Capability bits if engine-mediated  
- [ ] ACP `mcpServers` reads config (may still be empty list)  
- [ ] Unit tests for config plumbing; no full MCP server  

### Stage 4 — Skill-first E2E

- [x] Ship `angel-host` skill content (`packages/host-skill/angel-host`)  
- [x] Materialize into runtime skill roots when host control enabled (`packages/daemon` `installHostControl`)  
- [x] Inject daemon env into agent process (`ANGEL_DAEMON_*`, `ANGELCTL_*`, PATH)  
- [x] Demo: host skill materialize + `angelctl health` via daemon.json / env  


### Stage 5 — Verify + MCP follow-up

- [x] Regression checklist — `desktop/docs/qa-checklist.md` § Host control (Skill path); automated tests under `packages/host-cli`, `packages/host-skill`, `packages/daemon` host-control  
- [x] Short MCP implementation plan — [`mcp-host-control-followup.md`](./mcp-host-control-followup.md) (extension points, order, coexistence; no MCP server code)  

## 10. Open questions (do not block Stages 2–3)

1. Final binary name: `angelctl` vs product-branded name.  
2. Whether host control is default-on or Settings toggle (recommend **opt-in** initially).  
3. Whether multi-runtime skill materialization copies or symlinks.  
4. Whether Stage 3 engine API is mandatory for Stage 4 if daemon-only file inject works.  
5. Subagent parentage env — only if product adds cross-chat orchestration.

## 11. Summary recommendations

1. **Borrow Paseo’s Skill + CLI pattern**, not its full MCP catalog or multi-agent graph.  
2. **Ship host CLI first** (Stage 2) as a thin `daemon-client` wrapper with a **small** chat/project surface.  
3. **Teach via `angel-host` skill** installed into known skill roots; agents need only shell + skills.  
4. **Keep MCP as a config-shaped extension** (`mcp_servers` / ACP field) with empty default; implement tools later by wrapping the same daemon services.  
5. **Do not** conflate `crates/angel` (runtime runner) with host control CLI.  
6. Stages 2–4 can start immediately from §§5–7 without further research.

## 12. Stage 3 implementation (KIT-831)

Status: implemented on the protocol-neutral + client + ACP path.

### 12.1 Types (`crates/angel-engine/src/injection.rs`)

| Type | Role |
| --- | --- |
| `SkillInjectionConfig` | `roots`, `ensure`, `materializeIntoRuntimeRoots` |
| `McpServerTransport` | `stdio` / `sse` / `http` |
| `McpServerConfig` | named server + transport |
| `McpInjectionConfig` | `servers[]`; `to_acp_mcp_servers()` for wire |
| `HostInjectionConfig` | skill + mcp bag |

### 12.2 Capabilities

| Flag | Constant | Meaning |
| --- | --- | --- |
| `skills.inject` | `SKILL_INJECT_CAPABILITY` | Host may inject skill packages (FS materialization path) |
| `mcp.inject` | `MCP_INJECT_CAPABILITY` | Adapter accepts MCP server descriptors on session start/load/fork |

| Adapter / protocol | `mcp.inject` |
| --- | --- |
| ACP + ACP variants (OpenCode, Kimi, Gemini, Copilot, Qoder, Cursor, Cline) | **Supported** — encodes `mcpServers` |
| Codex app-server | **Unsupported** — non-empty inject returns `CapabilityUnsupported { capability: "mcp.inject" }` |
| Custom / unknown | **Unknown** until an explicit adapter is provided |

Empty `McpInjectionConfig` is always a no-op and never errors.
Cursor's ACP adapter and Skill/MCP capabilities are always available; the
`cursor-history` Cargo feature gates only local SQLite history hydration.

### 12.3 Client API (`angel-engine-client`)

| Surface | Notes |
| --- | --- |
| `mcp_injection_capability(options)` / `can_inject_mcp(options)` | **Queryable before session** — use to pick Skill vs MCP per agent |
| `ensure_mcp_injection_for_options` / `inject_mcp_into_options` | Validate or apply config with structured errors |
| `Client::mcp_injection_capability` / `Client::inject_mcp` | Live client apply path |
| `ClientOptions.skill_injection` / `mcp_injection` | Runtime-level; forwarded into `TransportOptions` |
| `RuntimeOptionsOverrides.skill_injection` / `mcp_injection` | Desktop/daemon overrides; `create_runtime_options` rejects unsupported non-empty MCP |
| `list_agent_skills_with_injection` | Merges host roots as `System` scope after project/user |
| `materialize_skill_injection` | Symlink/copy `ensure` skills into runtime global dirs |
| `SkillsSnapshot.can_inject` / `can_inject_mcp` | Snapshot capability bits after conversation exists |

Structured error on unsupported inject:

```text
EngineError::CapabilityUnsupported { capability: "mcp.inject" }
```

(surfaced as `ClientError::Engine(...)`).

### 12.4 ACP plumbing

`session/new`, `session/load`/`resume`, and fork encode `mcpServers` from `TransportOptions.mcp_injection` (empty array by default). No host MCP server process.

Codex encode path **rejects** non-empty `mcp_injection` with the same capability error (defense in depth).

### 12.5 Agent implementer minimum (Skill path)

1. Provide shell + native skill loading (or accept skill mention).
2. Host: set `skill_injection` roots/ensure, call `materialize_skill_injection` before spawn when needed.
3. Host: inject daemon env (`ANGEL_DAEMON_*`) into process env (Stage 2/4).
4. Ship `angel-host` skill content (Stage 4) under a host root.

MCP is optional; do not require it for host control.

### 12.6 Still Stage 4+

- Production `angel-host` skill body + desktop/daemon wire-up.
- Codex/app-server MCP config pass-through.
- Full host MCP server process wrapping daemon APIs.

## 13. Stage 4 implementation (KIT-832)

Status: Skill-first host control wired end-to-end without MCP.

### 13.1 Skill package

| Path | Role |
| --- | --- |
| `packages/host-skill/angel-host/SKILL.md` | Teaching layer: find `angelctl`, connect, safe commands, security |
| `packages/host-skill/angel-host/references/` | Progressive disclosure (CLI map, security) |

### 13.2 Daemon install (`packages/daemon/src/features/host-control/`)

On daemon bind (after `daemon.json` write):

1. Resolve skill dir + `angelctl` bin (env → packaged resources → monorepo packages).
2. `materializeHostSkill` → symlink/copy into runtime global skill roots from `AGENT_SKILL_DIRECTORY_RULES` (skips `/etc/*`).
3. Apply `ANGEL_DAEMON_URL` / `ANGEL_DAEMON_TOKEN` / `ANGELCTL_*` / PATH onto **daemon** `process.env` so Claude/Pi children that inherit env also see them.
4. `createChatSession` merges the same keys into Angel runtime `environment` for explicit spawn injection.

Disable with `ANGEL_HOST_CONTROL=0`.

### 13.3 Desktop packaging

| Surface | Location |
| --- | --- |
| CLI | `Resources/bin/angelctl` (KIT-830) |
| Skill | `Resources/skills/angel-host` (Forge `packageAfterCopy` + electron-builder extraResources) |
| Dev supervisor env | `ANGELCTL_BIN_DIR` + `ANGEL_HOST_SKILL_ROOT` from monorepo |
| Packaged supervisor env | `ANGEL_RESOURCES_PATH` + derived bin/skill roots |

### 13.4 MCP

**Not implemented.** Host control is Skill + CLI only. Engine `mcp_injection` remains an empty extension slot from Stage 3.

## 14. Stage 5 verification (KIT-834)

Status: Skill-path regression locked + MCP follow-up written; MCP server still not implemented.

| Deliverable | Location |
| --- | --- |
| Automated regression | `packages/host-cli` tests (help/auth/health/chat/skill/write mocks); `packages/host-skill` layout; `packages/daemon` host-control materialize/env/install |
| Manual QA checklist | `desktop/docs/qa-checklist.md` § Host control (Skill path) |
| MCP follow-up | [`mcp-host-control-followup.md`](./mcp-host-control-followup.md) |

KIT-828 acceptance (research, CLI bundle, skill inject, MCP extension clarity) is met without shipping MCP tools.

