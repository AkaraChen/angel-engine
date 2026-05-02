# Angel Engine Common Interface Audit

This audit records the current scope after narrowing Angel Engine from
"support every ACP and Codex method" to "support the essential common subset".
Protocol-specific behavior is allowed in adapters and explicit extensions, but
not in the common command, state, or effect surface.

## Success Criteria

| Requirement | Evidence |
| --- | --- |
| Common commands are protocol-neutral. | `EngineCommand` contains initialize/auth/discover/start/resume/turn/cancel/elicitation/context plus `Extension(EngineExtensionCommand)`. Single-sided commands such as fork, steer, rollback, archive, shell command, close, and unsubscribe live under `EngineExtensionCommand`. |
| Conversation discovery and resume use opaque identifiers. | `DiscoverConversationsParams` contains only `cwd` and `cursor`; `ResumeTarget` uses local `ConversationId` or opaque remote id plus `hydrate`. `RemoteConversationId`, `RemoteTurnId`, `RemoteActionId`, and `RemoteRequestId` no longer expose ACP/Codex-specific variants. |
| Protocol effects are not public protocol escape hatches. | `ProtocolEffect` is public only as an opaque value that applications pass to a `ProtocolTransport`; its method, payload, and builder internals are crate-private. |
| Context is common, not Codex-only. | Common context includes model, reasoning, mode, cwd, approval, sandbox, permissions, and raw metadata. Codex-only goal/memory/global config surfaces are excluded from public context capabilities. |
| Raw metadata cannot trigger protocol writes. | `ContextUpdate::Raw` remains metadata only; `acp.config.*` no longer maps to `session/set_config_option`. |
| Adapter mapping stays protocol-local. | ACP and Codex method enums are crate-private. ACP/Codex wire ids are interpreted in `crates/angel-engine/src/adapters`, not in public state variants. |
| Capability differences are explicit. | Unsupported or single-sided behavior is represented through `ConversationCapabilities` and `CapabilitySupport::Extension`, not by adding raw public commands. |
| Tests cover core behavior and adversarial cases. | `cargo test --workspace` covers reducer tests, adapter tests, plan mode cases, process smoke tests, and adversarial protocol cases. |
| Examples compile and run against real processes. | `cargo check -p angel-engine --examples` passes; `codex_shell`, `kimi_shell`, and `opencode_shell` have been smoke-tested with `/commands` then `:quit`. |
| File organization constraints hold. | No path-attribute module overrides are present; no Rust file under `crates/angel-engine` exceeds 500 lines. |

## Explicitly Excluded From Core

- Full ACP host APIs such as filesystem, terminal, and next-edit-suggestion.
- Full Codex app-server management APIs such as memory, goals, global config
  writes, background terminal cleanup, and arbitrary metadata mutation.
- Generic JSON-RPC passthrough or raw protocol command APIs.
- Protocol-specific start fields such as Codex `serviceName` and `ephemeral`.
- Draft or single-provider behavior unless it maps to an existing neutral
  semantic and is advertised through an extension capability.

## Verification Commands

```sh
cargo test --workspace
cargo check -p angel-engine --examples
rg -n '#\[path' crates/angel-engine/src crates/angel-engine/tests crates/angel-engine/examples -S
find crates/angel-engine -path '*/target' -prune -o -path '*/vendor/*' -prune -o -name '*.rs' -print0 \
  | xargs -0 wc -l \
  | awk '$2 != "total" && $1 > 500 {print}'
rg -n 'acp\.config|userMessageId|user_message_id|GoalState|MemoryMode|ContextUpdate::Goal|ContextUpdate::Memory|thread/goal|memoryMode|memory/reset|serviceName|ephemeral' \
  crates/angel-engine/src crates/angel-engine/docs crates/angel-engine/tests crates/angel-engine/examples \
  --glob '!crates/angel-engine/docs/common-interface-audit.md' -S
```

The last three checks are expected to produce no matches/output, except command
exit status may be non-zero for `rg` when no matches are found.
