export const CLI_NAME = "angelctl";
export const CLI_VERSION = "0.1.0";

export function usageText(): string {
  return `Usage: ${CLI_NAME} [options] <command> [args]

Host control CLI for the Angel Engine desktop daemon.
Designed for agents (and humans) to list chats, send messages, and inspect host state.

Connection (first match wins):
  --url <origin> --token <bearer>     Explicit daemon endpoint
  ANGEL_DAEMON_URL + ANGEL_DAEMON_TOKEN
  --info <path> | ANGEL_DAEMON_INFO   daemon.json from daemon handshake
  ~/.angel-engine/daemon.json         well-known path (written by daemon)
  App Support …/Angel Engine/daemon.json

Global options:
  --url <origin>     Daemon base URL (e.g. http://127.0.0.1:PORT)
  --token <secret>   Bearer token (never printed)
  --info <path>      Path to daemon.json
  --json             Machine-readable JSON on stdout
  --quiet, -q        IDs only when applicable
  --help, -h         Show this help
  --version, -V      CLI version

Commands:
  health                          GET /api/health
  version                         CLI + daemon version when reachable
  which                           Resolved URL (token redacted) + binary path

  chat ls                         List chats
  chat get <id>                   Get chat metadata
  chat create [flags]             Create chat
      --project <id> --runtime <id> --title <text> --cwd <path>
  chat send <id> <text...>        Send a user message
  chat archive <id>               Archive chat

  run active <chatId>             Active run for a chat
  run stop <runId>                Stop a chat run

  attention ls                    Pending human attention
  activity ls                     Chat activity snapshot

  project ls                      List projects
  project get <id>                Project detail
  project git-status <id>         Git status for project

  worktree ls [--eligible-only]   Managed worktrees

  agent ls                        Available agent runtimes
  skill ls --runtime <id> [--project <path>]

Exit codes:
  0 success | 1 usage | 2 auth | 3 unreachable | 4 domain/not-found

Never echo tokens into logs or shell history when avoidable.
`;
}
