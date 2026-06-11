export interface WorkspaceToolRootInput {
  root: string;
}

export interface WorkspaceToolReadFileInput extends WorkspaceToolRootInput {
  path: string;
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

export interface WorkspaceGitDiffResult {
  branch?: string;
  isGitRepository: boolean;
  root: string;
  stagedPatch: string;
  status: WorkspaceToolGitStatusEntry[];
  unstagedPatch: string;
  warnings: string[];
}
