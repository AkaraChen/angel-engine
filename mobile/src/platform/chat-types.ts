/**
 * View-model and HTTP-boundary shapes for the mobile chat UI.
 *
 * The desktop's chat types live in `@angel-engine/js-client`, but that package
 * pulls in the native `@angel-engine/client-napi` binding and is not consumable
 * from a browser bundle. These DTOs therefore mirror the serialized subset the
 * daemon exposes (or should expose — see `packages/daemon/src/server.ts`) over
 * HTTP: they intentionally match the `Chat`/`Project` field names in
 * `packages/js-client/src/types.ts` so the client boundary stays a faithful
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

/** Mirrors `Project` from `@angel-engine/js-client` (serialized over HTTP). */
export interface DaemonProject {
  id: string;
  path: string;
}

/** A git worktree available to base a chat on, per project. */
export interface DaemonWorktree {
  branch: string;
  cwd: string;
  isMain: boolean;
}

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

/** Payload for creating a chat from the mobile composer. */
export interface CreateChatInput {
  projectId?: string;
  prompt: string;
  runtime: string;
  model?: string;
  reasoningEffort?: string;
  /** When false, the chat runs in the project root (no worktree). */
  useWorktree: boolean;
  /** Existing branch to check out, or a new branch name to create. */
  worktreeBranch?: string;
  /** When true, create a fresh worktree/branch instead of reusing one. */
  createWorktree?: boolean;
}

export interface CreateChatResult {
  chatId: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}
