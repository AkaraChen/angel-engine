import type {
  GitHubPullRequestCheck,
  GitHubPullRequestStatus,
} from "@angel-engine/daemon-api/github";

export type MergeBlocker =
  | { kind: "conflict" }
  | { kind: "draft" }
  | { checks: GitHubPullRequestCheck[]; kind: "required-checks-failed" }
  | { checks: GitHubPullRequestCheck[]; kind: "required-checks-pending" }
  | { kind: "changes-requested" }
  | { kind: "review-required" }
  | { count: number; kind: "unresolved-threads" }
  | { count: number; kind: "behind-base" }
  | { kind: "permission-denied" }
  | { kind: "repository-policy" };

export function deriveMergeBlockers(
  status: GitHubPullRequestStatus,
): MergeBlocker[] {
  const blockers: MergeBlocker[] = [];
  if (status.mergeable === "CONFLICTING") blockers.push({ kind: "conflict" });
  if (status.isDraft) blockers.push({ kind: "draft" });

  const failed = status.checks.filter(
    (check) => check.required && check.state === "failure",
  );
  if (failed.length > 0) {
    blockers.push({ checks: failed, kind: "required-checks-failed" });
  }
  const pending = status.checks.filter(
    (check) => check.required && check.state === "pending",
  );
  if (pending.length > 0) {
    blockers.push({ checks: pending, kind: "required-checks-pending" });
  }

  if (status.reviewDecision === "CHANGES_REQUESTED") {
    blockers.push({ kind: "changes-requested" });
  } else if (status.reviewDecision === "REVIEW_REQUIRED") {
    blockers.push({ kind: "review-required" });
  }
  if (status.unresolvedThreads.length > 0) {
    blockers.push({
      count: status.unresolvedThreads.length,
      kind: "unresolved-threads",
    });
  }
  if (status.behindBy > 0 && status.mergeStateStatus === "BEHIND") {
    blockers.push({ count: status.behindBy, kind: "behind-base" });
  }
  if (!status.viewerCanMerge) blockers.push({ kind: "permission-denied" });

  const hasSpecificPolicyBlocker = blockers.some(
    (blocker) => blocker.kind !== "permission-denied",
  );
  if (status.mergeStateStatus === "BLOCKED" && !hasSpecificPolicyBlocker) {
    blockers.push({ kind: "repository-policy" });
  }
  return blockers;
}

export function optionalFailedChecks(status: GitHubPullRequestStatus) {
  return status.checks.filter(
    (check) => !check.required && check.state === "failure",
  );
}
