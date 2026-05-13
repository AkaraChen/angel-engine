# Agent Interaction Manual QA

This document tells an AI agent how to manually QA one runtime through
`crates/angel-engine-client/examples/angel_cli.rs`.

The test must be manual, terminal-driven, and one agent at a time. Do not batch
multiple agents. Do not pipe a prewritten transcript into the CLI. Do not run a
loop over runtimes. The point of this QA is to observe the real interactive
behavior and decide the next step from the previous terminal output.

## Hard Rules

- Test exactly one `AGENT_NAME` per run.
- Open a real interactive terminal for that one agent.
- Start the CLI once for that agent and interact with it directly.
- Type one command or prompt, wait for the CLI/runtime to finish responding,
  inspect the output, write a note, then choose the next command.
- Finish the report section for the current agent before starting another
  agent.
- If the user asks for all agents, repeat this same manual process separately
  for each supported agent. Never automate the repetition.
- Do not use shell loops, `xargs`, `parallel`, `printf ... | cargo run`,
  heredocs, expect scripts, replay files, or any other batch input.
- Do not keep several runtime CLIs open at once.
- Do not treat a startup smoke test as complete QA. A good run must include
  settings, normal turns, tool behavior, boundaries, permissions when surfaced,
  and plan mode when supported.

Supported `AGENT_NAME` values are the exact arguments accepted by
`angel_cli.rs`:

- `kimi`
- `codex`
- `opencode`
- `qoder`
- `copilot`
- `gemini`
- `cursor`
- `cline`

Do not accept aliases. If the user gives a product name, binary path, or vague
label that is not one of these exact values, ask for the exact `AGENT_NAME`.

## Preparation

Work from the repository root.

First inspect the CLI source so the QA is based on the actual interface:

```sh
sed -n '1,260p' crates/angel-engine-client/examples/angel_cli.rs
sed -n '260,620p' crates/angel-engine-client/examples/angel_cli.rs
```

Confirm these CLI controls from the source:

- `/commands`
- `/model [value]`
- `/mode [value]`
- `/effort [value]` or `/reasoning [value]`
- `/shell <command>` for `codex` only
- `:quit`

Then open a terminal and start the one selected agent:

```sh
cargo run -p angel-engine-client --example angel_cli -- <AGENT_NAME>
```

Wait for the banner, runtime-ready output, conversation-ready output, and command
summary. If the binary is missing, authentication fails, or the runtime faults,
stop that agent run and report the exact terminal output.

Use safe paths such as `/tmp` for write tests. Do not create, edit, or delete
repository files unless the user explicitly asks for repository writes.

## Manual Test Method

Use this rhythm for every action:

1. Decide the next single command or prompt.
2. Type it into the open CLI terminal.
3. Wait until the CLI prompt returns or the turn clearly reaches a terminal
   state.
4. Inspect the output for events, warnings, tool calls, permission prompts,
   streamed text, and state transitions.
5. Write a short note before continuing.

The agent may choose exact prompts based on the runtime. Prompts should be
meaningful and should require the runtime to inspect or reason about real files,
not only echo a token.

## Required Coverage

Cover each item when the runtime and current CLI expose it. If a path is not
available, mark it as "unsupported by runtime" or "not exposed by `angel_cli.rs`"
instead of pretending it passed.

### 1. Startup And Capability Discovery

Run `/commands`, `/model`, `/effort`, and `/mode` one at a time.

Verify:

- Runtime initializes and starts one conversation.
- The CLI reaches its prompt.
- Available commands print without crashing.
- Current model/mode/reasoning state is visible, or the CLI clearly reports that
  a setting is unavailable.
- Non-Codex agents reject `/shell` with the expected warning and no new turn.

### 2. Settings

Change at least one supported setting, then read it back. Also try one invalid
or unsupported value.

Verify:

- Successful setting changes produce the expected send/state output.
- Invalid or unsupported values warn or no-op without silent state drift.
- If a runtime has no setting support for model, mode, or effort, record that
  specific surface as unsupported.

### 3. Normal Read-Only Turn

Ask a real, read-only question about this repository. The prompt should require
inspection of files such as:

- `crates/angel-engine-client/examples/angel_cli.rs`
- `crates/angel-engine-client/README.md`
- one relevant client source file under `crates/angel-engine-client/src/`

Verify:

- A turn starts.
- Assistant text streams or prints.
- Tool/action output appears if the runtime uses tools.
- The turn reaches a terminal state and the CLI prompt returns.
- No repository files are modified.

### 4. Tool Failure Boundary

Ask for one safe operation that should fail, such as reading a clearly
nonexistent file under `/tmp`.

Verify:

- The failure is surfaced in tool output or assistant output.
- The agent does not retry forever.
- The turn terminates cleanly.

### 5. Permission Flow

Ask for a safe temporary-file operation under `/tmp`.

First, deny or cancel the first permission prompt if the runtime surfaces one.
Then run another safe temporary-file operation and allow it if prompted.

Verify:

- Permission prompts are displayed through the CLI when the runtime uses host
  permission.
- Deny/cancel is sent back and the runtime does not bypass the decision.
- Allow lets the operation proceed.
- Created temporary files are verified and cleaned up, or leftovers are reported.
- If no permission prompt appears, record the observed runtime policy.

### 6. Host User-Input Elicitation

Ask the runtime to request a concrete host choice before it continues.

Verify:

- If the CLI opens a form/question prompt, answer through the terminal and
  confirm the response is used.
- If the runtime only asks in normal chat text, record that host user-input
  elicitation was not surfaced for this run.

### 7. Plan Mode

Enter plan mode using the available control for that runtime. Prefer `/mode plan`
when supported. If the runtime advertises a native command such as `/plan on`,
use that when `/mode plan` is unavailable.

Run a meaningful planning turn about a real Angel Engine regression test. Exit
plan mode afterward with `/mode default`, `/mode build`, `/mode act`, or the
runtime's advertised exit command, depending on what `/mode` and `/commands`
show.

Verify:

- Plan mode state changes or the runtime clearly confirms plan mode.
- Plan text, reasoning, or structured plan output appears.
- Any plan-path question is answered through the terminal.
- After exiting, a normal follow-up turn does not create a new plan and does not
  keep the old plan as the active turn plan.

### 8. Direct Shell

For `codex`, run one safe `/shell` command by typing it into the CLI.

Verify:

- The shell command is sent through the Codex shell surface.
- Output appears in the terminal.
- The conversation returns to idle.

For every non-Codex agent, try `/shell` once and verify the CLI warning appears
without starting a runtime turn.

### 9. Runtime Slash Commands

Use `/commands` to choose one safe advertised runtime command and run it. Also
try one unknown slash-like input.

Verify:

- Advertised commands are handled sensibly.
- Unknown slash-like input is either warned, sent to the runtime, rejected, or
  treated as ordinary user text. Record which behavior happened.
- The thread state is not corrupted.

## Known `angel_cli.rs` Gaps

The current CLI does not expose every `ThreadEvent`. Mark these as not covered
by manual CLI QA unless the CLI is extended before the run:

- Active-turn `steer`.
- Active-turn `cancel`.
- `fork`.
- `close`.
- `unsubscribe`.
- `archive` and `unarchive`.
- `rollback_history`.
- Direct `compact_history`, except when an advertised runtime command such as
  `/compact` reaches the same provider operation.
- `discover_threads`.
- `resume_thread`.
- Structured non-text inputs: resource links, file mentions, embedded text
  resources, blob resources, image input, and raw content blocks.
- Double-submit elicitation rejection.
- Malformed provider wire updates such as missing ACP mode/tool ids.

Cover those with unit/integration tests or a purpose-built CLI extension. Do not
claim this manual CLI run covered them.

## Report Format

Write one report section per agent. Do not combine agents into a single vague
summary.

```text
Agent name:
CLI command:
Date/time:
Repository path:

Terminal session notes:
- ...

Passed:
- ...

Unsupported by runtime:
- ...

Not exposed by angel_cli.rs:
- ...

Failures or suspicious behavior:
- ...

Temporary files created:
- ...

Repository file changes:
- ...

Follow-up test/code changes recommended:
- ...
```

For every failure or suspicious behavior, include the exact command/prompt that
triggered it and the relevant terminal output. For permission and plan-mode
checks, include the choice selected in the terminal and whether the CLI returned
to a usable prompt afterward.
