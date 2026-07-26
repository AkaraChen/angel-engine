import type {
  DaemonErrorCode,
  DaemonErrorPayload,
} from "@angel-engine/daemon-api/daemon";

import { Data } from "effect";

export type { DaemonErrorCode, DaemonErrorPayload };

export type DaemonErrorStatus = 400 | 403 | 404 | 409 | 500;

interface DaemonErrorProps {
  cause?: unknown;
  code: DaemonErrorCode;
  message: string;
  status: DaemonErrorStatus;
}

/**
 * The daemon's only error type. Every failure case is constructed through a
 * static factory that stamps a stable `code` and the HTTP status the transport
 * maps it to.
 */
export class DaemonError extends Data.TaggedError(
  "DaemonError",
)<DaemonErrorProps> {
  static invalidRequest(message: string) {
    return new DaemonError({ code: "invalid-request", message, status: 400 });
  }

  static internal(cause: unknown) {
    return new DaemonError({
      cause,
      code: "internal",
      message: messageFromCause(cause, "Internal daemon error."),
      status: 500,
    });
  }

  static databaseFailed(cause: unknown, message: string) {
    return new DaemonError({
      cause,
      code: "database-failed",
      message: messageFromCause(cause, message),
      status: 500,
    });
  }

  static chatIdRequired() {
    return new DaemonError({
      code: "chat-id-required",
      message: "Chat id is required.",
      status: 400,
    });
  }

  static chatIdsRequired() {
    return new DaemonError({
      code: "chat-ids-required",
      message: "At least one chat id is required.",
      status: 400,
    });
  }

  static chatNotFound() {
    return new DaemonError({
      code: "chat-not-found",
      message: "Chat not found.",
      status: 404,
    });
  }

  static chatNotArchived() {
    return new DaemonError({
      code: "chat-not-archived",
      message: "Chat is not archived.",
      status: 409,
    });
  }

  static chatTitleRequired() {
    return new DaemonError({
      code: "chat-title-required",
      message: "Chat title is required.",
      status: 400,
    });
  }

  static chatInputRequired(message = "Chat text or attachment is required.") {
    return new DaemonError({
      code: "chat-input-required",
      message,
      status: 400,
    });
  }

  static chatRuntimeUnknown(message = "Unknown chat runtime.") {
    return new DaemonError({
      code: "chat-runtime-unknown",
      message,
      status: 400,
    });
  }

  static chatRuntimeLocked() {
    return new DaemonError({
      code: "chat-runtime-locked",
      message: "Chat runtime cannot be changed after the chat has started.",
      status: 409,
    });
  }

  static chatCwdInvalid(message: string) {
    return new DaemonError({ code: "chat-cwd-invalid", message, status: 400 });
  }

  static chatWorktreeCreationForbidden(message: string) {
    return new DaemonError({
      code: "chat-worktree-creation-forbidden",
      message,
      status: 400,
    });
  }

  static chatPrewarmFailed(message: string) {
    return new DaemonError({
      code: "chat-prewarm-failed",
      message,
      status: 500,
    });
  }

  static chatRunConflict(message = "The chat already has an active run.") {
    return new DaemonError({
      code: "chat-run-conflict",
      message,
      status: 409,
    });
  }

  static chatRunNotFound() {
    return new DaemonError({
      code: "chat-run-not-found",
      message: "Active chat run not found.",
      status: 404,
    });
  }

  static chatRunNotWaiting() {
    return new DaemonError({
      code: "chat-run-not-waiting",
      message: "Chat run is not waiting for this user input.",
      status: 409,
    });
  }

  static customAgentIdRequired() {
    return new DaemonError({
      code: "custom-agent-id-required",
      message: "Custom agent id is required.",
      status: 400,
    });
  }

  static customAgentNotFound(message = "Custom agent not found.") {
    return new DaemonError({
      code: "custom-agent-not-found",
      message,
      status: 404,
    });
  }

  static customAgentFieldRequired(label: string) {
    return new DaemonError({
      code: "custom-agent-field-required",
      message: `${label} is required.`,
      status: 400,
    });
  }

  static projectConfigInvalid(message: string) {
    return new DaemonError({
      code: "project-config-invalid",
      message,
      status: 409,
    });
  }

  static projectConfigWriteFailed(cause: unknown) {
    return new DaemonError({
      cause,
      code: "project-config-write-failed",
      message: messageFromCause(cause, "Could not write project settings."),
      status: 500,
    });
  }

  static projectIdRequired() {
    return new DaemonError({
      code: "project-id-required",
      message: "Project id is required.",
      status: 400,
    });
  }

  static projectNotFound(message = "Project not found.") {
    return new DaemonError({
      code: "project-not-found",
      message,
      status: 404,
    });
  }

  static projectPathInvalid(message: string) {
    return new DaemonError({
      code: "project-path-invalid",
      message,
      status: 400,
    });
  }

  static projectNotGitRepository() {
    return new DaemonError({
      code: "project-not-git-repository",
      message: "Project is not a git repository.",
      status: 409,
    });
  }

  static projectRequiredForWorktree() {
    return new DaemonError({
      code: "project-required-for-worktree",
      message: "Project is required to create a git worktree.",
      status: 400,
    });
  }

  static gitFailed(cause: unknown, fallback = "Git command failed.") {
    return new DaemonError({
      cause,
      code: "git-failed",
      message: gitMessageFromCause(cause, fallback),
      status: 500,
    });
  }

  static githubCliMissing() {
    return new DaemonError({
      code: "github-cli-missing",
      message: "GitHub CLI (gh) is not installed or not on PATH.",
      status: 400,
    });
  }

  static githubCliUnauthenticated(
    message = "GitHub CLI is not authenticated.",
  ) {
    return new DaemonError({
      code: "github-cli-unauthenticated",
      message,
      status: 400,
    });
  }

  static githubUrlUnsupported(
    message = "Only github.com issue or pull request URLs are supported.",
  ) {
    return new DaemonError({
      code: "github-url-unsupported",
      message,
      status: 400,
    });
  }

  static githubItemNotFound(
    message = "GitHub issue or pull request was not found.",
  ) {
    return new DaemonError({
      code: "github-item-not-found",
      message,
      status: 404,
    });
  }

  static githubFetchFailed(cause: unknown, fallback = "GitHub fetch failed.") {
    return new DaemonError({
      cause,
      code: "github-fetch-failed",
      message: gitMessageFromCause(cause, fallback),
      status: 500,
    });
  }

  static worktreeCreateFailed(cause: unknown) {
    return new DaemonError({
      cause,
      code: "worktree-create-failed",
      message: gitMessageFromCause(cause, "Could not create git worktree."),
      status: 500,
    });
  }

  static worktreeNotManaged(worktreePath: string) {
    return new DaemonError({
      code: "worktree-not-managed",
      message: `${worktreePath} is not an app-managed git worktree.`,
      status: 400,
    });
  }

  static worktreeHasActiveChats(worktreePath: string) {
    return new DaemonError({
      code: "worktree-has-active-chats",
      message: `${worktreePath} still has active chats.`,
      status: 409,
    });
  }

  static worktreeRemoveFailed(cause: unknown) {
    return new DaemonError({
      cause,
      code: "worktree-remove-failed",
      message: gitMessageFromCause(cause, "Could not remove git worktree."),
      status: 500,
    });
  }

  static worktreeSetupApprovalRequired() {
    return new DaemonError({
      code: "worktree-setup-approval-required",
      message: "Worktree setup requires approval for the current 2code.json.",
      status: 409,
    });
  }

  static workspacePathInvalid(message: string) {
    return new DaemonError({
      code: "workspace-path-invalid",
      message,
      status: 400,
    });
  }

  static workspaceNotGitRepository() {
    return new DaemonError({
      code: "workspace-not-git-repository",
      message: "Workspace root is not a Git repository.",
      status: 409,
    });
  }

  static workspaceCommitInputInvalid(message: string) {
    return new DaemonError({
      code: "workspace-commit-input-invalid",
      message,
      status: 400,
    });
  }

  static processNotRegistered() {
    return new DaemonError({
      code: "process-not-registered",
      message: "Process is not registered.",
      status: 403,
    });
  }

  static sessionFailed(cause: unknown) {
    return new DaemonError({
      cause,
      code: "session-failed",
      message: messageFromCause(cause, "Chat session operation failed."),
      status: 500,
    });
  }
}

export function daemonErrorPayload(error: DaemonError): DaemonErrorPayload {
  return { code: error.code, error: error.message };
}

function messageFromCause(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message.length > 0
    ? cause.message
    : fallback;
}

function gitMessageFromCause(cause: unknown, fallback: string) {
  if (typeof cause === "object" && cause !== null) {
    const record = cause as { message?: unknown; stderr?: unknown };
    if (typeof record.stderr === "string" && record.stderr.trim().length > 0) {
      return record.stderr.trim();
    }
    if (
      typeof record.message === "string" &&
      record.message.trim().length > 0
    ) {
      return record.message.trim();
    }
  }
  return fallback;
}
