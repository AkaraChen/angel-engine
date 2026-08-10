# MCP Host Control Follow-up (Stage 5)

Status: design only — **do not implement in this stage**  
Parent: KIT-828 / Stage 5 KIT-834  
Skill-first path (shipped): Skill + `angelctl` → daemon HTTP  
Related: [`skill-mcp-host-injection.md`](./skill-mcp-host-injection.md) §§7, 12–13

## Goal

Document a clear MCP extension path so a future issue can implement host control via MCP **without** re-deriving research. Skill + CLI remains the default; MCP is optional for agents that prefer structured tools over shell.

## Current extension points (already in tree)

| Layer | Location | What exists today |
| --- | --- | --- |
| Protocol types | `crates/angel-engine/src/injection.rs` | `McpServerTransport`, `McpServerConfig`, `McpInjectionConfig`, `HostInjectionConfig` |
| Capability | `crates/angel-engine/src/capabilities.rs` | `mcp.inject` (`MCP_INJECT_CAPABILITY`); empty inject is always a no-op |
| Client API | `crates/angel-engine-client` | `mcp_injection` on options; `mcp_injection_capability` / `can_inject_mcp`; `ensure_mcp_injection_for_options`; `Client::inject_mcp` |
| ACP wire | `crates/angel-provider` ACP encode | `session/new`, load/resume, fork encode `mcpServers` from `TransportOptions.mcp_injection` (default `[]`) |
| Codex | Codex encode path | Non-empty MCP inject → `CapabilityUnsupported { capability: "mcp.inject" }` |
| Daemon / desktop | `packages/daemon` host-control | **Skill-only** install; no MCP process |
| Product policy (draft) | design §7.3 | `hostControl: "skill" \| "mcp" \| "both" \| "off"`; default `"skill"` |

There is **no** host MCP server process and **no** daemon route that starts one.

## Mutual exclusion / coexistence

| Rule | Detail |
| --- | --- |
| Mutual sufficiency | Skill+CLI **or** MCP is enough for host control. Agents implement **one**. |
| Default | `"skill"` after Stage 4. Do not inject both unless product explicitly sets `"both"`. |
| Prefer Skill teaching | Even with MCP, keep `angel-host` skill as the human-readable workflow layer (Paseo pattern). |
| Capability pick | Call `mcp_injection_capability(options)` / `can_inject_mcp` **before** session; if unsupported, use Skill path only. |
| Codex | Prefer Skill+CLI until app-server MCP pass-through is implemented. |

## Suggested implementation order (future issue)

### Phase A — Host MCP server (thin wrapper)

1. New package e.g. `packages/host-mcp` (or `packages/daemon` subfeature) that speaks MCP stdio.
2. Tools mirror **CLI MVP only** (same ownership as `angelctl`), not a full Paseo catalog:

   | Tool | Maps to |
   | --- | --- |
   | `health` | `GET /api/health` |
   | `list_chats` / `get_chat` / `create_chat` / `send_chat_message` / `archive_chat` | chat routes |
   | `get_active_run` / `stop_run` | run routes |
   | `list_projects` / `list_worktrees` | project/worktree routes |
   | `list_agents` / `list_skills` | agent/skill routes |

3. Reuse `@angel-engine/daemon-client` + same auth as CLI (`ANGEL_DAEMON_URL` / `ANGEL_DAEMON_TOKEN`). Never log tokens.
4. Ship binary path convention: `Resources/bin/angel-host-mcp` (or stdio entry next to `angelctl`).

### Phase B — Daemon/session inject

1. When `hostControl` is `"mcp"` or `"both"`, build:

   ```text
   McpInjectionConfig {
     servers: [{
       name: "angel-host",
       transport: Stdio {
         command: <bundled angel-host-mcp>,
         args: [],
         env: { ANGEL_DAEMON_URL, ANGEL_DAEMON_TOKEN }  // process-scoped
       }
     }]
   }
   ```

2. Pass via runtime `mcp_injection` / `ClientOptions` already supported by Stage 3.
3. Keep Skill materialization when mode is `"skill"` or `"both"`.
4. Gate with settings / env (e.g. extend `ANGEL_HOST_CONTROL` or a dedicated `ANGEL_HOST_CONTROL_MODE`).

### Phase C — Adapter gaps

1. **ACP family**: already encodes `mcpServers` — verify non-empty inject against OpenCode/Kimi/Gemini/etc. smoke.
2. **Codex**: implement app-server MCP config pass-through **or** document permanent Skill-only for Codex.
3. **Claude / Pi TS paths**: ensure session factory forwards `mcp_injection` when mode enables MCP (today Skill env merge only).
4. Tests: unit for config build; integration with mock MCP transport; no live agent required for Phase A.

### Phase D — Product polish (optional)

1. UI toggle: host control off / skill / mcp / both.
2. Composer skill mention remains useful even when MCP tools exist.
3. Telemetry redaction for MCP env and Authorization headers.

## Explicit non-goals for the first MCP issue

- Schedules, browser, voice, hub/relay tools.
- Replacing or removing Skill+CLI.
- Requiring both modes for any single agent.
- Global install of MCP into the user shell (process-scoped env only).

## KIT-828 acceptance mapping

| Acceptance item | Status after Stage 5 |
| --- | --- |
| Paseo research conclusion landed | Yes — `skill-mcp-host-injection.md` |
| CLI bundle | Yes — `packages/host-cli` + desktop resources |
| Skill injection | Yes — `packages/host-skill` + daemon `installHostControl` |
| MCP clear extension point | Yes — types + ACP encode + this follow-up plan; **implementation deferred** |

## Handoff checklist for the implementer

- [ ] Open a dedicated issue (not KIT-834) for MCP server + inject mode.
- [ ] Start from Phase A tool table above; do not invent extra tools.
- [ ] Reuse daemon-client; do not reimplement HTTP auth.
- [ ] Preserve Skill path as default; add mode switch only when MCP works.
- [ ] Add focused unit tests on config plumbing and empty-vs-nonempty capability checks.
- [ ] Update `angel-host` skill with “MCP optional” section only if tools ship.
