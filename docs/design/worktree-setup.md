# Worktree setup scripts

Angel Engine uses the repository's `2code.json` to prepare newly-created
worktrees. `setup_script` is the only worktree initialization hook:

```json
{
  "script_shell": "auto",
  "setup_script": [
    "ln -s \"$ANGEL_SOURCE_WORKTREE_PATH/node_modules\" \"$ANGEL_WORKTREE_PATH/node_modules\"",
    "cp \"$ANGEL_SOURCE_WORKTREE_PATH/.env.local\" \"$ANGEL_WORKTREE_PATH/.env.local\""
  ]
}
```

Review secret-bearing copies such as `.env.local` carefully. A changed
`2code.json` receives a new digest, and desktop asks for approval before the
script runs. Setup starts after `git worktree add`; worktree creation remains
responsive, while the agent's first message waits for setup to finish. The
setup banner lets the user explicitly continue without waiting after a failure.

`init_script` is a retired key. Angel Engine never executes it automatically.
When it contains commands, desktop offers an explicit migration to
`setup_script`; the migrated configuration then goes through the normal digest
approval.

## Shell selection

- `auto` (default): macOS and Linux use `bash`, falling back to `sh` when bash
  is unavailable. Windows uses the brush binary bundled with desktop and falls
  back to Git Bash.
- `bash`: requires the same bash-compatible execution path as `auto`.
- `system`: compatibility mode. It uses `sh` on macOS/Linux and PowerShell on
  Windows. Choose this only for existing platform-specific scripts.

Windows release packaging builds the pinned `brush-shell` version and places
`brush.exe` in the app's `Resources/bin` directory.

## Environment contract

Lifecycle commands run with the new worktree as their current directory. Angel
Engine removes inherited `ANGEL_*` and `ELECTRON_*` variables before injecting
owned values:

| Variable | Meaning |
| --- | --- |
| `ANGEL_SOURCE_WORKTREE_PATH` | Source checkout used to create the worktree |
| `ANGEL_WORKTREE_PATH` | New worktree path and command working directory |
| `ANGEL_WORKTREE_BRANCH` | New or checked-out branch |
| `ANGEL_WORKTREE_BASE_REF` | Start ref used by `git worktree add` |
| `ANGEL_PROJECT_ID` | Angel Engine project id |
| `ANGEL_LIFECYCLE_KIND` | `setup`, `teardown`, or `run` |

`run_script` also receives `ANGEL_WORKSPACE_PORT` and `PORT`.

When a project has no `setup_script`, the worktree composer shows a non-blocking
notice. “Help me configure” opens a new conversation rooted at the source
project with a prompt that asks the agent to inspect the repository and author a
safe configuration. “Don't show again” is stored per project.
