# `angel-engine-client-napi` Crate Notes

Scope: `crates/angel-engine-client-napi/` only.

## Overview

N-API bridge for exposing `angel-engine-client` primitives to TypeScript. Keep this layer thin and conversion-focused.

## Where To Look

| Task                       | Location                         | Notes                                    |
| -------------------------- | -------------------------------- | ---------------------------------------- |
| JS-callable API surface    | `src/lib.rs`                     | Keep signatures aligned with Rust client |
| Type exposure + marshaling | N-API bindings and TS generation | Preserve precise types                   |
| Build verification         | package scripts                  | Rebuild after Rust API changes           |

## Conventions

- Mirror Rust client semantics; avoid extra policy.
- Keep conversions explicit and deterministic.
- Use precise shapes; avoid broad opaque JSON except at boundary.
- Rebuild bindings when engine/client snapshot or setting types change.

## Anti-Patterns

- Adding provider-specific parsing or desktop UI policy here.
- Introducing compatibility aliases instead of renaming to canonical APIs.
- Keeping stale generated bindings after Rust changes.

## Commands

```sh
bun run napi:build
```
