import type { GitHubPullRequestStatus } from "@angel-engine/daemon-api/github";

export type MergeBlocker =
  | { kind: "conflict" }
  | { kind: "draft" }
  | { kind: "required-checks-failed"; names: string[] }
  | { kind: "required-checks-pending"; names: string[] }
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

  const failed = status.checks
    .filter((check) => check.required && check.state === "failure")
    .map((check) => check.name);
  if (failed.length > 0) {
    blockers.push({ kind: "required-checks-failed", names: failed });
  }
  const pending = status.checks
    .filter((check) => check.required && check.state === "pending")
    .map((check) => check.name);
  if (pending.length > 0) {
    blockers.push({ kind: "required-checks-pending", names: pending });
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
  if (status.behindBy > 0) {
    blockers.push({ count: status.behindBy, kind: "behind-base" });
  }
  if (!status.viewerCanMerge) blockers.push({ kind: "permission-denied" });

  const hasSpecificPolicyBlocker = blockers.some(
    (blocker) =>
      blocker.kind !== "behind-base" && blocker.kind !== "permission-denied",
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
