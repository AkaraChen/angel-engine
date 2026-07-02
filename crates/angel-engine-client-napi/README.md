# @angel-engine/client-napi

Node.js N-API binding for `angel-engine-client`.

## Build

```sh
bun install
bun run build:debug
```

The build uses `napi build --platform` and writes a local
`angel_engine_client.<platform>.node` artifact next to `index.js`.

## Runtime Examples

```sh
cargo run -p angel-provider --example codex_shell
cargo run -p angel-provider --example kimi_shell
cargo run -p angel-provider --example opencode_shell
```

The Rust provider examples spawn the selected runtime process, write protocol
messages, read runtime output, and return decoded updates.

`initialize`, `startThread`, and `nextUpdate` return update objects. Use
`update.streamDeltas` for incremental assistant, reasoning, plan, and action
output instead of parsing output logs or calling the lower-level `receiveJson`
path.

## Custom Protocol Adapter

`AngelEngineClient` accepts an optional synchronous adapter object. Extend the
native ACP adapter when you only need to customize part of ACP behavior:

```js
const { AngelEngineClient, AcpAdapter } = require("@angel-engine/client-napi");

class MyAcpAdapter extends AcpAdapter {
  encodeEffect(input) {
    const output = super.encodeEffect(input);
    output.logs = [...output.logs, { kind: "output", message: "hooked" }];
    return output;
  }
}

const client = new AngelEngineClient(options, new MyAcpAdapter());
```

Plain JS classes can also implement `protocolFlavor`, `capabilities`,
`encodeEffect`, and `decodeMessage` directly.
