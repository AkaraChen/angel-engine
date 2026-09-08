export interface WorkspaceToolRootInput {
  root: string;
}

export type WorkspaceGitDiffBaseKind =
  | "branch"
  | "session"
  | "turn"
  | "unstaged"
  | "worktree";

export interface WorkspaceGitDiffInput extends WorkspaceToolRootInput {
  baseKind?: WorkspaceGitDiffBaseKind;
  baseRef?: string;
  chatId?: string;
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

export interface WorkspaceGitSkippedFile {
  path: string;
  reason: "binary" | "too-large";
  size?: number;
}

export type WorkspaceGitDiffUnavailableReasonCode =
  | "anchor-missing"
  | "anchor-unavailable"
  | "default-branch-unavailable"
  | "git-ref-unavailable"
  | "no-merge-base"
  | "not-a-repository";

export interface WorkspaceGitDiffUnavailableReason {
  anchorKind?: "session" | "turn";
  code: WorkspaceGitDiffUnavailableReasonCode;
  ref?: string;
  shortSha?: string;
}

export interface WorkspaceGitResolvedBase {
  available: boolean;
  commitTime?: string;
  fullSha?: string;
  kind: WorkspaceGitDiffBaseKind;
  ref?: string;
  shortSha?: string;
  subject?: string;
  unavailableReason?: WorkspaceGitDiffUnavailableReason;
}

export interface WorkspaceGitDiffBaseOption extends WorkspaceGitResolvedBase {
  selected: boolean;
}

export interface WorkspaceGitNumstatEntry {
  additions: number;
  deletions: number;
  path: string;
}

export interface WorkspaceGitDiffResult {
  availableBases: WorkspaceGitDiffBaseOption[];
  branch?: string;
  branchStatus: WorkspaceGitBranchStatus;
  conflictedPaths: string[];
  isGitRepository: boolean;
  numstat: WorkspaceGitNumstatEntry[];
  patch: string;
  requestedBaseKind: WorkspaceGitDiffBaseKind;
  resolvedBase: WorkspaceGitResolvedBase;
  root: string;
  skippedFiles: WorkspaceGitSkippedFile[];
  stagedPatch: string;
  status: WorkspaceToolGitStatusEntry[];
  unstagedPatch: string;
  warnings: string[];
}
