import type {
  CheckRun,
  CheckSummary,
  MergeRequirement,
  ReviewDecision,
} from "@angel-engine/daemon-api/source-control";

export type MergeBlocker =
  | { kind: "conflict" }
  | { kind: "draft" }
  | { checks: CheckRun[]; kind: "required-checks-failed" }
  | { checks: CheckRun[]; kind: "required-checks-pending" }
  | { kind: "changes-requested" }
  | { kind: "review-required" }
  | { count: number; kind: "unresolved-threads" }
  | { kind: "behind-base" }
  | { kind: "permission-denied" }
  | { kind: "repository-policy" };

export function deriveMergeBlockers({
  checks,
  requirements,
  reviewDecision,
  unresolvedThreadCount,
  viewerCanMerge,
}: {
  checks: CheckSummary | null;
  requirements: readonly MergeRequirement[];
  reviewDecision: ReviewDecision;
  unresolvedThreadCount: number;
  viewerCanMerge: boolean | null;
}): MergeBlocker[] {
  const blockers: MergeBlocker[] = [];
  for (const requirement of requirements) {
    if (
      !requirement.blocking ||
      requirement.state === "satisfied" ||
      requirement.state === "not-applicable"
    ) {
      continue;
    }
    const blocker = requirementBlocker(
      requirement,
      checks,
      reviewDecision,
      unresolvedThreadCount,
    );
    if (
      blocker !== null &&
      !blockers.some((item) => item.kind === blocker.kind)
    ) {
      blockers.push(blocker);
    }
  }
  if (viewerCanMerge === false) blockers.push({ kind: "permission-denied" });
  return blockers;
}

export function optionalFailedChecks(checks: CheckSummary | null) {
  return (
    checks?.failed.filter(
      (check) => !check.blocking && check.requiredness !== "required",
    ) ?? []
  );
}

function requirementBlocker(
  requirement: MergeRequirement,
  checks: CheckSummary | null,
  reviewDecision: ReviewDecision,
  unresolvedThreadCount: number,
): MergeBlocker | null {
  switch (requirement.kind) {
    case "checks": {
      const failed = checks?.failedBlocking ?? [];
      if (failed.length > 0) {
        return { checks: [...failed], kind: "required-checks-failed" };
      }
      const pending =
        checks?.checks.filter((check) => check.blocking && isPending(check)) ??
        [];
      return { checks: pending, kind: "required-checks-pending" };
    }
    case "conflict":
      return { kind: "conflict" };
    case "draft":
      return { kind: "draft" };
    case "review-approval":
      return {
        kind:
          reviewDecision === "changes-requested"
            ? "changes-requested"
            : "review-required",
      };
    case "unresolved-discussions":
      return { count: unresolvedThreadCount, kind: "unresolved-threads" };
    case "branch-up-to-date":
      return { kind: "behind-base" };
    case "linked-work-items":
    case "merge-strategy":
    case "other":
      return { kind: "repository-policy" };
  }
}

function isPending(check: CheckRun) {
  return (
    check.status === "queued" ||
    check.status === "running" ||
    check.status === "waiting-manual"
  );
}
