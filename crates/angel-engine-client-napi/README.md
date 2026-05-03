# @angel-engine/client

Node.js N-API binding for `angel-engine-client`.

## Build

```sh
bun install
bun run build:debug
```

The build uses `napi build --platform` and writes a local
`angel_engine_client.<platform>.node` artifact next to `index.js`.

## CLI Demo

```sh
bun run demo:kimi
bun run demo:codex
bun run demo:opencode
```

The demo spawns the selected runtime process from Node.js and uses the native
binding as the protocol/state client.
