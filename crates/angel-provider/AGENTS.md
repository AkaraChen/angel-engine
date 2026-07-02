# `angel-provider` Crate Notes

Scope: `crates/angel-provider/` only. Follow root `AGENTS.md` for cross-repo boundaries.

## Overview

`angel-provider` adapts provider wire protocols into engine-neutral commands/events and encodes protocol effects back out.

## Structure

- `src/codex/` Codex wire decode/encode + hydrate normalization
- `src/acp/` ACP wire decode/encode + session/update mapping
- `src/kimi/` Kimi ACP-variant normalization and local hydrate projection
- `src/gemini/` Gemini ACP-variant normalization
- `src/copilot.rs` Copilot ACP-variant normalization
- `src/qoder.rs` Qoder ACP-variant normalization
- `src/cline.rs` Cline ACP-variant normalization
- `src/cursor.rs` Cursor ACP-variant normalization behind the `cursor-history`
  feature
- `tests/` adversarial and plan-mode contract tests

## Where To Look

| Task                       | Location                                | Notes                               |
| -------------------------- | --------------------------------------- | ----------------------------------- |
| Codex payload handling     | `src/codex`                             | Normalize quirks before engine      |
| ACP payload handling       | `src/acp`                               | Keep method mapping explicit        |
| ACP-variant wrapper quirks | `src/kimi`, `src/gemini`, wrapper files | Keep runtime-specific behavior here |
| Adapter interface behavior | crate root + adapter modules            | Preserve protocol-neutral outputs   |
| Boundary regressions       | `tests/adversarial_cases`               | Add for malformed edge cases        |

## Conventions

- Decode/validate at boundaries; emit typed engine events.
- Keep protocol method/value matching exact and explicit.
- Normalize replay/hydrate quirks here, never in engine/client/desktop.
- Reject malformed input early instead of inventing ids or synthetic defaults.

## Anti-Patterns

- Fixing provider quirks in downstream crates.
- String guessing (`contains`, case folding, prefixes) for protocol identifiers.
- Blending ACP/Codex semantics in shared neutral models.

## Commands

```sh
cargo test -p angel-provider
```
