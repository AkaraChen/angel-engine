import type {
  DaemonErrorCode,
  DaemonErrorPayload,
} from "@angel-engine/daemon-api/daemon";
import type { SourceControlErrorDetails } from "@angel-engine/daemon-api/source-control";

import { Data } from "effect";

export type { DaemonErrorCode, DaemonErrorPayload };

export type DaemonErrorStatus = 400 | 403 | 404 | 409 | 500;

interface DaemonErrorProps {
  cause?: unknown;
  code: DaemonErrorCode;
  message: string;
  relatedChatId?: string;
  sourceControl?: SourceControlErrorDetails;
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

  static sourceControlCliMissing(
    providerId: string,
    message = "The source-control CLI is not installed or not on PATH.",
  ) {
    return new DaemonError({
      code: "source-control/cli-missing",
      message,
      sourceControl: sourceControlDetails(providerId, "authenticate", false),
      status: 400,
    });
  }

  static sourceControlCapabilityUnsupported(
    message = "This source-control provider does not support the requested operation.",
    providerId = "unknown",
  ) {
    return new DaemonError({
      code: "source-control/capability-unsupported",
      message,
      sourceControl: {
        operation: "capability",
        providerId,
        retryable: false,
      },
      status: 400,
    });
  }

  static sourceControlUnauthenticated(
    providerId: string,
    message = "The source-control provider is not authenticated.",
  ) {
    return new DaemonError({
      code: "source-control/unauthenticated",
      message,
      sourceControl: sourceControlDetails(providerId, "authenticate", false),
      status: 400,
    });
  }

  static sourceControlUrlUnsupported(
    providerId: string,
    message = "The source-control provider does not support this URL.",
  ) {
    return new DaemonError({
      code: "source-control/url-unsupported",
      message,
      sourceControl: sourceControlDetails(providerId, "resolve-url", false),
      status: 400,
    });
  }

  static sourceControlItemNotFound(
    providerId: string,
    message = "The source-control item was not found.",
  ) {
    return new DaemonError({
      code: "source-control/item-not-found",
      message,
      sourceControl: sourceControlDetails(providerId, "get-item", false),
      status: 404,
    });
  }

  static sourceControlPermissionDenied(
    providerId: string,
    message = "You do not have permission to perform this source-control operation.",
  ) {
    return new DaemonError({
      code: "source-control/permission-denied",
      message,
      sourceControl: sourceControlDetails(providerId, "merge", false),
      status: 403,
    });
  }

  static sourceControlMergeConflict(
    providerId: string,
    message = "The change request can no longer be merged. Refresh its status and try again.",
  ) {
    return new DaemonError({
      code: "source-control/merge-conflict",
      message,
      sourceControl: sourceControlDetails(providerId, "merge", false),
      status: 409,
    });
  }

  static sourceControlFetchFailed(
    providerId: string,
    cause: unknown,
    fallback = "Source-control fetch failed.",
  ) {
    return new DaemonError({
      cause,
      code: "source-control/fetch-failed",
      message: gitMessageFromCause(cause, fallback),
      sourceControl: sourceControlDetails(providerId, "fetch", true, cause),
      status: 500,
    });
  }

  static sourceControlNetworkUnavailable(
    providerId: string,
    message = "The source-control provider is unavailable. Check your network and retry.",
  ) {
    return new DaemonError({
      code: "source-control/network-unavailable",
      message,
      sourceControl: sourceControlDetails(providerId, "network", true),
      status: 500,
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

  static prFromForkUnsupported() {
    return new DaemonError({
      code: "pr-from-fork-unsupported",
      message: "Pull requests from forks are not supported yet.",
      status: 400,
    });
  }

  static worktreeBranchConflict(branch: string) {
    return new DaemonError({
      code: "worktree-branch-conflict",
      message: `Local branch ${branch} has commits that are not in the pull request head. Rename or reconcile it before retrying.`,
      status: 409,
    });
  }

  static pullRequestNoCommits(message = "There are no commits to merge.") {
    return new DaemonError({
      code: "pull-request-no-commits",
      message,
      status: 409,
    });
  }

  static worktreeBranchInUse(branch: string, relatedChatId?: string) {
    return new DaemonError({
      code: "worktree-branch-in-use",
      message: `Branch ${branch} is already checked out in another worktree.`,
      relatedChatId,
      status: 409,
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

  static worktreeChanged(worktreePath: string) {
    return new DaemonError({
      code: "worktree-changed",
      message: `${worktreePath} changed since it was confirmed. Scan and confirm the cleanup again.`,
      status: 409,
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
  static workspaceGitPushFailed(cause: unknown) {
    const message = gitMessageFromCause(cause, "Git push failed.");
    if (isGitAuthFailure(message)) {
      return new DaemonError({
        cause,
        code: "workspace-git-auth-failed",
        message,
        status: 403,
      });
    }
    if (isGitNetworkFailure(message)) {
      return new DaemonError({
        cause,
        code: "workspace-git-network-failed",
        message,
        status: 500,
      });
    }
    if (isGitPushRejected(message)) {
      return new DaemonError({
        cause,
        code: "workspace-git-push-rejected",
        message,
        status: 409,
      });
    }
    return DaemonError.gitFailed(cause, "Git push failed.");
  }

  static workspaceGitPullFailed(cause: unknown) {
    const message = gitMessageFromCause(cause, "Git pull failed.");
    if (isGitAuthFailure(message)) {
      return new DaemonError({
        cause,
        code: "workspace-git-auth-failed",
        message,
        status: 403,
      });
    }
    if (isGitNetworkFailure(message)) {
      return new DaemonError({
        cause,
        code: "workspace-git-network-failed",
        message,
        status: 500,
      });
    }
    return DaemonError.gitFailed(cause, "Git pull failed.");
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
  return {
    code: error.code,
    error: error.message,
    ...(error.sourceControl ? { sourceControl: error.sourceControl } : {}),
  };
}

function sourceControlDetails(
  providerId: string,
  operation: string,
  retryable: boolean,
  cause?: unknown,
): SourceControlErrorDetails {
  return {
    providerId,
    operation,
    retryable,
    ...(cause instanceof Error
      ? { providerMessage: cause.message }
      : typeof cause === "string"
        ? { providerMessage: cause }
        : {}),
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
