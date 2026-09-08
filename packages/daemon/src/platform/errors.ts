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
  relatedChatId?: string;
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
  static automationNotFound() {
    return new DaemonError({
      code: "automation-not-found",
      message: "Automation not found.",
      status: 404,
    });
  }

  static automationRunConflict() {
    return new DaemonError({
      code: "automation-run-conflict",
      message: "Automation already has an active run.",
      status: 409,
    });
  }

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

  static gitFailed(cause: unknown, fallback = "Git command failed.") {
    return new DaemonError({
      cause,
      code: "git-failed",
      message: gitMessageFromCause(cause, fallback),
      status: 500,
    });
  }

  static gitPushDenied(message = "No push access to this repository.") {
    return new DaemonError({ code: "git-push-denied", message, status: 403 });
  }

  static gitPushNotFastForward(
    message = "Remote branch has diverged. Pull and retry.",
  ) {
    return new DaemonError({
      code: "git-push-not-fast-forward",
      message,
      status: 409,
    });
  }

  static gitRemoteMissing(message = "Git remote origin is not configured.") {
    return new DaemonError({
      code: "git-remote-missing",
      message,
      status: 409,
    });
  }

  static linkUnsupported() {
    return new DaemonError({
      code: "link-unsupported",
      message: "Use a supported work item or change request link.",
      status: 400,
    });
  }

  static linearTokenMissing() {
    return new DaemonError({
      code: "linear-token-missing",
      message: "Connect Linear in Settings before resolving this issue.",
      status: 400,
    });
  }

  static linearUnauthorized() {
    return new DaemonError({
      code: "linear-unauthorized",
      message: "Linear rejected the configured API token.",
      status: 403,
    });
  }

  static linearItemNotFound() {
    return new DaemonError({
      code: "linear-item-not-found",
      message: "Linear issue was not found or is not visible to this token.",
      status: 404,
    });
  }

  static linearFetchFailed(cause: unknown) {
    return new DaemonError({
      cause,
      code: "linear-fetch-failed",
      message: messageFromCause(cause, "Linear fetch failed."),
      status: 500,
    });
  }

  static pullRequestAlreadyExists(
    message = "A pull request already exists for this branch.",
  ) {
    return new DaemonError({
      code: "pull-request-already-exists",
      message,
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

  static workspaceGitDetachedHead() {
    return new DaemonError({
      code: "workspace-git-detached-head",
      message: "Checkout a branch before pushing; HEAD is detached.",
      status: 409,
    });
  }

  static workspaceGitNoRemote() {
    return new DaemonError({
      code: "workspace-git-no-remote",
      message: "The repository has no remote to push to.",
      status: 409,
    });
  }

  static workspaceGitNoCommits() {
    return new DaemonError({
      code: "workspace-git-no-commits",
      message: "Create a commit before publishing this branch.",
      status: 409,
    });
  }

  /**
   * A failed `git push` is the one git failure users must act on themselves, so
   * the transport hands back an actionable code instead of a generic
   * `git-failed` with stderr the UI can only print verbatim.
   */
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
  return {
    code: error.code,
    error: error.message,
  };
}

function messageFromCause(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message.length > 0
    ? cause.message
    : fallback;
}

const gitAuthFailurePatterns = [
  /authentication failed/i,
  /could not read (?:username|password)/i,
  /invalid username or password/i,
  /permission denied/i,
  /support for password authentication was removed/i,
  /terminal prompts disabled/i,
  /\bpublickey\b/i,
  /remote: (?:forbidden|unauthorized)/i,
  /\b(?:401|403)\b/,
];

const gitNetworkFailurePatterns = [
  /could not resolve (?:host|hostname|proxy)/i,
  /connection (?:refused|reset|timed out)/i,
  /couldn't connect to server/i,
  /failed to connect to/i,
  /network is unreachable/i,
  /operation timed out/i,
  /ssl (?:certificate problem|connect error)/i,
  /unable to access '/i,
];

const gitPushRejectedPatterns = [
  /\[rejected\]/i,
  /non-fast-forward/i,
  /updates were rejected/i,
  /fetch first/i,
];

function isGitAuthFailure(message: string) {
  return gitAuthFailurePatterns.some((pattern) => pattern.test(message));
}

function isGitNetworkFailure(message: string) {
  return gitNetworkFailurePatterns.some((pattern) => pattern.test(message));
}

function isGitPushRejected(message: string) {
  return gitPushRejectedPatterns.some((pattern) => pattern.test(message));
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
