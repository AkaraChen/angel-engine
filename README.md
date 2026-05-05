# Angel Engine

This repository is a Cargo workspace.

## Crates

- `crates/angel-engine/` contains the Angel Engine Rust library, examples,
  protocol mapping docs, and vendored ACP reference material.
- `crates/angel-engine-client/` contains the IDE-facing Rust client API.
- `crates/angel-engine-client-napi/` contains the Node.js N-API binding and a
  Node CLI demo.

## Development

Build and verify all workspace crates:

```sh
cargo test --workspace --all-targets
```

External agent process smoke tests require installed and authenticated `codex`
and `kimi` CLIs, so they are ignored by default. Run them explicitly with:

```sh
cargo test -p angel-engine --test process_smoke -- --ignored
```

Format Rust and desktop JS/TS:

```sh
cargo fmt --all
npm --prefix desktop run format
```

Enable the repository pre-commit hook:

```sh
git config core.hooksPath .githooks
```
