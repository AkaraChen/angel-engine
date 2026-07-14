# Angel Engine

Angel Engine is a protocol-neutral engine for driving coding-agent runtimes such
as Codex, ACP-based agents, Claude, and related CLIs. The repository combines a
Rust core, provider adapters, Node bindings, JS client packages, and an Electron
desktop app.

## Repository Map

- `crates/angel-engine/` — protocol-neutral engine, state machine, reducers, and
  shared transport types.
- `crates/angel-provider/` — `ProtocolAdapter` plus adapters for codex, acp,
  cline, copilot, cursor behind the `cursor-history` feature, gemini, kimi, and
  qoder.
- `crates/angel-engine-client/` — Rust client API over the engine and provider
  adapters.
- `crates/angel-engine-client-napi/` — Node.js N-API binding for the Rust client.
- `crates/angel-profiler/` — runtime profiling CLI.
- `crates/test-cli/` — test support CLI.
- `desktop/` — Electron desktop application.
- `packages/js-client/` — TypeScript client/projection utilities.
- `packages/claude-client/` — Claude runtime client package.
- `apps/website/` — website package.

Vendored submodules live under `vendor/agent-client-protocol/`,
`vendor/openai-codex/`, and `vendor/claude-agent-sdk-typescript/`.

## Setup

```sh
git submodule update --init
bun install
```

Use Bun 1.3.x as the package manager and Node 24.x as the runtime; CI currently
pins Node 24.15.0 and Bun 1.3.14. `bun install` also installs the Husky
pre-commit hook through the root `prepare` script.

## Verification

```sh
cargo test --workspace --all-targets
bun run typecheck
bun run lint
```

External agent process smoke tests require installed and authenticated `codex`
and `kimi` CLIs, so they are ignored by default. Run them explicitly with:

```sh
cargo test -p angel-provider --test process_smoke -- --ignored
```

Format Rust and desktop JS/TS:

```sh
cargo fmt --all
bun run --filter desktop format
```
