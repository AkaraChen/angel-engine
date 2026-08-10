# angelctl command map

Mirror of the Stage 2 host CLI surface. Prefer `angelctl --help` if flags change.

## Meta

| Command | Purpose |
| --- | --- |
| `health` | Daemon readiness |
| `version` | CLI (+ daemon when reachable) |
| `which` | Resolved URL (token redacted) + binary path |

## Chats / runs

| Command | Purpose |
| --- | --- |
| `chat ls` | List chats |
| `chat get <id>` | Chat metadata |
| `chat create …` | Create chat |
| `chat send <id> <text…>` | Send user message |
| `chat archive <id>` | Archive chat |
| `run active <chatId>` | Active run |
| `run stop <runId>` | Cancel run |
| `attention ls` | Pending human attention |
| `activity ls` | Activity snapshot |

## Projects / agents

| Command | Purpose |
| --- | --- |
| `project ls` / `project get <id>` | Projects |
| `project git-status <id>` | Git snapshot |
| `worktree ls` | Managed worktrees |
| `agent ls` | Runtimes |
| `skill ls --runtime <id>` | Skill catalog |

## Exit codes

`0` success · `1` usage · `2` auth · `3` unreachable · `4` domain/not-found
