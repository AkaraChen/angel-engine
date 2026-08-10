# Packages Contributor Notes

Scope: `packages/*` only. See root `AGENTS.md` for global architecture rules.

## Overview

`packages/` hosts publishable TypeScript libraries used by desktop and external consumers.

## Where To Look

| Task                            | Location                 | Notes                             |
| ------------------------------- | ------------------------ | --------------------------------- |
| Protocol-neutral JS client APIs | `packages/js-client`     | Shared model/projection/utilities |
| Claude-specific client behavior | `packages/claude-client` | Provider-focused package          |
| Host control CLI (`angelctl`)   | `packages/host-cli`      | Bundled into desktop Resources/bin |

## Conventions

- Keep package exports intentional; treat export maps as public API.
- Keep tests near code under `src/**/__tests__`.
- Maintain strict TypeScript lint/type rules and avoid `any`/`unknown` spread.
- Keep provider quirks in package-local adapter layers, not shared neutral helpers.

## Anti-Patterns

- Breaking subpath exports without corresponding API migration.
- Duplicating runtime normalization already handled in Rust adapters/client.
