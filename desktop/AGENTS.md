# Desktop Contributor Notes

Scope: `desktop/`. Follow root `AGENTS.md` for engine and cross-layer invariants.

## Overview

Electron app with explicit main/preload/renderer/shared boundaries, consuming normalized state from `@angel-engine/client-napi`.

## Where To Look

| Task                      | Location       | Notes                                       |
| ------------------------- | -------------- | ------------------------------------------- |
| IPC/session orchestration | `src/main`     | Main process owns lifecycle and persistence |
| Preload bridge            | `src/preload`  | Keep bridge minimal and typed               |
| UI + renderer runtime     | `src/renderer` | UI state only; avoid protocol inference     |
| Shared desktop types      | `src/shared`   | Main/renderer contract surface              |

## Conventions

- If Drizzle schema changes, generate and commit migrations.
- All select controls must use `@/components/ui/native-select` primitives (`NativeSelect`, `NativeSelectOption`, `NativeSelectOptGroup`).
- Keep main/preload/renderer separation; do not bypass restricted import boundaries.
- Use `@sindresorhus/is` for desktop TypeScript value checks when it makes the
  condition clearer. Prefer helpers such as `is.nonEmptyString`, `is.string`,
  `is.plainObject`, `is.boolean`, and `is.falsy` over handwritten nullish or
  truthy checks when the semantics match. ReactNode visibility checks may use
  `is.falsy`; desktop UI does not treat numeric `0` as meaningful rendered
  content.
- Use workspace `bun` commands for desktop tasks.
- Use agent-browser for UI/browser validation when requested.

## Anti-Patterns

- Importing `@/components/ui/select` or Radix `Select` into desktop code.
- Storing restored chat messages in desktop DB (metadata only).
- Re-implementing provider/model/mode semantics in renderer when snapshot already carries them.
