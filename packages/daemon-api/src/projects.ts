export interface Project {
  id: string;
  path: string;
}

export interface ProjectGitStatusInput {
  projectId: string;
}

export interface ProjectWorktreeSetup {
  commands: string[];
  digest: string;
}

export interface ProjectGitStatusResult {
  branch?: string;
  isDirty: boolean;
  isGitRepository: boolean;
  path: string;
  projectId: string;
  root?: string;
  worktreeSetup?: ProjectWorktreeSetup;
}

export interface ProjectWorktreeCreateInput {
  projectId: string;
  setupApproval?: string;
}

export interface ProjectWorktreeCreateResult {
  branch: string;
  cwd: string;
  projectId: string;
  root: string;
}

/**
 * Per-project settings persisted in the repository's `2code.json`. The file is
 * the single source of truth; the daemon never mirrors these values into its
 * database.
 */
export interface ProjectConfig {
  /** Commands run in a freshly created worktree, in order. */
  setupScript: string[];
}

export interface ProjectConfigResult extends ProjectConfig {
  /** Absolute path of the `2code.json` the values were read from. */
  configPath: string;
  /** `false` when no `2code.json` exists yet, so saving will create it. */
  exists: boolean;
  projectId: string;
}

export interface ProjectConfigInput {
  projectId: string;
}

export interface UpdateProjectConfigInput extends ProjectConfig {
  projectId: string;
}

/** One app-managed git worktree under `~/.angel-engine/worktrees`. */
export interface ManagedWorktreeSummary {
  activeChatCount: number;
  archivedChatCount: number;
  chatCount: number;
  chatIds: string[];
  /** True when no active chat still uses the worktree. */
  eligibleForCleanup: boolean;
  existsOnDisk: boolean;
  latestChatUpdatedAt: string | null;
  path: string;
  projectId: string | null;
  projectSlug: string;
}

export interface ManagedWorktreeScanInput {
  eligibleOnly?: boolean;
}

export interface ManagedWorktreeDeleteTarget {
  expectedChatIds: string[];
  expectedExistsOnDisk: boolean;
  path: string;
}

export interface ManagedWorktreeDeleteInput {
  targets: ManagedWorktreeDeleteTarget[];
}

/** A worktree whose chats were deleted but whose directory could not be removed. */
export interface ManagedWorktreeDeleteFailure {
  error: string;
  path: string;
}

export interface ManagedWorktreeDeleteResult {
  deletedChatCount: number;
  deletedChatIds: string[];
  deletedWorktreeCount: number;
  deletedWorktrees: string[];
  /**
   * Per-path failures hit after deletion started. Validation and eligibility
   * failures reject the whole request instead and never reach this list.
   */
  failedWorktrees: ManagedWorktreeDeleteFailure[];
}

export interface CreateProjectInput {
  id?: string;
  path: string;
}

export interface UpdateProjectInput {
  id: string;
  path: string;
}

export const createProjectInputSchema = arkType({
  "+": "ignore",
  "id?": "string",
  path: "string > 0",
});

export const projectFileSearchInputSchema = arkType({
  "+": "ignore",
  "limit?": "number",
  query: "string > 0",
  root: "string > 0",
});

export const projectGitStatusInputSchema = arkType({
  "+": "ignore",
  projectId: "string > 0",
});

const managedWorktreeDeleteTargetSchema = arkType({
  "+": "ignore",
  expectedChatIds: arkType("string > 0").array(),
  expectedExistsOnDisk: "boolean",
  path: "string > 0",
});

export const managedWorktreeDeleteInputSchema = arkType({
  "+": "ignore",
  targets: managedWorktreeDeleteTargetSchema.array(),
});

export const updateProjectConfigInputSchema = arkType({
  "+": "ignore",
  projectId: "string > 0",
  setupScript: "string[]",
});

export const updateProjectInputSchema = arkType({
  "+": "ignore",
  id: "string > 0",
  path: "string > 0",
});
import { type as arkType } from "arktype";
