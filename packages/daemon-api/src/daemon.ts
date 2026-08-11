/** A live subprocess in a tracked process tree. */
export interface SubprocessInfo {
  pid: number;
  parentPid: number;
  name: string;
  command: string[];
}

/** A TCP port a tracked process is listening on. */
export interface ListeningPortInfo {
  pid: number;
  port: number;
  address: string;
}

export interface DaemonInfo {
  host: string;
  port: number;
  token: string;
  pid: number;
  version: string;
}

export interface DaemonHealth {
  pid: number;
  uptime: number;
  version: string;
}

export interface ProcessRegistryEntry {
  id: string;
  label: string;
  rootPid: number;
}

export interface ProcessRegistrySnapshotEntry extends ProcessRegistryEntry {
  processes: SubprocessInfo[];
  ports: ListeningPortInfo[];
}

/**
 * Stable machine-readable daemon error codes. Clients branch on `code`, never
 * on `error` message text.
 */
export type DaemonErrorCode =
  | "automation-not-found"
  | "automation-run-conflict"
  | "chat-cwd-invalid"
  | "chat-id-required"
  | "chat-ids-required"
  | "chat-input-required"
  | "chat-not-archived"
  | "chat-not-found"
  | "chat-prewarm-failed"
  | "chat-run-conflict"
  | "chat-run-not-found"
  | "chat-run-not-waiting"
  | "chat-runtime-locked"
  | "chat-runtime-unknown"
  | "chat-title-required"
  | "chat-worktree-creation-forbidden"
  | "custom-agent-field-required"
  | "custom-agent-id-required"
  | "custom-agent-not-found"
  | "database-failed"
  | "git-failed"
  | "git-push-denied"
  | "git-push-not-fast-forward"
  | "git-remote-missing"
  | "source-control/cli-missing"
  | "source-control/unauthenticated"
  | "source-control/fetch-failed"
  | "source-control/item-not-found"
  | "source-control/merge-conflict"
  | "source-control/permission-denied"
  | "source-control/network-unavailable"
  | "source-control/url-unsupported"
  | "internal"
  | "invalid-request"
  | "link-unsupported"
  | "linear-fetch-failed"
  | "linear-item-not-found"
  | "linear-token-missing"
  | "linear-unauthorized"
  | "pr-from-fork-unsupported"
  | "process-not-registered"
  | "project-config-invalid"
  | "project-config-write-failed"
  | "project-id-required"
  | "project-not-found"
  | "project-not-git-repository"
  | "project-path-invalid"
  | "project-required-for-worktree"
  | "pull-request-already-exists"
  | "pull-request-no-commits"
  | "session-failed"
  | "worktree-create-failed"
  | "worktree-branch-conflict"
  | "worktree-branch-in-use"
  | "worktree-changed"
  | "worktree-has-active-chats"
  | "worktree-not-managed"
  | "worktree-remove-failed"
  | "worktree-setup-approval-required"
  | "workspace-commit-input-invalid"
  | "workspace-git-auth-failed"
  | "workspace-git-detached-head"
  | "workspace-git-network-failed"
  | "workspace-git-no-commits"
  | "workspace-git-no-remote"
  | "workspace-git-push-rejected"
  | "workspace-not-git-repository"
  | "workspace-path-invalid";

/** Wire shape of a daemon error response body. */
export interface DaemonErrorPayload {
  code: DaemonErrorCode;
  error: string;
  sourceControl?: SourceControlErrorDetails;
}
import type { SourceControlErrorDetails } from "./source-control";
