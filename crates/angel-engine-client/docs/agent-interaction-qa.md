# Agent Interaction QA Runbook

This runbook is for an agent that needs to exercise one real runtime through
`crates/angel-engine-client/examples/angel_cli.rs`.

The user must provide one agent name first. Use the exact runtime argument
accepted by the example today:

- `kimi`
- `codex`
- `opencode`
- `qoder`
- `copilot`
- `gemini`
- `cursor`
- `cline`

Do not accept aliases. If the user says "Claude", "Code", "OpenAI", or a binary
name that is not in this list, ask for the exact agent name before running the
flow.

## What To Exhaust

An Angel Engine agent interaction is not only "send a prompt and read a reply".
For manual QA, enumerate the following surfaces and mark each one as covered,
not supported by this runtime, or not exposed by the current CLI:

- Process: spawn, initialize, optional authentication, runtime ready/faulted,
  stdout/stderr handling, and clean exit.
- Conversation: create the initial conversation with cwd, reach idle, expose the
  selected conversation, and receive available command updates.
- Settings: read and change model, mode, and reasoning effort; try invalid or
  unsupported values and verify state did not silently drift.
- Turn lifecycle: start a turn, stream assistant output, stream reasoning or
  plan output when available, observe terminal success and terminal failure.
- User input: send a meaningful text prompt; for API-only coverage, know that
  structured file/resource/image input is not currently reachable from this CLI.
- Actions and tools: observe tool start/update/output/error states, including
  long-running tools and failed tools.
- Elicitations: answer host permission prompts, answer host user-input forms,
  deny/cancel at least once, and allow at least once.
- Plan mode: enter plan mode, run a planning turn, answer any plan-path
  question, observe plan deltas or structured plan updates, exit plan mode, then
  confirm the next normal turn is not still treated as a plan.
- Turn control: steer and cancel an active turn. The current `angel_cli.rs` REPL
  blocks while a turn is active, so this is an explicit CLI gap unless the CLI is
  extended.
- Lifecycle and history: fork, close, unsubscribe, archive, unarchive, compact,
  rollback, discover, and resume. The current CLI only exposes what the runtime
  advertises as user commands plus Codex `/shell`; the rest are API-level
  `ThreadEvent` surfaces and should be marked as CLI gaps if not reachable.

Exhaustive means the report accounts for every surface above. It does not mean
pretending the CLI can exercise controls it does not expose.

## Prepare

Work from the repository root.

1. Ask the user for `AGENT_NAME`.
2. The executing AI owns the terminal session. It should run commands itself,
   type into the CLI itself, answer permission/form prompts itself, and keep
   notes from the observed terminal output. Do not ask the user to paste
   commands after the user has provided `AGENT_NAME`.
3. Open and inspect the CLI before running it:

   ```sh
   sed -n '1,260p' crates/angel-engine-client/examples/angel_cli.rs
   sed -n '260,620p' crates/angel-engine-client/examples/angel_cli.rs
   ```

4. Confirm the interactive commands you can use:

   - `/commands`
   - `/model [value]`
   - `/mode [value]`
   - `/effort [value]` or `/reasoning [value]`
   - `/shell <command>` for `codex` only
   - `:quit`

5. Start the CLI in an interactive terminal:

   ```sh
   cargo run -p angel-engine-client --example angel_cli -- <AGENT_NAME>
   ```

6. Wait for the banner and command summary. If authentication is required, let
   the client complete auto-authentication when supported. If the runtime faults
   or the binary is missing, stop and report the exact process/error output.

Use a disposable workspace or only safe paths such as `/tmp`. Do not create,
edit, or delete repository files unless the user explicitly asked for a write
test in the repository.

## Autonomous Terminal QA

This section defines the behavior to exercise, not exact text to paste. The AI
running this QA should choose its own prompts based on what the runtime exposes
in the terminal. The session should be complex, multi-step, and meaningful: the
agent should inspect real files in this repository, trigger safe tool use,
handle elicitation prompts, test settings, test plan mode, and record boundaries
instead of following a fixed transcript.

Keep the CLI open for one coherent session. After each interaction, note what
the terminal showed: outgoing command behavior, streamed output, tool/action
events, permission or form decisions, terminal turn status, and whether the
conversation returned to idle.

### Required Exploration

The executing AI must cover these paths when the runtime and CLI make them
reachable:

- Capability discovery: run the CLI's built-in discovery commands, inspect
  available runtime commands, and read current model/mode/reasoning state.
- Settings behavior: change at least one supported setting; try one invalid or
  unsupported value; verify the terminal shows either a warning/no-op or a
  successful state transition.
- Normal read-only turn: ask the runtime to inspect `angel_cli.rs`, `README.md`,
  and one relevant client source file. The prompt should require real tool use
  or repository reasoning and should forbid file edits.
- Tool failure boundary: ask for one safe operation that should fail, such as
  reading a clearly nonexistent `/tmp` path. Confirm failure is surfaced and the
  turn terminates instead of hanging or retrying indefinitely.
- Permission denial: ask for a safe temporary-file write under `/tmp`, then deny
  or cancel the first permission prompt if one appears. Confirm the runtime does
  not bypass the denial.
- Permission approval: repeat a safe temporary-file operation and approve it if
  prompted. Verify tool output and cleanup.
- Host user-input elicitation: prompt the runtime to ask the host for a concrete
  choice before continuing. If the CLI opens a form/question prompt, answer it
  through the terminal. If the runtime only asks in chat text, record that host
  user-input elicitation was not surfaced.
- Plan mode: enter plan mode through `/mode plan` or the runtime's advertised
  command, create a nontrivial plan about a real Angel Engine regression test,
  answer any plan-path question, observe plan/reasoning/structured plan output,
  exit plan mode, and run one normal follow-up turn to confirm the plan mode did
  not leak.
- Direct shell: for `codex`, run at least one safe `/shell` command and verify
  command output. For non-Codex runtimes, try `/shell` once and confirm the CLI
  warns without starting a runtime turn.
- Runtime slash command boundaries: run one safe advertised runtime command, if
  any exists, and one unknown slash-like input. Record whether it is interpreted
  locally, sent to the runtime, rejected, or treated as ordinary user text.

The AI should adapt exact prompts to the chosen runtime. For example, if the
runtime cannot set models, it should test mode/reasoning more deeply. If the
runtime does not surface permissions in this host policy, it should record that
and still verify safe tool execution and cleanup.

### Known CLI Gaps To Record

The current `angel_cli.rs` does not expose every `ThreadEvent`. Unless you added
temporary CLI commands for this QA run, mark these as not covered by CLI:

- Active-turn `steer`.
- Active-turn `cancel`.
- `fork`.
- `close`.
- `unsubscribe`.
- `archive` and `unarchive`.
- `rollback_history`.
- Direct `compact_history`, except when a runtime command such as `/compact`
  reaches the same provider operation.
- `discover_threads`.
- `resume_thread`.
- Structured non-text inputs: resource links, file mentions, embedded text or
  blob resources, images, and raw content blocks.
- Double-submit elicitation rejection.
- Malformed provider wire updates such as missing ACP mode/tool ids.

Cover these through unit/integration tests or by extending `angel_cli.rs`.
Do not claim the manual CLI run covered them.

## Report Template

Use this structure when reporting the run:

```text
Agent name:
Command:
Environment:

Passed:
- ...

Unsupported by runtime:
- ...

Not exposed by angel_cli.rs:
- ...

Failures or suspicious behavior:
- ...

Files created or changed:
- ...

Follow-up test/code changes recommended:
- ...
```

The report should include exact prompts or commands for any failure. For
permission and plan-mode checks, include the decision you selected and whether
the runtime reached a terminal turn afterwards.
