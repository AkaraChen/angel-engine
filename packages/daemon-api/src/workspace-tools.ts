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
  path: string;
  staged: boolean;
  status: WorkspaceToolGitStatus;
  unstaged: boolean;
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

export interface WorkspaceGitDiffResult {
  branch?: string;
  isGitRepository: boolean;
  root: string;
  stagedPatch: string;
  status: WorkspaceToolGitStatusEntry[];
  unstagedPatch: string;
  warnings: string[];
}
import { type as arkType } from "arktype";
