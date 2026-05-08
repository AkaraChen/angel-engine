# Desktop Architecture

The desktop app is split by runtime boundary first, then by feature. Keep
provider-specific behavior out of this package; desktop only consumes normalized
engine/client snapshots and events.

## Renderer Layout

- `src/app/` owns app composition: routing, providers, query client setup, and
  workspace shell layout.
- `src/features/<feature>/` owns feature code. Common folders are `api/`,
  `components/`, `runtime/`, and `state/`.
- `src/components/` owns shared UI primitives that do not know about one feature's
  workflow.
- `src/platform/` owns renderer adapters for Electron, IPC, theme, browser
  environment, and platform utilities.
- `src/shared/` owns TypeScript contracts shared by main and renderer. It must
  not import React, Electron, TanStack Query, or feature modules.

Renderer feature code should call typed APIs from `src/platform/api-client.ts`
or feature `api/` modules. Raw IPC imports belong in `src/platform/`.

## Main Layout

- `src/main/ipc/` owns IPC composition and generic IPC validation helpers.
- `src/main/features/<feature>/` owns Electron main-process feature services:
  repositories, runtime services, feature IPC procedures, and feature input
  schemas.
- `src/main/db/` owns SQLite infrastructure and schema setup.

`src/main/ipc/app-router.ts` should compose feature routers only. Add new IPC
procedures in the owning feature, and keep request normalization in that
feature's schema file.

## Dependency Rules

- `app` may import features, shared UI, platform adapters, and shared contracts.
- `features` may import their own internals, shared UI, platform adapters, and
  shared contracts. Cross-feature imports should stay limited to explicit leaf UI
  or API surfaces.
- `platform` may import Electron/IPC/browser adapters and shared contracts, but
  should not import feature internals.
- `shared` must stay platform-neutral.
- `main/features` may import `main/db`, `main/ipc` helpers, and shared
  contracts. They must not import renderer modules.

## Runtime Settings

Model lists, reasoning levels, modes, and runtime settings come from
engine/client snapshots. Renderer state may hold draft selections, but requests
must strip UI-only sentinels and send `undefined` for no override.

## Verification

For desktop-only frontend architecture changes, run:

```sh
yarn --cwd desktop typecheck
yarn --cwd desktop format:check
git diff --check
```

If Rust engine/client, NAPI, or shared snapshot/settings types change, rebuild
NAPI before checking desktop:

```sh
npm --prefix crates/angel-engine-client-napi run build
```
