# Mobile Chat Run Continuity

Status: Phase 0 contract
Date: 2026-07-24
Baseline checked at: `6a4d076`

## Summary

Mobile chat runs must belong to the daemon, not to the lifetime of one route,
React hook, network request, or phone foreground session. Switching chats,
locking the phone, and temporary network loss detach an observer; they do not
cancel the provider run. Only an explicit Stop action cancels it.

Phase 0 freezes the wire contract and migration invariants. The daemon registry,
new routes, mobile store, recoverable elicitation, attention UI, and device
acceptance are separate follow-up tasks.

## Current Baseline

`POST /api/chat-streams?streamId=...` currently starts the provider run and
opens its only SSE observer in the same request. `stream.onAbort` aborts the
provider, while the mobile `useConversation` cleanup also sends
`DELETE /api/chat-streams/:id` when the selected chat changes or the hook
unmounts. Its pending elicitation is component-local and is cleared with the
stream.

That behavior is now characterized in
`mobile/src/features/chat/use-conversation.test.tsx`. It is a migration guard,
not the desired product behavior; the continuity task will deliberately invert
it after daemon-owned runs exist.

## Typed Contract

The public contract lives in `@angel-engine/daemon-api/chat`.

- `ChatRunStartInput` requires an existing `chatId` and only exposes per-turn
  text, attachments, model, mode, permission, and reasoning overrides. Phase 0
  does not combine chat creation or runtime selection with run creation.
- `ChatActiveRunSnapshot` materializes the initial user message and the current
  assistant message. This is enough to reconstruct an in-flight turn without an
  unbounded event journal.
- `status` is a discriminated union. `running` requires
  `pendingElicitation: null`; `needsInput` requires exactly one typed
  `ChatElicitation` in the canonical `open` phase.
- `lastEventSequence` starts at zero and increases for every published
  `ChatStreamEvent`.
- `ChatActiveRunResult` returns either one active run for a chat or `null`.
- `ChatRunObserverEvent` sends one `snapshot` first, then sequenced `event`
  envelopes containing the existing closed `ChatStreamEvent` union.

Runtime guards validate all three JSON response/stream shapes. IDs are non-empty,
event sequences are safe integers, timestamps are canonical UTC strings from
`Date.prototype.toISOString` with `updatedAt >= startedAt`, user/assistant roles
are fixed, and nested stream events retain their existing fail-fast validation.

## Route Shape

Follow-up implementation should converge on these semantics:

| Method | Route | Meaning |
| --- | --- | --- |
| `POST` | `/api/chat-runs/:runId` | Start one daemon-owned run from `ChatRunStartInput` and attach its first observer. |
| `GET` | `/api/chats/:chatId/active-run` | Return `ChatActiveRunResult` for bootstrap or reconnect. |
| `GET` | `/api/chat-runs/:runId/events` | Attach an observer and stream `ChatRunObserverEvent`. |
| `DELETE` | `/api/chat-runs/:runId` | Explicitly stop the run. This is the only observer-facing cancellation path. |
| `POST` | `/api/chat-runs/:runId/elicitation` | Resolve the snapshot's current pending elicitation. |

The old `/api/chat-streams` routes may remain during the migration, but new
mobile continuity code must use the run contract rather than infer lifecycle
from the legacy request.

## State and Ordering Invariants

1. There is at most one active run per chat and one registry entry per `runId`.
2. Provider execution owns its own abort controller. Observer disconnect only
   removes that observer.
3. Attaching an observer atomically registers it and captures its snapshot.
   The first emitted message is that snapshot; every later event has a sequence
   greater than `snapshot.lastEventSequence`. No event can fall into the gap
   between snapshot and subscription.
4. The registry updates the materialized snapshot before publishing the event
   that caused the update.
5. A pending elicitation and `needsInput` transition are committed atomically.
   Resolving the matching elicitation returns the run to `running`; stale or
   mismatched elicitation IDs fail.
6. On terminal success or failure, canonical runtime history is made observable
   before the registry entry disappears. A reconnect that receives `run: null`
   reloads canonical history.
7. `result` and `done` remain ordinary sequenced `ChatStreamEvent` payloads for
   attached observers. `completed` is not an active-run status; later attention
   work may record completion separately after the run leaves the registry.

## Ownership Boundaries

- The daemon owns execution, snapshot materialization, event ordering,
  elicitation resolution, and explicit cancellation.
- `daemon-api` owns the shared types and trust-boundary guards.
- `daemon-client` owns HTTP/SSE decoding and rejects malformed envelopes before
  they enter product state.
- Mobile owns observer attachment, transcript reconciliation, and presentation.
  Route/component cleanup may detach but must not call Stop.

## Out of Scope

- Paseo relay or any other relay service
- native or remote push notification delivery
- surviving a daemon process restart
- copying Paseo source or matching its layout
- multiple simultaneous active runs for one chat
- an unbounded event replay log

The Phase 0 sequence is: registry, attach/detach/Stop semantics, mobile
reattachment and reconciliation, recoverable elicitation, in-app attention, then
real-device and weak-network acceptance.
