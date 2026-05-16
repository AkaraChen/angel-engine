# angel-engine-client

IDE-facing client API over `angel-engine`.

The public shape is intentionally object-oriented. Use `AngelClient` when Rust
should own the runtime process; use `Client` only when the host owns JSON-RPC IO.

```text
ClientOptionsBuilder -> AngelClient -> send_thread_event(ThreadEvent)
ClientOptionsBuilder -> ClientBuilder -> Client -> Thread -> send_event(ThreadEvent)
```

`angel-engine` remains the internal reducer/protocol implementation. IDE code
should not call the reducer directly.

## Core Client

Use `Client` when your IDE or future `napi` layer owns JSON-RPC transport IO:

```rust
use angel_engine_client::{
    ClientBuilder, ClientOptions, StartConversationRequest, ThreadEvent,
};

let options = ClientOptions::builder()
    .kimi("kimi")
    .arg("acp")
    .need_auth(true)
    .auto_authenticate(true)
    .client_name("my-ide")
    .client_title("My IDE")
    .build();

let mut client = ClientBuilder::new(options).build();

let init = client.initialize()?;
for message in init.update.outgoing {
    // Write message.line to the runtime.
}

// Feed runtime messages back in:
let update = client.receive_json_line(runtime_line)?;
for delta in update.stream_deltas() {
    // Render assistant/reasoning/plan/action output incrementally.
}

let start = client.start_thread(StartConversationRequest::new().cwd("/repo"))?;
let thread_id = start.conversation_id.unwrap();

let mut thread = client.thread(thread_id);
let result = thread.send_event(ThreadEvent::text("Explain this workspace"))?;
```

Thread and process clients share the same `ThreadEvent` dispatch path. A
conversation snapshot also exposes `conversation.reasoning`, which gives the
current reasoning effort, available efforts, source (`configOption`,
`codexDefaults`, `modelVariant`, or `unsupported`), and whether the runtime can
set it.

For opencode ACP:

```rust
let options = ClientOptions::builder()
    .acp("opencode")
    .arg("acp")
    .need_auth(false)
    .build();
```

## Thread API

The thread handle carries the conversation id, and event constructors keep call
sites small:

```rust
let mut thread = client.selected_thread().unwrap();

thread.send_event(ThreadEvent::text("Refactor this file"))?;
thread.send_event(ThreadEvent::set_model("kimi-k2"))?;
thread.send_event(ThreadEvent::cancel())?;
thread.send_event(ThreadEvent::approve_first())?;

let state = thread.require_state()?;
let open_questions = thread.open_elicitations();
let settings = thread.settings()?;
let models = thread.model_list()?;
```

`ThreadEvent` covers the thread-facing command surface:

- user input: `text`, `input`
- turn control: `steer`, `cancel`
- settings: `set_model`, `set_mode`, `set_reasoning_effort`
- elicitation: `resolve`, `resolve_first`, `approve_first`, `deny_first`, `answer_first`
- lifecycle/history: `fork`, `close`, `unsubscribe`, `archive`, `compact_history`, `rollback_history`
- shell: `shell`

For desktop-style settings surfaces, `Client`, `AngelClient`, and `Thread`
also expose direct primitives for `thread_settings`, `reasoning_level`,
`model_list`, `available_modes`, `set_model`, `set_mode`, and
`set_reasoning_level`.

## Process Client

Use `AngelClient` when Rust should spawn and own the runtime process:

```rust
use angel_engine_client::{AngelClient, ClientOptions, StartConversationRequest};

let mut client = AngelClient::spawn(
    ClientOptions::builder()
        .kimi("kimi")
        .arg("acp")
        .client_name("my-ide")
        .build(),
)?;

let start = client.initialize_and_start(
    StartConversationRequest::new().cwd(std::env::current_dir()?.display().to_string()),
)?;
let conversation_id = start.conversation_id.unwrap();
let turn = client.send_text(&conversation_id, "Explain this workspace")?;
```

The sibling `crates/angel-engine-client-napi` package wraps this process-owning
API for Node.js. Use its `AngelClient` class when JavaScript should receive
already-decoded `ClientUpdate` objects through `nextUpdate()`, including
`streamDeltas`. The lower-level `AngelEngineClient` class remains available for
hosts that intentionally own runtime process IO themselves.

```sh
cd crates/angel-engine-client-napi
bun install
bun run build:debug
bun run demo:codex
```
