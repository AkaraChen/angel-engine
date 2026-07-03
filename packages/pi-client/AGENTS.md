# `@angel-engine/pi-client` Notes

Scope: `packages/pi-client/`.

## Overview

Provider-focused TypeScript package for Pi Coding Agent runtime/session
integration built on shared JS client abstractions.

## Conventions

- Keep Pi-specific SDK and event mapping local to this package.
- Maintain build outputs for both import/require consumers.
- Reuse shared neutral helpers from `@angel-engine/js-client` where appropriate.
- Prefer explicit discriminated unions and typed payloads.

## Anti-Patterns

- Moving Pi SDK quirks into shared packages or desktop projection code.
- Introducing loose JSON catch-all types for core client interfaces.
