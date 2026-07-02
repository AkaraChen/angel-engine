# Claude Runtime Home

Status: design spike recommendation
Date: 2026-07-02
Baseline checked at: `7f53a6e`

## Summary

Claude should not stay as an informal exception in desktop TypeScript forever.
The long-term target should be a repo-owned SDK-over-stdio shim plus a Rust
`angel-provider` adapter, so Claude-specific SDK and transcript semantics are
normalized before shared engine state, NAPI snapshots, and desktop projection.

Do not jump straight to the external ACP bridge as the product path. The current
`agentclientprotocol/claude-agent-acp` bridge is alive and useful, but adopting
it would replace our duplicated TypeScript adapter with another large
TypeScript adapter whose behavior is tuned for ACP editor clients. Use it as
evidence and a compatibility reference, not as Angel Engine's internal Claude
runtime boundary.

Near term, keep the current dual stack only behind an explicit contract and
conformance tests while the shim is built. That makes the existing path safer
without accepting it as the long-term architecture.

## Current Baseline

The drift check found that `packages/claude-client` and
`desktop/src/main/features/chat/engine-runtime.ts` changed since the plan was
written. The core premise still holds:

- `desktop/src/main/features/chat/engine-runtime.ts` still defines
  `DesktopChatSession = DesktopAngelSession | ClaudeCodeSession`.
- `createChatSession()` still special-cases `runtime === "claude"` and returns
  `new ClaudeCodeSession()`.
- Other runtimes still go through `DesktopAngelSession`, which drives the Rust
  engine/client/provider path.
- `packages/claude-client/src/session.ts` still imports
  `@anthropic-ai/claude-agent-sdk`, creates SDK `query()` streams, handles
  `canUseTool`, and manually emits engine JSON events through
  `ClaudeCodeEngineAdapter`.

The Claude TS stack is now about 3.3k LOC across `packages/claude-client/src`.
The current code is stricter than the original audit snapshot because plans
012/013/014/033 landed targeted fixes and tests. Those fixes do not remove the
architecture issue: Claude runtime semantics are still interpreted outside
`angel-provider`.

The four audit parity bugs remain useful evidence of structural drift, even
where fixed now:

- Cancel was recorded as `Failed` instead of `Interrupted`.
- Image tool-result blocks could throw during hydrate.
- Permission action IDs were fabricated instead of using SDK tool IDs.
- Binary attachments were silently dropped instead of mapping supported PDFs or
  failing unsupported blobs.

## Behavior Inventory

| Capability                                   | Current Claude implementation                                                                                                                  | Engine mapping verdict                                                                                                                                |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| In-process SDK query loop                    | `ClaudeCodeSession.sendTextNow()` calls SDK `query()` and iterates `SDKMessage` values directly.                                               | Needs adapter boundary. A stdio shim can emit normalized protocol messages; Rust adapter can translate them to `EngineEvent`.                         |
| Permission interception                      | `queryOptions()` passes `canUseTool`; `canUseTool()` opens engine elicitations and returns SDK `PermissionResult`.                             | Needs new bidirectional shim command. ACP can express permission requests, but SDK callback timing and `updatedInput` should be preserved explicitly. |
| Initialization metadata                      | `initializationResult()` supplies commands, models, permission modes, reasoning effort, and cwd.                                               | Maps cleanly to existing session/config/model/context events.                                                                                         |
| Runtime settings mutation                    | Current code maps model, reasoning effort, and permission mode into SDK options and local engine context updates.                              | Maps cleanly if shim exposes typed `set_model`, `set_permission_mode`, and `set_reasoning` effects.                                                   |
| Hydrate replay                               | `getSessionMessages()` plus `historyEventsFromSessionMessages()` reconstructs user, assistant, reasoning, tool, and file parts.                | Needs adapter-owned replay normalization. Existing engine history concepts are sufficient, but transcript parsing belongs behind the adapter.         |
| User input conversion                        | `claudePrompt()` maps text, image, file mentions, embedded text, PDF documents, resource links, and raw content blocks into SDK user messages. | Needs adapter-owned request encoding. Most maps cleanly from existing `SendTextRequest.input`; unsupported blobs should fail fast at boundary.        |
| Tool taxonomy                                | `tooling.ts` maps Claude tool names to engine action kinds, titles, summaries, output kinds, and ACP-like history tool payloads.               | Maps cleanly, but should live in the Claude provider adapter because it is provider vocabulary.                                                       |
| Plan and todo mapping                        | `plan.ts` interprets `TodoWrite`, `ExitPlanMode`, and plan-file writes as engine plan/todo events.                                             | Needs explicit engine concept coverage. Current `PlanDelta`, `PlanUpdated`, and `TodoUpdated` events can carry it.                                    |
| AskUserQuestion                              | `elicitation.ts` converts Claude `AskUserQuestion` tool inputs to engine questions and applies answers back into SDK input.                    | Needs adapter boundary plus round-trip response command. Existing elicitation model mostly fits.                                                      |
| Usage and context window                     | `sessionUsageUpdated()` converts SDK result usage and `modelUsage` into engine session usage.                                                  | Maps cleanly to existing usage events.                                                                                                                |
| Local slash commands and SDK system messages | Current code ignores known SDK-only notifications and fails fast on unknown message types/subtypes.                                            | Needs an allow-list in adapter. Unknown SDK messages should fail fast, not silently disappear.                                                        |
| Query lifecycle                              | Current code owns `Query.close()`, abort bridging, `interrupt()`-like cancellation behavior, and one active query.                             | Needs new shim lifecycle contract. ACP has cancel, but SDK process lifetime and wedged-query handling must be specified.                              |
| Native binary resolution                     | Current code passes `pathToClaudeCodeExecutable` because packaged optional native CLI resolution is fragile.                                   | Boundary concern. Shim should own CLI resolution and expose a clear startup error.                                                                    |
| Hooks and MCP servers                        | The SDK supports hooks, MCP servers, task events, and plugin/system messages. Current in-repo code only partially surfaces them.               | Some map cleanly; some need new engine concepts. Must inventory before deleting the TS path.                                                          |

## Transport Options

| Option                          | Feasibility                                                                                                                                     | Parity-bug class eliminated?                                                                               | LOC estimate                                                                                                                              | Risk to working Claude path                                                                                                             | Effort |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| ACP bridge (`claude-agent-acp`) | Technically feasible. Zed's bridge is now `agentclientprotocol/claude-agent-acp`, uses the official Claude Agent SDK, and is actively released. | Eliminates in-repo SDK parsing if adopted wholesale, but imports another adapter's policy and quirks.      | Deletes much of `packages/claude-client`; adds config around external ACP server. Net deletion possible, but behavior shifts to upstream. | Medium-high. ACP bridge is editor-oriented and has open issues around permissions, session behavior, billing/auth, and command leakage. | M      |
| Repo-owned SDK-over-stdio shim  | Feasible. A small Node process can own the Agent SDK `query()` loop and speak a narrow JSON-RPC protocol to a Rust adapter.                     | Best long-term fit. Moves Claude SDK semantics behind `angel-provider` while preserving SDK-only features. | Adds a small JS shim and Rust adapter; later deletes most TS runtime duplication.                                                         | Medium. Requires new protocol and e2e smoke, but migration can run beside current TS path.                                              | L      |
| Formalized dual stack           | Feasible immediately. Extract a shared desktop session contract and add conformance tests for hydrate/send/cancel/permission.                   | Reduces future regressions but does not remove duplicate SDK parsing or adapter law violation.             | Small additions; no near-term deletion.                                                                                                   | Low. Keeps the current working path.                                                                                                    | S-M    |

## External Findings

- The current official Claude Agent SDK TypeScript docs define `query()` as the
  primary API and return a `Query` async generator with lifecycle/mutation
  methods such as `interrupt()`, `setPermissionMode()`, `setModel()`,
  `initializationResult()`, and `streamInput()`.
- The SDK bundles a native Claude Code binary as optional platform packages and
  documents `pathToClaudeCodeExecutable` as the escape hatch when optional
  dependencies are unavailable.
- `agentclientprotocol/claude-agent-acp` says it implements an ACP agent using
  the official Claude Agent SDK and supports context mentions, images, tool
  permission requests, edit review, TODO lists, terminals, slash commands, and
  client MCP servers.
- Its package metadata currently depends on
  `@anthropic-ai/claude-agent-sdk@0.3.197`; GitHub shows active releases
  continuing into 2026-07-02.
- The same ecosystem also shows why adopting the ACP bridge is not a free
  architecture win: issues document permission semantics mismatches, rich UI
  leakage, session/auth concerns, and native binary resolution problems.

References:

- Claude SDK docs: https://code.claude.com/docs/en/agent-sdk/typescript
- Claude SDK repo: https://github.com/anthropics/claude-agent-sdk-typescript
- ACP bridge repo: https://github.com/agentclientprotocol/claude-agent-acp
- ACP bridge package metadata:
  https://raw.githubusercontent.com/agentclientprotocol/claude-agent-acp/main/package.json
- Zed Claude Agent page: https://zed.dev/acp/agent/claude-agent
- Permission issue example:
  https://github.com/agentclientprotocol/claude-agent-acp/issues/94

## Recommended Path

Recommendation: choose the SDK-over-stdio shim as the long-term home, with a
short conformance-test hardening step before migration.

Rationale:

- It obeys the repo's adapter boundary: Claude wire/SDK semantics normalize in
  the provider layer, not in desktop/client/shared state.
- It preserves SDK-only features better than a generic ACP bridge because we
  control the protocol surface for `canUseTool`, `getSessionMessages`,
  `initializationResult`, hooks, task events, and future SDK messages.
- It keeps the migration incremental. Desktop can keep using the current
  `ClaudeCodeSession` while a hidden Rust-adapter path is built and tested
  against the same conformance suite.
- It avoids taking a runtime dependency on another project's 5k-line adapter and
  its product assumptions.

Do not delete the TS path until the shim has passed these minimum checks:

- Send one text turn and receive assistant text.
- Answer a permission prompt and preserve the SDK `toolUseID`.
- Cancel a running turn and surface `Interrupted`.
- Hydrate a prior session with text, reasoning, tool call/result, image result,
  and PDF/document attachment fixtures.
- Load runtime configuration: commands, models, permission modes, and reasoning
  settings.

## Minimal Prototype Sketch

The cheapest validating artifact for the recommendation is a throwaway Node
stdio process. It does not need to be product code; it proves the shape before a
Rust adapter is written.

```js
#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { query } from "@anthropic-ai/claude-agent-sdk";

const rl = createInterface({ input });

for await (const line of rl) {
  const request = JSON.parse(line);
  if (request.method !== "turn/send") {
    output.write(
      JSON.stringify({
        error: "unsupported method",
        id: request.id,
      }) + "\n",
    );
    continue;
  }

  const stream = query({
    prompt: request.params.prompt,
    options: {
      cwd: request.params.cwd,
      model: request.params.model,
      pathToClaudeCodeExecutable: request.params.executable,
      permissionMode: request.params.permissionMode,
    },
  });

  for await (const message of stream) {
    output.write(
      JSON.stringify({
        id: request.id,
        method: "claude/sdk_message",
        params: message,
      }) + "\n",
    );
  }

  output.write(
    JSON.stringify({
      id: request.id,
      result: "done",
    }) + "\n",
  );
}
```

The real version would add typed message envelopes, a permission callback
round-trip, cancellation, startup/configuration requests, and strict schema
validation at the shim boundary. Unknown SDK message types should fail fast in
the Rust adapter during development.

## Follow-up Scope

1. Add a conformance test suite around the current desktop session contract:
   send, permission, cancel, hydrate, runtime config.
2. Build a hidden `claude-sdk-stdio` shim executable in `packages/claude-client`
   or a new package, with no desktop UI dependency.
3. Add a Rust Claude provider adapter that decodes the shim's JSON-RPC messages
   into protocol-neutral `EngineEvent` and encodes engine `ProtocolEffect`
   commands back to the shim.
4. Run both paths behind a local feature flag until snapshots and turn events
   match.
5. Delete the TypeScript `ClaudeCodeSession` only after desktop uses the engine
   path and the conformance suite passes against fixtures and a live smoke.

## Open Questions

- Is the maintainer willing to own a small repo-local Node shim as part of the
  Rust provider stack, or is an external ACP bridge acceptable despite its
  editor-oriented behavior?
- Which SDK-only features are product requirements for Angel Engine: hooks,
  task events, MCP server controls, file rewind, background tasks, plugin
  events, or raw SDK messages?
- Should Claude session files remain the source of hydrate truth, or should the
  engine persist enough normalized history to avoid SDK transcript parsing?
- What is the supported binary resolution policy: bundled SDK native binary,
  installed `claude`, `CLAUDE_CODE_PATH`, or an explicit desktop setting?
- How strict should live parity be before deleting the TS path: fixture parity
  only, or fixture plus live Claude smoke on every release branch?
