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
lives, and which client the desktop is allowed to use. Stage 2 implemented the
desktop switch; Stage 3 removed `/api/chat-streams` outright.

This document is the desktop counterpart to
[`mobile-chat-run-continuity.md`](./mobile-chat-run-continuity.md). Wire
contract, route table, and ordering invariants are shared and are not repeated
here — only the desktop-specific decisions are.

## Baseline at Stage 1 (historical)

This section records the pre-migration behavior. Every file and route it names
was deleted in Stage 2 (desktop, KIT-207) and Stage 3 (daemon and client,
KIT-208).

`desktop/src/renderer/features/chat/api/desktop-agent-adapter.ts` opened
`POST /api/chat-streams?streamId=...` through a raw
`getDaemonTransport().fetch` and decoded SSE by hand. `chat-run-stream.ts`
consumed it via `streamChatEvents`, and the chat id for a new chat arrived
mid-stream as a `{ type: "chat" }` event. The renderer therefore started every
new chat against a synthetic draft slot key and rewrote it afterwards through
`draftRedirects` / `moveActiveRunToChat` in `chat-run-registry.ts`.

Main-process notifications came from `desktop/src/main/daemon/events.ts`, which
subscribed to the global `chat-stream` WebSocket event and mirrored every stream
event to derive "needs input" and "turn completed". That made the main process
a second consumer of raw stream semantics.

Both were migration debt, not desired behavior.

## Locked Decisions

### 1. Notifications are a pull model on `chat-attention-changed`

No new run-level global WebSocket event is added. `chat-attention-changed` is
the only signal.

**The event is a hint, not a verdict.** It carries `chatIds` and nothing else
(`packages/daemon-api/src/events.ts`), and the daemon publishes it on *every*
attention transition — including clears: run start, acknowledge, elicitation
resolve, chat archive/delete (`packages/daemon/src/api.ts`). So the event says
"attention for this chat changed", never "this chat completed".

`GET /api/chat-attention` is the authoritative status read. The store in
`packages/daemon/src/features/chat/attention.ts` is the tombstone that survives
the run leaving the registry, and its `status` is a closed union of
`needsInput | completed`.

Required sequence on `chat-attention-changed`:

1. `GET /api/chat-attention`; find the row for the chat id.
2. **Row absent** — attention was cleared. Drop local state for that chat and
   show nothing. Never infer completion from a missing row.
3. **`status: "needsInput"`** — `GET /api/chats/:chatId/active-run` and render
   the notification from the snapshot's `pendingElicitation` title/body. A
   snapshot that is `null` or not `needsInput` produces no notification (the run
   was answered or cancelled between the event and the read).
4. **`status: "completed"`** — the run has left the registry, so there is no
   `result.text`. Take the body from the chat's canonical history:
   `POST /api/chats/:chatId/load`, last assistant message. Acceptable fallback
   is a title-only notification. Adding a global `completed` event to carry the
   text is explicitly forbidden.
5. Dedupe on `attention.id` (`<runId>:input:<elicitationId>`,
   `<runId>:completed`), not on chat id. Notify once per id.

Deriving completion from `active-run === null` is specifically wrong on two
paths: acknowledging a completed marker publishes the same event and would
re-notify, and a `needsInput` run that is cancelled or fails clears attention
with no run left, which would report a false completion.

Consequence: `desktop/src/main/daemon/events.ts` stops mirroring
`chat-stream` events and stops keeping its own `streams` map with per-stream
`notified` sets. Attention identity replaces that dedupe.

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

**Worktree chats need a create-side path, and it lands in Stage 2 before any
legacy call site is deleted.** Today `createChatFromInput` rejects
`creationLocation: "worktree"` with `chat-worktree-creation-forbidden`
("Worktree chats must be created by sending a message"), so worktree creation is
only reachable through `POST /api/chat-streams`. Stage 2 cannot both delete the
desktop stream bypass and keep that path, so the ordering is fixed:

1. Lift the restriction: `createChatFromInput` resolves `creationLocation:
   "worktree"` through `cwdForNewChat`, which already creates the project
   worktree and still fails with `project-required-for-worktree` when
   `projectId` is missing.
2. Only then delete the desktop send-route call sites.

Worktree chats stay non-prewarmable (`prewarmChat` rejects them), so a worktree
create simply skips the prewarm claim.

**Settled in Stage 2: there is no new worktree leak.** The renderer calls
`POST /api/chats` from the send handler, not from opening a draft tab, so a
worktree is still materialized by the user's first message and an abandoned
draft creates nothing. The only new window is a create that succeeds while the
run start fails, which leaves the same orphan chat + worktree the old flow left
when a stream failed after `prepareChatForSend`. Existing archived-chat worktree
cleanup covers both.

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
of the debt. Stage 3 deleted `ChatStreamApi`, `ChatStreamController`, and the
`/api/chat-streams` routes, not the event type.

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
- `chatPrewarmMatches` is now a module-level export taking a
  `ChatPrewarmClaimInput` (`creationLocation`, `cwd`, `projectId`, `runtime`),
  so create and the legacy send path share one matching rule and it is testable
  without booting a session.
- `daemon-client` needs no change: `chats.create` forwards the whole input.

Tests:

- `packages/daemon-api/src/chat/__tests__/create-input.test.ts` — schema accepts
  `prewarmId`, rejects an empty one, plus a type-level assertion that fails to
  compile if `ChatRunStartInput` ever grows `prewarmId`.
- `packages/daemon/src/features/chat/engine-runtime.test.ts` — the claim rule:
  matching runtime/location claims, a missing `creationLocation` reads as
  `project` on both sides, and an explicit `cwd`, a different runtime, a
  worktree claim, or a project/standalone cwd mismatch all refuse the prewarm
  (cold create instead of a wrong session).
- `packages/daemon/src/api.test.ts` — `POST /api/chats` forwards `prewarmId`.

Not covered by a test: the session adoption itself
(`chatSessions.set` + `persistRemoteThreadId`) needs a live NAPI session, so it
stays manual until there is a fake `DesktopChatSession`.

## Stage 2 Implementation Checklist

1. **Unblock worktree create first.** Lift
   `chat-worktree-creation-forbidden` from `createChatFromInput` and resolve
   `creationLocation: "worktree"` through `cwdForNewChat`, settling the
   abandoned-draft worktree question above. Nothing else in this list may land
   before it, or worktree chats lose their only creation path.
2. **Create then run.** In `chat-run-store.ts` / `chat-run-stream.ts`, when
   `input.chatId` is absent, call `daemon.chats.create({ projectId, runtime,
   creationLocation, prewarmId, model, mode, permissionMode, reasoningEffort })`
   first, then start the run against the returned id.
3. **Drop the draft indirection.** Remove `draftRedirects`,
   `moveActiveRunToChat`, and the stream-driven `onChatCreated`, and key slots
   by real chat id from the start. Update
   `state/__tests__/chat-run-machine.test.ts` accordingly.
4. **Replace the transport.** Delete `chat-stream.ts` and
   `desktop-agent-adapter.ts`; drive runs through `daemon.chatRuns.start` /
   `observe` / `stop` / `resolveElicitation`. Test doubles that currently mock
   `streamChatEvents` (`state/__tests__/plan-normalization.test.ts`,
   `state/__tests__/assistant-materialization.test.ts`) move to mocking the
   daemon client's run methods.
5. **Detach, don't cancel.** Observer teardown on chat switch / unmount /
   window close aborts the observer only. Stop is the single caller of
   `daemon.chatRuns.stop`.
6. **Reconnect on mount.** On chat open and on renderer reload, call
   `daemon.chatRuns.active(chatId)`; if a run is returned, apply its snapshot
   and attach `observe(runId)`.
7. **Rewrite main notifications.** `desktop/src/main/daemon/events.ts` handles
   only `chat-attention-changed`, following the five-step sequence in decision 1:
   `attention.list` for status, `active-run` for needsInput, chat load for
   completed, absent row clears silently, dedupe by `attention.id`. Delete the
   `chat-stream` handler, the `streams` map, and `notifyTool`'s stream-derived
   dedupe.

## Landed in Stage 2

The checklist above is implemented. Two things the Stage 1 contract did not
anticipate had to change with it:

- **`cwd` joins `ChatCreateInput`.** Power-worktree drafts pin an existing
  worktree cwd, and the old send route honored it through `cwdForNewChat`.
  Without `cwd` on create, those chats would have been silently created at the
  project root. `createChatFromInput` now resolves placement through the same
  `cwdForNewChat`, so explicit cwd, worktree creation, and project/standalone
  fallback behave identically on both routes. `chatPrewarmMatches` already
  refuses a prewarm for an explicit cwd or a worktree, so create still falls
  back to a cold session there.
- **A tool action awaiting a decision is pending input.** Permission prompts
  reach clients as `{ type: "tool", phase: "awaitingDecision" }`, never as an
  `elicitation` event — `projectTurnRunEvent` only emits `elicitation` for
  display elicitations and question elicitations. The old desktop main process
  synthesized its own elicitation from those tool events, so moving
  notifications onto attention would have dropped every permission
  notification. `ChatRunRegistry.materialize` now raises `needsInput` with a
  synthesized `pendingElicitation` for them, and `ChatAttentionStore.apply`
  records and clears the matching attention. Mobile gains the same pending
  input from its snapshot.

## Acceptance for Stage 2

- Killing and reopening a chat tab mid-run shows the run still streaming.
- Renderer reload mid-run reattaches with correct in-flight assistant text.
- Stop is the only action that ends a run.
- A permission prompt raised while the window is in the background produces
  exactly one OS notification, sourced from `active-run`.
- Creating a worktree chat works through `POST /api/chats` with no send-route
  fallback left in `desktop/src`.
- Acknowledging a completed notification does not produce a second one, and a
  cancelled `needsInput` run produces no completion notification.
- No file under `desktop/src` imports SSE decoding of its own.

## Landed in Stage 3

Stage 2 left the streams implementation in place as a rollback point. Stage 3
deleted it, so chat runs are now the only chat transport:

- Daemon: the `POST /api/chat-streams`, `DELETE /api/chat-streams/:id`, and
  `POST /api/chat-streams/:id/elicitation` routes, the `ActiveStream` type, the
  per-stream `streams` map, and `DaemonError.chatStreamNotWaiting()`.
- Contract: `ChatStreamApi`, `ChatStreamController`, the
  `DaemonChatStreamEvent` global event and its `chat-stream` guard branch, and
  the `chat-stream-not-waiting` error code.
- Client: `daemon.chatStreams.*` and the `streamChat` SSE reader.

Kept deliberately: `ChatStreamEvent` (shared `ChatRunObserverEvent` payload),
the engine-side `ChatRuntime.streamChat` primitive that `ChatRunRegistry`
executes, `ChatStreamElicitationResolveInput` (used by
`POST /api/chat-runs/:runId/elicitation`), and the `js-client` / `pi-client`
adapter surfaces, which never spoke the daemon HTTP protocol.

### Acceptance for Stage 3

- No `chat-streams` route, `chatStreams` client method, `ActiveStream`,
  `ChatStreamApi`, `chatStreamNotWaiting`, or `chat-stream` global event
  remains under `packages`, `desktop`, or `mobile`.
- Typecheck, lint, and the daemon / daemon-api / daemon-client / desktop /
  mobile test suites pass.
- `bun run knip` reports no dead export left behind by the deletion.

## Out of Scope

- Fleet, multiple simultaneous active runs per chat, and cross-device handoff
- Native/remote push delivery
- Surviving a daemon process restart
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
