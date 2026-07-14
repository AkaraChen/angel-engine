/**
 * HTTP-boundary shapes for the mobile workspace tool panel.
 *
 * These mirror the serialized subset of `@angel-engine/daemon-api/workspace-tools`
 * the daemon exposes over HTTP (`GET /api/workspace/git-diff`). Like
 * {@link import("./chat-types")}, they are kept local because `mobile` is a
 * browser bundle and must not depend on the daemon-api package (which pulls the
 * native binding). The mobile panel reads live git state only — file
 * read/write/commit endpoints exist but are intentionally not surfaced here.
 */

/** Mirrors `WorkspaceToolGitStatus` from `@angel-engine/daemon-api/workspace-tools`. */
export type WorkspaceGitStatus =
  | "added"
  | "deleted"
  | "ignored"
  | "modified"
  | "renamed"
  | "untracked";

/** Mirrors `WorkspaceToolGitStatusEntry`. */
export interface WorkspaceGitStatusEntry {
  path: string;
  staged: boolean;
  status: WorkspaceGitStatus;
  unstaged: boolean;
}

/**
 * Result of `GET /api/workspace/git-diff?root=…`. Narrowed projection of
 * `WorkspaceGitDiffResult`: the mobile panel renders the branch, repo flag, and
 * the status list, and drops the staged/unstaged patch bodies (too heavy for a
 * small-screen summary).
 */
export interface WorkspaceGitDiffResult {
  branch?: string;
  isGitRepository: boolean;
  root: string;
  stagedPatch: string;
  status: WorkspaceGitStatusEntry[];
  unstagedPatch: string;
  warnings: string[];
}
