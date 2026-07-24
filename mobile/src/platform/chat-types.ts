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

/** Mirrors `ChatRuntimeConfigInput` from `@angel-engine/daemon-api/chat`. */
export interface DaemonRuntimeConfigInput {
  cwd?: string;
  runtime?: string;
}

/** Mirrors `ChatRuntimeConfigOption` from `@angel-engine/daemon-api/chat`. */
export interface DaemonRuntimeConfigOption {
  description?: string | null;
  label: string;
  value: string;
}

/**
 * Settings projection of `ChatRuntimeConfig`. The daemon obtains these values
 * from the runtime adapter, keeping provider-specific option catalogs out of
 * the mobile UI.
 */
export interface DaemonRuntimeConfig {
  canSetModel?: boolean;
  canSetMode?: boolean;
  canSetPermissionMode?: boolean;
  canSetReasoningEffort?: boolean;
  currentMode?: string | null;
  currentModel?: string | null;
  currentPermissionMode?: string | null;
  currentReasoningEffort?: string | null;
  modes?: DaemonRuntimeConfigOption[];
  models: DaemonRuntimeConfigOption[];
  permissionModes?: DaemonRuntimeConfigOption[];
  reasoningEfforts: DaemonRuntimeConfigOption[];
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
 * conversation view reads the `text` of `text`/`reasoning` parts, tool fields of
 * `tool-call` parts, and plan data of `data` parts named `plan`/`todo`.
 */
export interface DaemonMessagePart {
  type: string;
  text?: string;
  /** Present on `data` parts (`plan` / `todo` / `elicitation` / …). */
  name?: string;
  data?: unknown;
  /** Present on `tool-call` parts (mirrors `ChatToolCallPart`). */
  toolCallId?: string;
  toolName?: string;
  argsText?: string;
  args?: unknown;
  result?: unknown;
  isError?: boolean;
  artifact?: DaemonToolAction;
}

/** One checklist entry inside a plan, mirroring `ChatPlanEntry`. */
export interface DaemonPlanEntry {
  content: string;
  status: "pending" | "in_progress" | "completed";
}

/**
 * A plan snapshot as the daemon serializes it over SSE (`type: "plan"`) and in
 * history `data` parts. Mirrors `ChatPlanData` from `@angel-engine/daemon-api/chat`.
 */
export interface DaemonPlanData {
  text: string;
  entries: DaemonPlanEntry[];
  kind?: "review" | "todo" | null;
  path?: string | null;
  /**
   * Set client-side when normalizing history: older plans of the same kind
   * collapse to a created/updated marker so only the latest is expanded.
   */
  presentation?: "created" | "updated" | null;
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
  /**
   * The actual tool identifier — `toolName` for a persisted part, `kind` for a
   * streamed action — always rendered so the transcript shows *which* tool ran
   * (e.g. `command`, `Read`, `mcp__x__y`), not just a human paraphrase.
   */
  name: string;
  /**
   * The human action label (`title` / `inputSummary`) shown as secondary text
   * beneath {@link name}. Empty when the daemon gave no summary, or when it was
   * promoted to {@link name} because no tool identifier was available.
   */
  summary: string;
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
 * Result of `POST /api/chats/:id/load` — chat metadata, transcript, and the
 * runtime config (modes / permission modes) the composer needs for plan mode.
 */
export interface ChatLoadResult {
  chat: DaemonChat;
  messages: DaemonHistoryMessage[];
  config?: DaemonRuntimeConfig;
}

/**
 * Payload for `POST /api/chat-streams` (and `/api/chats/send`). Mirrors the
 * mobile-relevant subset of `ChatSendInput`: free-text into an existing chat,
 * optionally carrying the active agent/permission mode so plan mode sticks.
 */
export interface ChatSendInput {
  chatId: string;
  text: string;
  mode?: string | null;
  permissionMode?: string | null;
}

/**
 * One question inside a structured `UserInput` elicitation. Mirrors
 * `ChatElicitationQuestion` from `@angel-engine/daemon-api/chat`.
 */
export interface DaemonElicitationQuestion {
  id: string;
  header?: string | null;
  question?: string | null;
  isSecret?: boolean;
  isOther?: boolean;
  options?: { label: string; description?: string | null }[];
}

/** Known elicitation kinds the daemon sends over the wire (camelCase). */
export type DaemonElicitationKind =
  | "approval"
  | "permissionProfile"
  | "userInput"
  | "dynamicToolCall"
  | "externalFlow"
  | (string & {});

/**
 * An elicitation the daemon raises mid-turn (a permission prompt or an input
 * request). Narrowed projection of `ChatElicitation`: the mobile UI renders the
 * title/body and, for approval-style prompts, the allow/deny choices. `kind`
 * mirrors the engine's `ElicitationKind` (camelCase on the wire).
 */
export interface DaemonElicitation {
  id: string;
  kind: DaemonElicitationKind;
  title?: string | null;
  body?: string | null;
  choices?: string[];
  questions?: DaemonElicitationQuestion[];
}

/**
 * One answer in an `answers` elicitation response. Mirrors
 * `ChatElicitationAnswer` from `@angel-engine/daemon-api/chat`.
 */
export interface ChatElicitationAnswer {
  id: string;
  value: string;
}

/**
 * Responses the mobile UI can send back to resolve an elicitation.
 * Mirrors the daemon's `ChatElicitationResponse` union.
 */
export type ChatElicitationResponse =
  | { type: "allow" }
  | { type: "allowForSession" }
  | { type: "deny" }
  | { type: "cancel" }
  | { type: "answers"; answers: ChatElicitationAnswer[] }
  | { type: "dynamicToolResult"; success: boolean }
  | { type: "externalComplete" }
  | { type: "raw"; value: string };

/** Payload for `POST /api/chat-streams/:id/elicitation`. */
export interface ElicitationResolveInput {
  elicitationId: string;
  response: ChatElicitationResponse;
}

/**
 * The streaming events the daemon emits over SSE while an assistant turn runs
 * (`POST /api/chat-streams`), mirroring the `ChatStreamEvent` union in
 * `@angel-engine/daemon-api/chat`. Mobile consumes text/reasoning deltas,
 * tools, elicitations, plans, and terminal result/error/done events.
 */
export type ChatStreamEvent =
  | { type: "delta"; part: "reasoning" | "text"; text: string; turnId?: string }
  | { type: "tool"; action: DaemonToolAction }
  | { type: "toolDelta"; action: DaemonToolAction }
  | { type: "elicitation"; elicitation: DaemonElicitation }
  | { type: "plan"; plan: DaemonPlanData; turnId?: string }
  | {
      type: "result";
      result: {
        text: string;
        content?: DaemonMessagePart[];
        /** Present when the turn finishes with an updated runtime config. */
        config?: DaemonRuntimeConfig;
      };
    }
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
  /** Plan/todo snapshots attached to this turn (history + live stream). */
  plans: DaemonPlanData[];
}
