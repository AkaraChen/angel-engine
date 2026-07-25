# Desktop Chat Run Continuity

Status: Stage 1 contract
Date: 2026-07-25
Baseline checked at: `8a3ebc5`

## Summary

Desktop chat runs must belong to the daemon, not to the lifetime of a renderer
window, an assistant-ui runtime instance, or one `fetch` call. Switching chats,
closing a window, and reloading the renderer detach an observer; they do not
cancel the provider run. Only an explicit Stop cancels it.

Stage 1 freezes the contract that lets Stage 2 be a semantic migration instead
of an HTTP re-skin: run lifecycle, the notification event source, where prewarm
lives, and which client the desktop is allowed to use. Stage 2 implements the
desktop switch; Stage 3 removes `/api/chat-streams`.

This document is the desktop counterpart to
[`mobile-chat-run-continuity.md`](./mobile-chat-run-continuity.md). Wire
contract, route table, and ordering invariants are shared and are not repeated
here — only the desktop-specific decisions are.

## Current Baseline

`desktop/src/renderer/features/chat/api/desktop-agent-adapter.ts` opens
`POST /api/chat-streams?streamId=...` through a raw
`getDaemonTransport().fetch` and decodes SSE by hand. `chat-run-stream.ts`
consumes it via `streamChatEvents`, and the chat id for a new chat arrives
mid-stream as a `{ type: "chat" }` event. The renderer therefore starts every
new chat against a synthetic draft slot key and rewrites it afterwards through
`draftRedirects` / `moveActiveRunToChat` in `chat-run-registry.ts`.

Main-process notifications come from `desktop/src/main/daemon/events.ts`, which
subscribes to the global `chat-stream` WebSocket event and mirrors every stream
event to derive "needs input" and "turn completed". That makes the main process
a second consumer of raw stream semantics.

Both are migration debt, not desired behavior.

## Locked Decisions

### 1. Notifications are a pull model on `chat-attention-changed`

No new run-level global WebSocket event is added. `chat-attention-changed` is
the only signal; it carries chat ids, never payloads.

- **needsInput** — on `chat-attention-changed`, the main process calls
  `GET /api/chats/:chatId/active-run` and renders the notification from the
  snapshot's `pendingElicitation` title/body. A snapshot whose status is not
  `needsInput` produces no notification.
- **completed** — once the run leaves the registry there is no `result.text` to
  read, so the completed notification takes its body from the chat's canonical
  history. Preferred: read the last assistant message via
  `POST /api/chats/:chatId/load`. Acceptable fallback: show a title-only
  notification. Adding a global `completed` event to carry the text is
  explicitly forbidden.
- `GET /api/chat-attention` remains the bootstrap/refresh read; the store in
  `packages/daemon/src/features/chat/attention.ts` is already the tombstone that
  survives the run leaving the registry.

Consequence: `desktop/src/main/daemon/events.ts` stops mirroring
`chat-stream` events and stops keeping its own `streams` map with per-stream
`notified` sets. Attention identity (`<runId>:input:<elicitationId>`,
`<runId>:completed`) replaces that dedupe.

### 2. Continuity matches mobile

- The client generates `runId`; the daemon reserves and executes it.
- Disconnect, chat switch, window close, and unmount **detach**, never cancel.
- Only an explicit Stop calls `DELETE /api/chat-runs/:runId`.
- Reconnect is `GET /api/chats/:chatId/active-run` followed by
  `GET /api/chat-runs/:runId/events`, snapshot first.

Desktop-specific readings of that contract:

| Event | Behavior |
| --- | --- |
| Send in a chat | Renderer mints `runId`, calls `POST /api/chat-runs/:runId`, observes the returned stream. |
| Switch chat / tab | Abort the observer only. The run keeps executing; the tab shows it as active on return. |
| Renderer reload (F5, HMR) | New observer, no new run: `active-run` then `/events`. In-flight assistant text is rebuilt from the snapshot, not replayed from a journal. |
| Window close with other windows open | Detach that window's observers. Other windows' observers and the run are untouched. |
| Last window closed / app quit | Still detach only. Daemon-process lifetime, not window lifetime, ends runs. Surviving a daemon restart is out of scope. |
| Stop button | `DELETE /api/chat-runs/:runId`. This is the only observer-facing cancellation. |
| Elicitation answer | `POST /api/chat-runs/:runId/elicitation`, which also clears attention for that chat. |

### 3. create-before-run, and prewarm hangs off create

`ChatRunStartInput` stays pure: it requires an existing `chatId` and carries
only per-turn overrides. It must not grow `prewarmId`, `projectId`, `cwd`,
`runtime`, or `creationLocation` — that is exactly how stream semantics would
come back.

Prewarm is a chat-creation optimization, so `prewarmId` belongs on
`POST /api/chats`. **Implemented in this stage** (see below). Without it,
desktop's first message after a prewarm would silently drop the prewarmed
session and get slower with no visible failure.

Desktop send for a new chat becomes two calls:

1. `POST /api/chats` with `{ projectId, runtime, creationLocation, prewarmId }`
   → real `chatId`.
2. `POST /api/chat-runs/:runId` with `{ chatId, text, ... }`.

Worktree chats still cannot be created through `POST /api/chats`
(`chat-worktree-creation-forbidden`) and are also not prewarmable; that path
keeps using the send route until Stage 3 gives it a create-side equivalent.

### 4. Real chat ids delete the draft redirect machinery

Because step 1 returns a real `chatId` before any run starts, there is no
mid-stream chat id anymore. Stage 2 removes, in the renderer:

- `draftRedirects` from `chat-run-types.ts`, `chat-run-registry.ts`,
  `chat-run-reducer.ts`
- `moveActiveRunToChat` and its call site in `chat-run-stream.ts`
- the `{ type: "chat" }`-driven `onChatCreated` plumbing threaded through
  `chat-run-store.ts`, `use-send-chat-message.ts`, `app-runtime-provider.tsx`,
  `engine-model-adapter.ts`, `new-chat-thread.tsx`, `new-chat-composer.tsx`,
  `workspace-chat-thread.tsx`, and `workspace-page-view.tsx`

`onChatCreated` may survive as a plain post-create callback fired by the
create request. What must go is the version driven by a stream event.

### 5. Desktop uses `@angel-engine/daemon-client` — hard requirement

Desktop must not hand-write another SSE decoder. `@angel-engine/daemon-client`
owns HTTP/SSE decoding and rejects malformed envelopes at the boundary.

Already in place at this baseline:

- `desktop/package.json` depends on `@angel-engine/daemon-client`
  (`workspace:*`).
- Renderer: `desktop/src/renderer/platform/api-client.ts` builds the client with
  `fetch: (pathname, init) => getDaemonTransport().fetch(pathname, init)`. The
  transport injects the daemon base URL and the `angel-engine-token` auth, so
  the client is constructed with `baseUrl: ""`.
- Main: `desktop/src/main/daemon/client.ts` exports `daemonClient` over
  `fetchDaemon`, failing with `DaemonRequestError.unavailable()` when no daemon
  is connected.

So Stage 2 adds no new wiring; it deletes the bypass. Acceptance for Stage 2 is
that `desktop-agent-adapter.ts` and
`desktop/src/renderer/features/chat/api/chat-stream.ts` are gone and every chat
run call goes through `daemon.chatRuns.*` / `daemon.chats.*`, with
`getDaemonTransport()` used only to build the client, never to fetch a chat
route directly.

### 6. `ChatStreamEvent` stays

The event union is the shared payload of `ChatRunObserverEvent` and is not part
of the debt. Stage 3 deletes `ChatStreamApi` and the `/api/chat-streams` routes,
not the event type. Renaming `ChatStreamController` to `ChatRunController` is
optional and non-blocking.

## Implemented in Stage 1

`prewarmId` on chat creation:

- `packages/daemon-api/src/chat/index.ts` — `ChatPrewarmIdInput` joins
  `ChatCreateInput`, and `chatCreateInputSchema` accepts
  `"prewarmId?": "string > 0 | undefined"`. `ChatRunStartInput` is unchanged.
- `packages/daemon/src/features/chat/engine-runtime.ts` —
  `createChatFromInput` claims a matching prewarm through the shared
  `takeChatPrewarm`, adopts its session and `cwd`, registers the session under
  the new chat id, and persists the remote thread id. A `prewarmId` that is
  unknown, not ready, or mismatched falls back to a cold create rather than
  failing — same tolerance the send path already had.
- `chatPrewarmMatches` / `takeChatPrewarm` now take a `ChatPrewarmClaimInput`
  (`creationLocation`, `cwd`, `projectId`, `runtime`) so create and the legacy
  send path share one matching rule.
- `daemon-client` needs no change: `chats.create` forwards the whole input.

Tests: `packages/daemon-api/src/chat/__tests__/create-input.test.ts` (schema
accepts `prewarmId`, rejects an empty one, and a type-level assertion that
fails to compile if `ChatRunStartInput` ever grows `prewarmId`) and a
`POST /api/chats` forwarding case in `packages/daemon/src/api.test.ts`.

## Stage 2 Implementation Checklist

1. **Create then run.** In `chat-run-store.ts` / `chat-run-stream.ts`, when
   `input.chatId` is absent, call `daemon.chats.create({ projectId, runtime,
   creationLocation, prewarmId, model, mode, permissionMode, reasoningEffort })`
   first, then start the run against the returned id.
2. **Drop the draft indirection.** Remove `draftRedirects`,
   `moveActiveRunToChat`, and the stream-driven `onChatCreated`, and key slots
   by real chat id from the start. Update
   `state/__tests__/chat-run-machine.test.ts` accordingly.
3. **Replace the transport.** Delete `chat-stream.ts` and
   `desktop-agent-adapter.ts`; drive runs through `daemon.chatRuns.start` /
   `observe` / `stop` / `resolveElicitation`. Test doubles that currently mock
   `streamChatEvents` (`state/__tests__/plan-normalization.test.ts`,
   `state/__tests__/assistant-materialization.test.ts`) move to mocking the
   daemon client's run methods.
4. **Detach, don't cancel.** Observer teardown on chat switch / unmount /
   window close aborts the observer only. Stop is the single caller of
   `daemon.chatRuns.stop`.
5. **Reconnect on mount.** On chat open and on renderer reload, call
   `daemon.chatRuns.active(chatId)`; if a run is returned, apply its snapshot
   and attach `observe(runId)`.
6. **Rewrite main notifications.** `desktop/src/main/daemon/events.ts` handles
   only `chat-attention-changed`: fetch `active-run` for needsInput, and read
   the last assistant message via chat load for completed. Delete the
   `chat-stream` handler, the `streams` map, and `notifyTool`'s stream-derived
   dedupe.

## Acceptance for Stage 2

- Killing and reopening a chat tab mid-run shows the run still streaming.
- Renderer reload mid-run reattaches with correct in-flight assistant text.
- Stop is the only action that ends a run.
- A permission prompt raised while the window is in the background produces
  exactly one OS notification, sourced from `active-run`.
- No file under `desktop/src` imports SSE decoding of its own.

## Out of Scope

- Fleet, multiple simultaneous active runs per chat, and cross-device handoff
- Native/remote push delivery
- Surviving a daemon process restart
- Removing `/api/chat-streams` (Stage 3)
- An unbounded event replay log

## Repository Hygiene

`knip.json` now configures `mobile`, `packages/daemon`,
`packages/daemon-api`, and `packages/daemon-client` so dead code in the run
contract's own packages is visible during this migration. `bun run knip` runs
and exits non-zero on pre-existing findings; the known noise is:

- `ERROR: Error loading mobile/vite.config.ts (Mobile Vite requires a valid
  PORT environment variable.)` — the config throws by design when `PORT` is
  unset. Pre-existing, unrelated to workspace coverage.
- `vendor/**` dominates the unused-file list (Codex TS type mirrors, kept
  deliberately).
- Adding the four workspaces cut unused files from 544 to 512 and unused
  exports from 67 to 30; the remaining `mobile/**` and `packages/daemon/**`
  findings are real and are follow-up cleanup, not Stage 1 work.
