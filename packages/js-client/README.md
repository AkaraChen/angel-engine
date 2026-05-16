# @angel-engine/js-client

Browser and desktop TypeScript helpers for the Angel Engine client surface.

This package should stay close to `@angel-engine/client-napi`: shared types are
derived from the generated NAPI definitions where possible, and protocol
normalization belongs in the Rust provider adapters or in the narrow Claude
adapter entry. Desktop-specific persistence, IPC, and renderer policy should
remain in `desktop/`.

## Entries

### `@angel-engine/js-client`

Main client entry. Use this for the browser-ready chat client, store, runtime
adapter types, and shared chat data types.

```ts
import {
  AngelEngineChatClient,
  createAngelEngineChatStore,
  type ChatHistoryMessage,
} from "@angel-engine/js-client";
```

Keep this entry focused on the core client/store/registry and public chat
types. Test adapters and integration helpers live in subpath entries.

### `@angel-engine/js-client/utils`

Small, typed chat helpers grouped by use case:

- `core`: `createId`, `nowIso`
- `json`: JSON object parsing and guards
- `media`: data URL formatting and parsing
- `attachments`: chat attachment normalization
- `tools`: tool action conversion, cloning, and phase checks
- `elicitations`: elicitation validation, cloning, and part upsert
- `plans`: plan validation, cloning, normalization, and part upsert
- `messages`: text accumulation, part cloning, and text extraction

Runtime validation in these helpers uses ArkType schemas. Prefer adding or
adjusting a schema near the helper instead of writing ad hoc `typeof`/array
checks for new chat data shapes.

```ts
import { normalizeChatAttachmentsInput } from "@angel-engine/js-client/utils/attachments";
import {
  appendChatTextPart,
  chatPartsText,
} from "@angel-engine/js-client/utils/messages";
import { chatToolActionToPart } from "@angel-engine/js-client/utils/tools";
```

Prefer these utilities over maintaining duplicate desktop helpers when the
desktop type shape matches the js-client `Chat*` types.
`@angel-engine/js-client/utils` also exists as a grouped convenience entry, but
package code should prefer specific subpath imports.

### `@angel-engine/js-client/assistant-ui`

Assistant UI conversion helpers. This entry uses type-only imports from
`@assistant-ui/react`, so it does not bundle React hooks or runtime React code.

```ts
import {
  assistantMessageToHistoryMessage,
  historyMessageToAssistantMessage,
} from "@angel-engine/js-client/assistant-ui";
```

### `@angel-engine/js-client/claude`

Claude Code runtime adapter and narrowly scoped Claude helpers shared by
desktop dogfooding:

- `@angel-engine/js-client/claude/adapter`: `ClaudeCodeEngineAdapter`
- `@angel-engine/js-client/claude/context`: `contextPatch`, `contextUpdated`
- `@angel-engine/js-client/utils/client-update`: `emptyUpdate`
- `@angel-engine/js-client/utils/errors`: `errorMessage`, `abortError`, `throwIfAborted`

```ts
import { ClaudeCodeEngineAdapter } from "@angel-engine/js-client/claude/adapter";
import { contextUpdated } from "@angel-engine/js-client/claude/context";
import {
  abortError,
  throwIfAborted,
} from "@angel-engine/js-client/utils/errors";
```

Keep Claude SDK option policy, permission UI handling, and desktop session
lifetime in desktop. This entry should only contain reusable adapter mechanics.

### `@angel-engine/js-client/mock`

Mock transport/client helpers for local UI development and tests.

```ts
import { MockAgentAdapter } from "@angel-engine/js-client/mock";
```

## Development

```sh
corepack pnpm --filter @angel-engine/js-client typecheck
corepack pnpm --filter @angel-engine/js-client test
corepack pnpm --filter @angel-engine/js-client build
```

The build excludes `*.test.ts` files and emits declaration files under `dist/`.
Add tests next to the module they cover under `src/**/__tests__`.
