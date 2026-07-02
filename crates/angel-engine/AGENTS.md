# `angel-engine` Crate Notes

Scope: `crates/angel-engine/` only. Global rules remain in root `AGENTS.md`.

## Overview

`angel-engine` is the protocol-neutral state machine. It owns commands, events, reducers, and state transitions independent of provider wire formats.

## Where To Look

| Task                       | Location                         | Notes                                  |
| -------------------------- | -------------------------------- | -------------------------------------- |
| State and invariants       | `src/state`                      | Canonical state model                  |
| Event application logic    | `src/reducer`                    | Keep phases explicit and deterministic |
| Engine command/event types | `src/lib.rs` and related modules | Shared neutral contracts               |
| Regression coverage        | `src/reducer/tests`              | Add focused tests for behavior changes |

## Conventions

- Consume normalized `EngineEvent`/`EngineCommand` only.
- Keep reducer updates deterministic and side-effect free.
- Model missing/invalid boundary data as adapter errors, not engine fallbacks.
- Preserve clear reducer phase boundaries (`planning`, event handling, effects).

## Anti-Patterns

- Inspecting provider names or raw JSON payload fields in engine logic.
- Adding protocol-specific aliases or casing fallbacks here.
- Hiding invalid upstream data with empty defaults.

## Commands

```sh
cargo test -p angel-engine
cargo test -p angel-provider --test process_smoke -- --ignored
```

The process smoke test lives in `angel-provider` because it exercises provider
adapters against external CLIs.
