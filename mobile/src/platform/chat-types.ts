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

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}
