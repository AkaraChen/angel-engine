import type {
  ListeningPortInfo,
  SubprocessInfo,
} from "@angel-engine/client-napi";

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
  | "chat-cwd-invalid"
  | "chat-id-required"
  | "chat-ids-required"
  | "chat-input-required"
  | "chat-not-archived"
  | "chat-not-found"
  | "chat-prewarm-failed"
  | "chat-runtime-locked"
  | "chat-runtime-unknown"
  | "chat-stream-not-waiting"
  | "chat-title-required"
  | "chat-worktree-creation-forbidden"
  | "custom-agent-field-required"
  | "custom-agent-id-required"
  | "custom-agent-not-found"
  | "database-failed"
  | "git-failed"
  | "internal"
  | "invalid-request"
  | "process-not-registered"
  | "project-id-required"
  | "project-not-found"
  | "project-not-git-repository"
  | "project-path-invalid"
  | "project-required-for-worktree"
  | "session-failed"
  | "worktree-create-failed"
  | "worktree-remove-failed"
  | "workspace-commit-input-invalid"
  | "workspace-not-git-repository"
  | "workspace-path-invalid";

/** Wire shape of a daemon error response body. */
export interface DaemonErrorPayload {
  code: DaemonErrorCode;
  error: string;
}
