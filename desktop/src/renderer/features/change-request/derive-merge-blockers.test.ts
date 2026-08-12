import type {
  CheckRun,
  CheckSummary,
  MergeRequirement,
} from "@angel-engine/daemon-api/source-control";
import { describe, expect, it } from "vitest";

import {
  deriveMergeBlockers,
  optionalFailedChecks,
} from "./derive-merge-blockers";

function check(name: string, overrides: Partial<CheckRun> = {}): CheckRun {
  return {
    allowFailure: false,
    attempt: 1,
    blocking: true,
    completedAt: null,
    conclusion: null,
    detailsUrl: null,
    group: null,
    id: name,
    logRef: null,
    manual: false,
    name,
    requiredness: "required",
    retryOf: null,
    startedAt: null,
    status: "running",
    ...overrides,
  };
}

function summary(checks: readonly CheckRun[]): CheckSummary {
  const failed = checks.filter(
    (item) => item.status === "completed" && item.conclusion === "failure",
  );
  return {
    checks,
    failed,
    failedBlocking: failed.filter((item) => item.blocking),
    hasPending: checks.some((item) => item.status !== "completed"),
    headOid: "head",
    requiredAllGreen: false,
  };
}

function requirement(
  kind: MergeRequirement["kind"],
  overrides: Partial<MergeRequirement> = {},
): MergeRequirement {
  return {
    blocking: true,
    detailsUrl: null,
    id: kind,
    kind,
    label: kind,
    state: "unsatisfied",
    ...overrides,
  };
}

describe("deriveMergeBlockers", () => {
  it("derives blockers from generic merge requirements and check impact", () => {
    const failed = check("typecheck", {
      conclusion: "failure",
      status: "completed",
    });

    expect(
      deriveMergeBlockers({
        checks: summary([failed]),
        requirements: [
          requirement("conflict"),
          requirement("draft"),
          requirement("checks"),
          requirement("review-approval"),
          requirement("unresolved-discussions"),
          requirement("branch-up-to-date"),
          requirement("other"),
        ],
        reviewDecision: "changes-requested",
        unresolvedThreadCount: 2,
        viewerCanMerge: false,
      }),
    ).toEqual([
      { kind: "conflict" },
      { kind: "draft" },
      { checks: [failed], kind: "required-checks-failed" },
      { kind: "changes-requested" },
      { count: 2, kind: "unresolved-threads" },
      { kind: "behind-base" },
      { kind: "repository-policy" },
      { kind: "permission-denied" },
    ]);
  });

  it("uses pending blocking checks when no blocking check failed", () => {
    const pending = check("build");
    expect(
      deriveMergeBlockers({
        checks: summary([pending]),
        requirements: [requirement("checks")],
        reviewDecision: "approved",
        unresolvedThreadCount: 0,
        viewerCanMerge: true,
      }),
    ).toEqual([{ checks: [pending], kind: "required-checks-pending" }]);
  });

  it("ignores satisfied and non-blocking requirements", () => {
    expect(
      deriveMergeBlockers({
        checks: null,
        requirements: [
          requirement("draft", { state: "satisfied" }),
          requirement("other", { blocking: false }),
        ],
        reviewDecision: "none",
        unresolvedThreadCount: 0,
        viewerCanMerge: true,
      }),
    ).toEqual([]);
  });

  it("keeps optional check failures informational", () => {
    const optional = check("preview", {
      blocking: false,
      conclusion: "failure",
      requiredness: "optional",
      status: "completed",
    });
    const checks = summary([optional]);

    expect(
      deriveMergeBlockers({
        checks,
        requirements: [],
        reviewDecision: "none",
        unresolvedThreadCount: 0,
        viewerCanMerge: true,
      }),
    ).toEqual([]);
    expect(optionalFailedChecks(checks)).toEqual([optional]);
  });
});
