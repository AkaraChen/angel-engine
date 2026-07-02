# JS SDK Audience

Status: design spike recommendation
Date: 2026-07-02
Baseline checked at: `85da1d8`

## Summary

`@angel-engine/js-client` should be treated as an internal desktop/shared
library for now, not as a publishable external SDK. The package is still
private, there is no npm publish workflow, and the only code that exercises the
SDK-shaped client/store/mock layer is the local playground.

The follow-up should prune or move playground-only SDK scaffolding unless the
maintainer explicitly decides to fund an external SDK surface. Publishing is a
larger product commitment because the JS package depends on a native NAPI
package with eight prebuild targets.

## Drift Check

The plan was written against `a73ea77`; live code has changed since then in
`packages/js-client`. The relevant premise still holds:

- `packages/js-client/package.json` is still `"private": true`.
- `packages/claude-client/package.json` is still `"private": true`.
- No npm publish workflow exists under `.github/workflows`; the current files
  are `desktop-release.yml`, `js-ci.yml`, and `rust.yml`.
- The root package is consumed by desktop and Claude client for shared types and
  adapter interfaces, but `AngelClient`, `InMemoryAngelStore`,
  `createAgentRegistry`, `./assistant-ui`, and `./mock` have no non-playground
  consumer.

Correction from the original plan text: desktop now imports root
`@angel-engine/js-client` types, especially `AgentAdapter` and
`AgentRunContext`, in
`desktop/src/renderer/features/chat/api/desktop-agent-adapter.ts`. That means
the root export cannot be treated as playground-only. The SDK-shaped classes
inside the root export remain playground-only.

## Consumer Audit

| Export or subpath                                      | Product consumers                                                                                         | Playground-only consumers                                           | Audience classification                                             |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Root chat data types (`Chat*`, `ChatJson*`, etc.)      | `desktop/src/shared/chat/index.ts`; `packages/claude-client/src/*.ts` for JSON types                      | `packages/js-client/playground/src/main.tsx`                        | Product-consumed shared types                                       |
| Root adapter types (`AgentAdapter`, `AgentRunContext`) | `desktop/src/renderer/features/chat/api/desktop-agent-adapter.ts`                                         | None                                                                | Product-consumed interface types                                    |
| `AngelClient`                                          | None outside docs/playground                                                                              | `packages/js-client/playground/src/main.tsx`                        | Playground-only SDK class                                           |
| `InMemoryAngelStore`                                   | None outside docs                                                                                         | None in live code                                                   | Unused SDK scaffolding                                              |
| `createAgentRegistry`                                  | None outside docs                                                                                         | None in live code                                                   | Unused SDK scaffolding                                              |
| `./assistant-ui`                                       | None outside docs/tsconfig alias                                                                          | `packages/js-client/playground/vite.config.ts` alias only           | Playground-only or dead export                                      |
| `./mock`                                               | None outside docs/tsconfig alias                                                                          | `packages/js-client/playground/src/main.tsx`; playground Vite alias | Playground-only                                                     |
| `./projection`                                         | `desktop/src/main/features/chat/engine-runtime.ts`; `packages/claude-client/src/__tests__/events.test.ts` | playground Vite alias                                               | Product-consumed projection                                         |
| `./utils` grouped entry                                | No live product imports                                                                                   | None                                                                | Convenience export; keep only if internal API wants grouped imports |
| `./utils/attachments`                                  | `desktop/src/shared/chat/index.ts`                                                                        | README example only                                                 | Product-consumed utility                                            |
| `./utils/client-update`                                | `packages/claude-client/src/session.ts`                                                                   | None                                                                | Product-consumed utility                                            |
| `./utils/core`                                         | No live product imports                                                                                   | None                                                                | Unused utility subpath unless tests/docs rely on it                 |
| `./utils/elicitations`                                 | `desktop/src/shared/chat/index.ts`                                                                        | None                                                                | Product-consumed utility                                            |
| `./utils/errors`                                       | `packages/claude-client/src/session.ts`; `desktop/src/main/features/chat/engine-runtime.ts`               | None                                                                | Product-consumed utility                                            |
| `./utils/media`                                        | `desktop/src/shared/chat/index.ts`                                                                        | None                                                                | Product-consumed utility                                            |
| `./utils/messages`                                     | `desktop/src/shared/chat/index.ts`                                                                        | README example only                                                 | Product-consumed utility                                            |
| `./utils/plans`                                        | `desktop/src/shared/chat/index.ts`                                                                        | None                                                                | Product-consumed utility                                            |
| `./utils/tools`                                        | `desktop/src/shared/chat/index.ts`                                                                        | README example only                                                 | Product-consumed utility                                            |

Double-maintenance evidence:

- `packages/js-client/src/assistant-ui.ts` is 479 lines and exports
  assistant-ui conversion helpers.
- `desktop/src/renderer/features/chat/runtime/engine-model-adapter.ts` is 146
  lines and is the renderer's actual assistant-ui runtime adapter.
- Desktop does not import `@angel-engine/js-client/assistant-ui`, so the shared
  assistant-ui layer is not the product path today.

## Decision

### Option A: External SDK

Make `@angel-engine/js-client` and `@angel-engine/client-napi` real public npm
packages.

Consequences:

- Flip `"private": true` only after a publish pipeline exists.
- Treat every export and subpath as supported API.
- Publish NAPI prebuilds for all declared targets:
  `x86_64-apple-darwin`, `aarch64-apple-darwin`,
  `x86_64-unknown-linux-gnu`, `x86_64-unknown-linux-musl`,
  `aarch64-unknown-linux-gnu`, `aarch64-unknown-linux-musl`,
  `x86_64-pc-windows-msvc`, and `aarch64-pc-windows-msvc`.
- Add npm provenance, versioning policy, changelog/release workflow, and a
  quickstart that uses the playground as the proof the stack works outside
  Electron.
- Decide whether desktop will adopt `AngelClient` and the shared assistant-ui
  layer as the canonical runtime abstraction. Publishing without desktop using
  that layer leaves the duplication intact.

This path is product work, not a package metadata tweak.

### Option B: Internal Library

Keep `@angel-engine/js-client` private and shape it around desktop plus
Claude-client internal consumption.

Consequences:

- Keep product-consumed shared chat types, projection helpers, and precise
  utilities.
- Move `AngelClient`, `InMemoryAngelStore`, `createAgentRegistry`,
  `MockAgentAdapter`, and the assistant-ui conversion helpers under
  `packages/js-client/playground/`, or delete them if the playground no longer
  needs them.
- Shrink `package.json` exports to the desktop/Claude-consumed subpaths.
- Update `packages/AGENTS.md`, which currently says `packages/` hosts
  publishable TypeScript libraries used by external consumers.
- Treat the pruning as a breaking change to a private package surface; no
  external migration burden exists unless an undiscovered consumer appears.

Recommendation: choose Option B now.

## Follow-up Scope

### Publish Path

- Add a publish workflow for `@angel-engine/client-napi` that builds the eight
  declared NAPI targets.
- Add a publish workflow for `@angel-engine/js-client` with npm provenance.
- Define semver policy for `0.1.0` packages before removing `"private": true`.
- Add public README quickstarts for Electron-free usage, grounded in
  `packages/js-client/playground/src/main.tsx`.
- Decide whether desktop must converge on `AngelClient` and
  `@angel-engine/js-client/assistant-ui` before publication.

### Prune Path

- Move or delete `packages/js-client/src/client.ts`, `store.ts`, `mock.ts`, and
  `assistant-ui.ts` after confirming the playground still builds.
- Remove root re-exports of `AngelClient`, `InMemoryAngelStore`, and
  `createAgentRegistry` if they become playground-local.
- Remove `./assistant-ui` and `./mock` from `packages/js-client/package.json`
  exports if they are no longer product subpaths.
- Keep root type exports and the product-consumed utility/projection subpaths.
- Fix `packages/AGENTS.md` to describe internal shared TypeScript libraries,
  not publishable external packages.
- Re-run `pnpm --filter @angel-engine/js-client test`,
  `pnpm --filter @angel-engine/js-client build`, and
  `npm --prefix desktop run typecheck`.

## Open Questions

- Is there a real external audience for an npm-installable Angel Engine SDK, or
  is the current package only shared desktop infrastructure?
- If published, is the project willing to support the native NAPI prebuild
  matrix and npm provenance workflow on every release?
- Should desktop adopt `AngelClient` and `@angel-engine/js-client/assistant-ui`
  to eliminate duplicated assistant-ui adaptation, or should those stay
  playground-only and be pruned?
- Does the playground still matter as a maintained artifact, or should it be
  reduced to tests/fixtures once dead exports are removed?
- Are root `AgentAdapter`/`AgentRunContext` types part of the internal desktop
  contract, or should they move closer to the renderer bridge that actually
  consumes them?
