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
 * A tool action snapshot as the daemon serializes it — the `artifact` carried by
 * a `tool-call` history part and the `action` of a `tool`/`toolDelta` stream
 * event both share this shape (`ActionSnapshot` in `@angel-engine/client-napi`).
 * Only the fields the mobile tool card renders are modeled; the rest still arrive
 * and are ignored.
 */
export interface DaemonToolAction {
  id?: string;
  kind?: string | null;
  /** Lifecycle phase: `proposed` / `running` / `streamingResult` / `completed` / `failed` / … */
  phase?: string;
  title?: string | null;
  inputSummary?: string | null;
  rawInput?: string | null;
  outputText?: string;
  output?: { text?: string }[];
  error?: { message?: string } | null;
}

/**
 * One content part of a chat message. A narrowed projection of the
 * `ChatHistoryMessagePart` union from `@angel-engine/daemon-api/chat`: the mobile
 * conversation view reads the `text` of `text`/`reasoning` parts and the tool
 * fields of `tool-call` parts. Other richer parts (plans, images) still arrive
 * from the daemon — structural typing lets them satisfy this shape — but their
 * extra fields are intentionally not modeled because the mobile transcript
 * ignores them.
 */
export interface DaemonMessagePart {
  type: string;
  text?: string;
  /** Present on `tool-call` parts (mirrors `ChatToolCallPart`). */
  toolCallId?: string;
  toolName?: string;
  argsText?: string;
  args?: unknown;
  result?: unknown;
  isError?: boolean;
  artifact?: DaemonToolAction;
}

/**
 * A tool call as the mobile transcript renders it: a flat projection of a
 * `tool-call` history part or a streamed tool action, with the name, lifecycle
 * phase, input, output, and error text the {@link ConversationMessage} card
 * needs. Derived in `message-view.ts` so the projection stays pure and testable.
 */
export interface ConversationToolCall {
  /** Stable identity (tool-call id or action id) used for React keys + upserts. */
  id: string;
  /** Human label: title / input summary / tool name. */
  name: string;
  /** Raw lifecycle phase from the daemon (see {@link DaemonToolAction.phase}). */
  phase: string;
  /** Rendered input (args text / raw input), possibly empty. */
  argsText: string;
  /** Rendered output text, possibly empty. */
  outputText: string;
  /** Error message when the call failed, possibly empty. */
  errorText: string;
  /** Whether the call is in a failed/errored terminal state. */
  isError: boolean;
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
 * An elicitation the daemon raises mid-turn (a permission prompt or an input
 * request). Narrowed projection of `ChatElicitation`: the mobile UI renders the
 * title/body and, for approval-style prompts, the allow/deny choices. `kind`
 * mirrors the engine's `ElicitationKind` ("Approval", "PermissionProfile",
 * "UserInput", "ExternalFlow", "DynamicToolCall").
 */
export interface DaemonElicitation {
  id: string;
  kind: string;
  title?: string | null;
  body?: string | null;
  choices?: string[];
}

/**
 * The subset of `ChatElicitationResponse` the mobile UI can produce: approve or
 * deny a permission prompt, or cancel any elicitation to unblock the turn. Answer
 * / dynamic-tool / raw responses are a follow-up.
 */
export type ChatElicitationResponse =
  | { type: "allow" }
  | { type: "allowForSession" }
  | { type: "deny" }
  | { type: "cancel" };

/** Payload for `POST /api/chat-streams/:id/elicitation`. */
export interface ElicitationResolveInput {
  elicitationId: string;
  response: ChatElicitationResponse;
}

/**
 * The streaming events the daemon emits over SSE while an assistant turn runs
 * (`POST /api/chat-streams`), mirroring the `ChatStreamEvent` union in
 * `@angel-engine/daemon-api/chat`. The mobile view consumes text/reasoning deltas,
 * `tool`/`toolDelta` actions, `elicitation` prompts, and the terminal
 * `result`/`error`/`done` events; the remaining events (chat, plan) still arrive
 * but are ignored.
 */
export type ChatStreamEvent =
  | { type: "delta"; part: "reasoning" | "text"; text: string; turnId?: string }
  | { type: "tool"; action: DaemonToolAction }
  | { type: "toolDelta"; action: DaemonToolAction }
  | { type: "elicitation"; elicitation: DaemonElicitation }
  | { type: "result"; result: { text: string; content?: DaemonMessagePart[] } }
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
  /** Inline tool calls made during this turn, in arrival order. */
  toolCalls: ConversationToolCall[];
}
