import { DaemonError } from "../../../../../platform/errors";

const providerId = "github";

export const GitHubError = {
  sourceControlCliMissing() {
    return DaemonError.sourceControlCliMissing(
      providerId,
      "GitHub CLI (gh) is not installed or not on PATH.",
    );
  },
  sourceControlFetchFailed(cause: unknown, fallback = "GitHub fetch failed.") {
    return DaemonError.sourceControlFetchFailed(providerId, cause, fallback);
  },
  sourceControlItemNotFound(
    message = "GitHub issue or pull request was not found.",
  ) {
    return DaemonError.sourceControlItemNotFound(providerId, message);
  },
  sourceControlMergeConflict(
    message = "The pull request can no longer be merged. Refresh its status and try again.",
  ) {
    return DaemonError.sourceControlMergeConflict(providerId, message);
  },
  sourceControlNetworkUnavailable(
    message = "GitHub is unavailable. Check your network and retry.",
  ) {
    return DaemonError.sourceControlNetworkUnavailable(providerId, message);
  },
  sourceControlPermissionDenied(
    message = "You do not have permission to merge this pull request.",
  ) {
    return DaemonError.sourceControlPermissionDenied(providerId, message);
  },
  sourceControlUnauthenticated(message = "GitHub CLI is not authenticated.") {
    return DaemonError.sourceControlUnauthenticated(providerId, message);
  },
  sourceControlUrlUnsupported(
    message = "Only github.com issue or pull request URLs are supported.",
  ) {
    return DaemonError.sourceControlUrlUnsupported(providerId, message);
  },
};
