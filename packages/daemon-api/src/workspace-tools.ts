export interface WorkspaceToolRootInput {
  root: string;
}

export interface WorkspaceToolReadFileInput extends WorkspaceToolRootInput {
  path: string;
}

export interface WorkspaceToolWriteFileInput
  extends WorkspaceToolReadFileInput {
  content: string;
}

export interface WorkspaceToolGitCommitInput extends WorkspaceToolRootInput {
  description?: string;
  paths: string[];
  summary: string;
}

export const workspaceToolGitCommitInputSchema = arkType({
  "+": "ignore",
  "description?": "string | undefined",
  paths: arkType("string").array(),
  root: "string > 0",
  summary: "string > 0",
});

export const workspaceToolWriteFileInputSchema = arkType({
  "+": "ignore",
  content: "string",
  path: "string > 0",
  root: "string > 0",
});

export type WorkspaceToolGitPushInput = WorkspaceToolRootInput;

export const workspaceToolGitPushInputSchema = arkType({
  "+": "ignore",
  root: "string > 0",
});

export interface WorkspaceToolGitCommitResult {
  commitHash: string;
  root: string;
}

export type WorkspaceToolGitStatus =
  | "added"
  | "deleted"
  | "ignored"
  | "modified"
  | "renamed"
  | "untracked";

export interface WorkspaceToolGitStatusEntry {
  conflicted: boolean;
  path: string;
  staged: boolean;
  status: WorkspaceToolGitStatus;
  unstaged: boolean;
}

/**
 * Branch position relative to its upstream. `ahead`/`behind` are 0 whenever
 * there is no upstream to compare against, so the UI never has to guess.
 */
export interface WorkspaceGitBranchStatus {
  ahead: number;
  behind: number;
  branch?: string;
  detached: boolean;
  /** The symbolic branch exists, but HEAD has no commit yet. */
  unborn: boolean;
  upstream?: string;
}

export interface WorkspaceFileTreeResult {
  gitStatus: WorkspaceToolGitStatusEntry[];
  paths: string[];
  root: string;
  truncated: boolean;
}

export type WorkspaceFileReadResult =
  | {
      content: string;
      path: string;
      root: string;
      size: number;
      type: "text";
    }
  | {
      path: string;
      reason: "binary" | "not-file" | "too-large";
      root: string;
      size?: number;
      type: "unsupported";
    };

export interface WorkspaceFileWriteResult {
  path: string;
  root: string;
  size: number;
}

export interface WorkspaceGitSkippedFile {
  path: string;
  reason: "binary" | "too-large";
  size?: number;
}

export interface WorkspaceGitDiffResult {
  branchStatus: WorkspaceGitBranchStatus;
  conflictedPaths: string[];
  isGitRepository: boolean;
  root: string;
  skippedFiles: WorkspaceGitSkippedFile[];
  stagedPatch: string;
  status: WorkspaceToolGitStatusEntry[];
  unstagedPatch: string;
  warnings: string[];
}

export interface WorkspaceToolGitPushResult {
  branchStatus: WorkspaceGitBranchStatus;
  remote: string;
  root: string;
}

export type WorkspaceToolGitPullInput = WorkspaceToolRootInput;

export const workspaceToolGitPullInputSchema = arkType({
  "+": "ignore",
  root: "string > 0",
});

export interface WorkspaceToolGitPullResult {
  branchStatus: WorkspaceGitBranchStatus;
  remote: string;
  root: string;
}

export interface WorkspaceGitBranch {
  current: boolean;
  isRemote: boolean;
  name: string;
}

export interface WorkspaceGitBranchesResult {
  branchStatus: WorkspaceGitBranchStatus;
  branches: WorkspaceGitBranch[];
  isGitRepository: boolean;
  root: string;
}

export interface WorkspaceGitCheckoutInput extends WorkspaceToolRootInput {
  branch: string;
}

export const workspaceToolGitCheckoutInputSchema = arkType({
  "+": "ignore",
  branch: "string > 0",
  root: "string > 0",
});

export interface WorkspaceGitCheckoutResult {
  branchStatus: WorkspaceGitBranchStatus;
  root: string;
}

export interface WorkspaceGitLogCommit {
  authorName: string;
  committedAt: string;
  hash: string;
  shortHash: string;
  subject: string;
}

export interface WorkspaceGitLogResult {
  commits: WorkspaceGitLogCommit[];
  isGitRepository: boolean;
  root: string;
}

export interface WorkspaceGitCommitShowInput extends WorkspaceToolRootInput {
  hash: string;
}

export const workspaceToolGitCommitShowInputSchema = arkType({
  "+": "ignore",
  hash: "string > 0",
  root: "string > 0",
});

export interface WorkspaceGitCommitShowResult {
  hash: string;
  patch: string;
  root: string;
  subject?: string;
}

import { type as arkType } from "arktype";
