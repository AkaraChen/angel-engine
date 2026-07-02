# Headless Runner

Status: direction spike with thin prototype
Date: 2026-07-02
Baseline checked at: `a45124a`

## Summary

This spike proves that Angel Engine can host a minimal `angel run`-style
entrypoint without turning `crates/test-cli` into product code. The prototype is
`crates/angel`, a thin binary that runs one prompt through the existing
`angel-engine-client` process path and exits.

Confidence remains LOW. The prototype is useful as evidence, not as a decision
to absorb Luna's workflow. The maintainer still needs to decide whether this is
an internal dogfooding tool or a shipped CLI.

## Current Baseline

`WORKFLOW.md` still shows Luna bypassing Angel Engine and spawning
`codex app-server` directly with explicit approval and sandbox policy. The only
existing CLI-like engine consumer before this spike was `crates/angel-profiler`,
which is a profiler, and `crates/test-cli` remains a library-only test/support
crate.

The profiler pattern is still current: build `ClientOptions`, spawn
`AngelClient`, initialize, start a thread, send a message, wait for terminal,
and read the final turn snapshot. The prototype copies that shape narrowly.

## Requirements Inventory

| Requirement                               | Current engine support     | Evidence / gap                                                                                                  |
| ----------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Spawn a selected runtime                  | Engine already supports it | `create_runtime_options` maps built-in runtime ids to `ClientOptions`; `AngelClient::spawn` starts the process. |
| Send one prompt                           | Engine already supports it | `AngelClient::send_text` returns a command result with a turn id.                                               |
| Wait for completion                       | Engine already supports it | `AngelClient::turn_is_terminal` and `next_update` are enough to poll until terminal.                            |
| Print final assistant text                | Engine already supports it | `TurnSnapshot.output_text` is already normalized by the client snapshot.                                        |
| Meaningful non-zero exit on runtime fault | Engine mostly supports it  | Prototype exits `1` for spawn/init/start/send/timeout/non-success errors. It does not yet classify error codes. |
| Working directory                         | Engine already supports it | `RuntimeOptionsOverrides.cwd` and `StartConversationRequest.cwd` are passed through.                            |
| Transcript capture                        | Gap                        | Engine snapshots expose normalized turns, but the prototype does not write transcript files.                    |
| Sandbox and approval policy               | Gap                        | Luna uses explicit sandbox and approval settings; this prototype intentionally has no such flags.               |
| Resume/session persistence                | Gap                        | Prototype starts a fresh conversation only.                                                                     |
| Multiple output formats                   | Gap                        | Prototype prints final text only.                                                                               |

## Prototype

`crates/angel` adds one binary:

```sh
cargo run -p angel -- --runtime opencode --prompt "Reply with exactly: runner-ok" --cwd /Users/akrc/Developer/angel-engine
```

Observed result:

```text
runner-ok
```

The first attempted smoke used `kimi`, but the local `kimi` executable is broken
on this machine:

```text
bad interpreter: /Users/akrc/.local/share/uv/tools/kimi-cli/bin/python3: no such file or directory
```

That is a local install problem, not an engine runner failure. `opencode`
provided the live runtime smoke.

The prototype only handles:

- `--runtime <name>`
- `--prompt <text>`
- `--cwd <path>`

It does not include sandbox, output-format, transcript, persistence, resume,
approval-policy, or streaming flags.

## Out Of Scope / Scope-Creep Risks

- Sandbox policy: mapping Luna's `danger-full-access` or future sandbox modes
  into engine/runtime options is a security contract, not a parser flag.
- Approval policy: unattended `never` approval and runtime permission modes need
  provider-specific semantics and should not be guessed.
- Output formats: text, JSON, streaming JSONL, and transcript files imply a
  stable CLI API that users will script against.
- Session persistence and resume: storing remote ids, local state, and
  transcript locations would make this a product surface.
- Luna integration: adopting `.luna/`, `asahi.db`, tracker state, and PR
  lifecycle is outside this repo-level runner spike.
- Multi-turn workflows: retries, max turns, scheduler control, and issue
  handoff belong to an orchestrator, not this one-shot prototype.

## Decision

Decision question for the maintainer: should this stay an internal dogfooding
tool, or become a shipped `angel run` CLI?

LOW confidence caveat: the maintainer may decide that Angel Engine should not
absorb Luna-style autonomous workflows at all. If so, `crates/angel` should be
deleted or kept private as a scratch tool.

Sub-questions:

- Is engine-normalized multi-runtime execution worth giving up Luna's direct
  Codex control?
- Who owns sandbox and approval-policy translation?
- Should a shipped CLI guarantee output stability for scripts?
- Should transcripts be written by the runner, by the engine, or not at all?
- Which runtimes must be supported before this is useful beyond local dogfood?

## Follow-up Scope If Accepted

- Add an explicit CLI contract and error-code taxonomy.
- Add transcript output only after deciding JSON/text/streaming formats.
- Add sandbox and approval policy through typed engine/client options, not
  stringly flags.
- Add tests with a scripted ACP runtime fixture before supporting release use.
