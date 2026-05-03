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
cargo test --workspace --no-run
```
