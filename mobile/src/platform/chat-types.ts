/**
 * The chat/project/agent wire types come from `@angel-engine/daemon-api`
 * (`Chat`, `Project`, `AgentOption`, `ChatCreateInput`, `ChatCreationLocation`)
 * — import those directly at the use site. This file only holds the small
 * view-model shapes that have no daemon equivalent.
 */

/**
 * The mobile chat-list row model: a daemon `Chat` enriched with the
 * project/worktree labels the list renders (derived in `chat-summary.ts`).
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

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}
