---
name: angel-host
description: >
  Control the local Angel Engine desktop daemon via the bundled `angelctl`
  CLI: list chats, send messages, inspect runs and projects. Use when the
  user asks to manage Angel chats or when orchestration needs host APIs.
  Skill-first path; does not require MCP.
---

# Angel Host Control

Manipulate the **local Angel Engine host** (desktop app + daemon) through the
bundled host CLI. This is the Skill-first injection path: no MCP server is
required. MCP remains a future extension.

## Find `angelctl`

Prefer the absolute path when provided:

1. `$ANGELCTL_BIN` — full path to the binary (injected by the host when host control is enabled).
2. `$ANGELCTL_BIN_DIR/angelctl` — directory containing the binary.
3. `angelctl` on `PATH` (host prepends the bin dir for agent processes).
4. Packaged app: `Angel Engine.app/Contents/Resources/bin/angelctl` (macOS).
5. Dev monorepo: `packages/host-cli/dist/bin/angelctl` after `bun run host-cli:build`.

```bash
# Prefer absolute path from the host env
command -v angelctl || test -x "$ANGELCTL_BIN" && echo "ok"
angelctl --help
# Global flags (--json, --url, --token) go before the command.
angelctl --json which
```

## Connect to the daemon

Do **not** invent URLs or tokens. Resolution order (CLI built-in):

1. `--url` + `--token` flags
2. `ANGEL_DAEMON_URL` + `ANGEL_DAEMON_TOKEN` (injected into agent processes)
3. `--info` / `ANGEL_DAEMON_INFO` pointing at `daemon.json`
4. Well-known `~/.angel-engine/daemon.json` (mode `0600`, written by the daemon)
5. App Support `…/Angel Engine/daemon.json` (or Dev variant)

```bash
angelctl --json which          # prints URL; token always redacted
angelctl --json health
```

## Safe read-only examples

```bash
angelctl --json health
angelctl --json chat ls
angelctl --json chat get <chatId>
angelctl --json run active <chatId>
angelctl --json project ls
angelctl --json agent ls
angelctl --json skill ls --runtime claude
```

## Write examples (confirm with the user first)

```bash
angelctl chat create --runtime codex --title "Follow-up"
angelctl chat send <chatId> "Please continue from the last summary."
angelctl chat archive <chatId>
angelctl run stop <runId>
```

Use `--json` for machine-readable output; `--quiet` / `-q` for IDs only when supported.

## Security boundaries

- **Never** print, log, or commit `ANGEL_DAEMON_TOKEN`, `daemon.json`, or Bearer headers.
- Prefer `angelctl` over hand-rolled `curl` so tokens stay out of shell history.
- Do **not** call process-kill / daemon-shutdown host routes from this skill.
- Do **not** mass-delete or archive chats without explicit user confirmation.
- Mobile-paired tokens are restricted; host control uses the primary desktop token context only.

## When not to use

- User only wants code edits in the current workspace (use normal tools).
- You need structured tool schemas without shell — that is the future **MCP** path; it is not implemented here. Skill + CLI is sufficient for host control.

## Source of truth

If this document drifts, trust `angelctl --help` and the live daemon API.
MCP is intentionally **not** required for this path.
