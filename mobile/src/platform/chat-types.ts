/**
 * View-model and HTTP-boundary shapes for the mobile chat UI.
 *
 * The daemon's chat contract lives in `@angel-engine/daemon-api`, but that package
 * transitively pulls in the native `@angel-engine/client-napi` binding and is not
 * consumable from a browser bundle. These DTOs therefore mirror the serialized
 * subset the daemon exposes over HTTP (`packages/daemon/src/api.ts`): they
 * intentionally match the `Chat`/`Project`/`ChatHistoryMessage` field names in
 * `@angel-engine/daemon-api/chat` so the client boundary stays a faithful
 * projection of the shared types rather than a re-derivation.
 */

/** Mirrors `Chat` from `@angel-engine/js-client` (serialized over HTTP). */
export interface DaemonChat {
  archived: boolean;
  createdAt: string;
  cwd: string | null;
  id: string;
  pinned: boolean;
  projectId: string | null;
  remoteThreadId: string | null;
  runtime: string;
  title: string;
  updatedAt: string;
}

/** Mirrors `Project` from `@angel-engine/daemon-api/projects` (over HTTP). */
export interface DaemonProject {
  id: string;
  path: string;
}

/**
 * Mirrors `AgentOption` from `@angel-engine/daemon-api/agents`, as served by
 * `GET /api/agents` (the daemon's agent-management API). `skillDirectories` is
 * omitted because the mobile composer doesn't use it.
 */
export interface DaemonAgentOption {
  id: string;
  label: string;
  description: string;
}

/** Where a new chat runs, mirroring `ChatCreationLocation`. */
export type ChatCreationLocation = "project" | "worktree";

/**
 * The mobile chat-list row model: a {@link DaemonChat} enriched with the
 * project/worktree labels the list renders. Derived client-side so the daemon
 * contract can stay the raw `Chat` shape (see `deriveChatSummary`).
 */
export interface ChatSummary {
  id: string;
  title: string;
  runtime: string;
  projectId: string | null;
  projectName: string | null;
  worktreeBranch: string | null;
  pinned: boolean;
  updatedAt: string;
}

/**
 * Payload for `POST /api/chats`, mirroring `ChatCreateInput` from
 * `@angel-engine/daemon-api/chat`. The daemon creates an (empty) chat; the
 * first message is sent later from the Chat page. A worktree is requested via
 * `creationLocation: "worktree"` rather than a branch name — the daemon owns
 * managed-worktree creation.
 */
export interface CreateChatInput {
  projectId?: string;
  runtime?: string;
  model?: string;
  reasoningEffort?: string;
  creationLocation?: ChatCreationLocation;
  title?: string;
}

/**
 * One content part of a chat message. A narrowed projection of the
 * `ChatHistoryMessagePart` union from `@angel-engine/daemon-api/chat`: the mobile
 * conversation view only reads the `text` of `text`/`reasoning` parts. Richer
 * parts (tool calls, plans, images) still arrive from the daemon — structural
 * typing lets them satisfy this shape — but their extra fields are intentionally
 * not modeled because the mobile transcript ignores them.
 */
export interface DaemonMessagePart {
  type: string;
  text?: string;
}

/** Mirrors `ChatHistoryMessage` from `@angel-engine/daemon-api/chat`. */
export interface DaemonHistoryMessage {
  id: string;
  role: "assistant" | "system" | "user";
  content: DaemonMessagePart[];
  createdAt?: string;
}

/**
 * Result of `POST /api/chats/:id/load` — the chat metadata plus its persisted
 * transcript. Narrowed projection of `ChatLoadResult` (the runtime config is not
 * needed by the mobile conversation view).
 */
export interface ChatLoadResult {
  chat: DaemonChat;
  messages: DaemonHistoryMessage[];
}

/**
 * Payload for `POST /api/chat-streams` (and `/api/chats/send`). A narrowed subset
 * of `ChatSendInput`: the mobile composer only sends free-text into an existing
 * chat, so it passes the target `chatId` and the message `text`.
 */
export interface ChatSendInput {
  chatId: string;
  text: string;
}

/**
 * The streaming events the daemon emits over SSE while an assistant turn runs
 * (`POST /api/chat-streams`), mirroring the `ChatStreamEvent` union in
 * `@angel-engine/daemon-api/chat`. The mobile view consumes text/reasoning deltas
 * plus the terminal `result`/`error`/`done` events; richer events (chat, plan,
 * tool, elicitation) still arrive but are ignored.
 */
export type ChatStreamEvent =
  | { type: "delta"; part: "reasoning" | "text"; text: string; turnId?: string }
  | { type: "result"; result: { text: string } }
  | { type: "error"; message: string }
  | { type: "done" };

/** Rendered conversation row derived from history + live stream state. */
export interface ConversationMessage {
  id: string;
  role: "assistant" | "system" | "user";
  text: string;
  reasoning: string;
  status: "complete" | "error" | "streaming";
  error?: string;
}
