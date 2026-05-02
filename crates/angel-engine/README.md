# Angel Engine

Angel Engine is a Rust library for driving agent runtimes through a unified
state machine. It normalizes ACP session/prompt semantics and Codex app-server
thread/turn semantics into protocol-independent engine commands, events, state,
and UI updates.

The crate is intentionally centered on state reduction rather than protocol enum
mirroring. Protocol-specific JSON-RPC transport, request encoding, response
decoding, and notification handling live in adapters; the core engine keeps the
conversation model stable for UI and product code.

## Architecture

The core flow is:

```text
UI command
  -> AngelEngine::plan_command()
  -> CommandPlan / ProtocolEffect
  -> adapter encode + transport send

protocol response/request/notification
  -> adapter decode
  -> EngineEvent
  -> AngelEngine::apply_event()
  -> AngelEngineState + UiEvent
```

Only `apply_event()` commits protocol facts into state. `plan_command()` can
record pending requests and produce protocol effects, but final business state
comes from responses, server notifications, or request failure.

## Crate Layout

- `src/` contains the protocol-independent engine, state, commands, events,
  reducer, ids, capabilities, errors, and transport traits.
- `src/adapters/acp/` maps Agent Client Protocol messages to and from engine
  effects and events.
- `src/adapters/codex/` maps Codex app-server messages to and from engine
  effects and events.
- `examples/` contains small stdio shell demos for Codex, OpenCode, and Kimi.
- `docs/` contains the state-machine design notes and protocol mapping
  rationale.
- `vendor/agent-client-protocol/` is the vendored ACP reference material.

## Quick Start

Build and verify the workspace from the repository root:

```sh
cargo test --workspace --no-run
```

Run the Codex shell demo if `codex app-server` is available locally:

```sh
cargo run -p angel-engine --example codex_shell
```

Run the ACP shell demos if the corresponding ACP server binaries are available:

```sh
cargo run -p angel-engine --example opencode_shell
cargo run -p angel-engine --example kimi_shell
```

Inside the demos, type a message to start a turn. Common commands include
`/model`, `/effort`, `/mode`, `/permission`, `/commands`, and `:quit`. The Codex
demo also supports `/shell <command>`.

## Core Concepts

- Runtime describes whether the agent service is connected, negotiated,
  authenticated, available, or faulted.
- Conversation is the protocol-neutral equivalent of an ACP session or Codex
  thread.
- Turn is one user-intent interaction, equivalent to an ACP prompt turn or Codex
  turn.
- Action captures observable work inside a turn, such as tool calls, command
  execution, file changes, MCP calls, and approval-gated work.
- Elicitation captures user or host input needed while a turn is running.
- Context stores model, reasoning, permission, sandbox, cwd, mode, config, and
  other settings that affect future protocol calls.

## Development Notes

Angel Engine expects protocol adapters to expose capabilities instead of relying
on protocol-name conditionals in the reducer. For example, Codex supports
steering an active turn, while standard ACP does not; that difference should be
represented in `ConversationCapabilities`.

Start with these design documents when changing behavior:

- `docs/agent-ui-state-machine.md`
- `docs/unified-agent-state-machine.md`
- `docs/angel-engine-state-machine-design.md`

Keep reducer changes driven by protocol-independent `EngineEvent` values, and
keep wire-format details in the ACP or Codex adapter modules.
