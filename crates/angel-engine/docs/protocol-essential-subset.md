# Protocol Essential Subset

Angel Engine intentionally models an essential agent runtime subset instead of
mirroring every ACP or Codex app-server method. ACP is the baseline vocabulary;
Codex support is an adapter that maps compatible behavior into the same engine
commands, events, state, and capabilities.

## Selection Rule

A behavior belongs in the engine core only when it satisfies one of these
conditions:

- ACP stable protocol and Codex app-server both have a compatible user-facing
  semantic.
- ACP stable protocol has the semantic and Codex can represent it through an
  existing thread, turn, item, request, or notification path.
- The behavior is required to preserve an already-open shared abstraction, such
  as answering or cancelling an elicitation request.

Everything else stays adapter-local, unsupported, or marked as an explicit
extension capability. The engine must not expose generic raw protocol commands
as an escape hatch.

## Core Subset

| Engine concept | ACP baseline | Codex app-server mapping |
| --- | --- | --- |
| Runtime negotiation | `initialize` and optional `authenticate` | `initialize` and server readiness |
| Conversation | `session` | `thread` |
| Conversation create/list/resume | `session/new`, `session/list`, `session/load`, `session/resume` when advertised | `thread/start`, `thread/list`, `thread/resume` |
| Turn start | `session/prompt` | `turn/start` |
| Turn cancel | `session/cancel` notification | `turn/interrupt` request |
| Turn updates | `session/update` | turn/item notifications |
| Assistant output | content blocks and text deltas | assistant item text deltas |
| Reasoning and plan | ACP plan/reasoning updates when present | reasoning/plan items and deltas |
| Observable action | tool calls and permission-gated work | command/file/MCP/dynamic items |
| Elicitation | `session/request_permission`, `elicitation/create`, `elicitation/complete` | server requests and MCP/user input requests |
| Context | mode, model, and config options when advertised | model, effort, permission, sandbox, mode, and related context fields |

## Excluded From Core

These protocol areas are not part of the essential subset and should not be
added to `EngineCommand`, `EngineEvent`, or public state just because one
protocol mentions them:

- ACP filesystem host APIs.
- ACP terminal host APIs.
- ACP next-edit-suggestion APIs.
- Generic JSON-RPC passthrough or raw protocol command surfaces.
- Provider/account/login management methods that do not map to runtime auth.
- Protocol-specific schema generation, websocket serving, or transport proxy
  controls.
- Any draft or RFD feature unless an adapter advertises it as a named extension
  and the engine already has a protocol-neutral semantic for it.

## Adapter Contract

Adapters may know every wire detail required to interoperate with their server,
but they must translate those details into the subset above before they reach
the reducer.

- Encode uses `ProtocolEffect` plus engine state to produce protocol frames.
  `ProtocolEffect` is opaque outside the crate; UI/application code should pass
  it to an adapter rather than inspecting ACP or Codex method enums.
- Decode turns protocol responses, requests, and notifications into
  `EngineEvent` values.
- Capability differences are represented in `ConversationCapabilities`.
- Remote protocol identifiers are opaque in core state; ACP `sessionId`, Codex
  `threadId`, turn ids, item ids, and JSON-RPC request ids are interpreted only
  by their adapters.
- Unsupported protocol features should return capability errors or adapter logs,
  not new public raw commands.
- Extension support must be opt-in through `CapabilitySupport::Extension`.

This keeps Angel Engine useful across ACP, Codex app-server, Kimi ACP, and
OpenCode ACP without committing the core model to either protocol's full method
set.
