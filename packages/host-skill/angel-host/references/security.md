# Host control security

- Never echo tokens into logs, chat transcripts, or shell history when avoidable.
- `daemon.json` is mode `0600`; do not copy it into project trees or commits.
- Prefer Skill + CLI over inventing HTTP calls with Bearer headers.
- Do not restart, kill, or shut down host processes via privileged routes.
- MCP is a later optional extension; do not require it for host control.
