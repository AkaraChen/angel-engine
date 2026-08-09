import type { GitHubPullRequestStatus } from "@angel-engine/daemon-api/github";
import { describe, expect, it } from "vitest";

import {
  deriveMergeBlockers,
  optionalFailedChecks,
} from "./derive-merge-blockers";

const readyStatus: GitHubPullRequestStatus = {
  allowedMergeMethods: ["squash", "merge", "rebase"],
  author: "alice",
  baseRefName: "main",
  behindBy: 0,
  checks: [],
  defaultMergeMethod: "squash",
  deleteBranchOnMerge: false,
  headRefName: "feature",
  isDraft: false,
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  mergedAt: null,
  number: 42,
  reviewDecision: "APPROVED",
  state: "OPEN",
  title: "Feature",
  unresolvedThreads: [],
  url: "https://github.com/acme/widgets/pull/42",
  viewerCanMerge: true,
  worktreeDirty: false,
};

describe("deriveMergeBlockers", () => {
  it("returns no blockers for a ready pull request", () => {
    expect(deriveMergeBlockers(readyStatus)).toEqual([]);
  });

  it("returns every readable blocker in severity order", () => {
    const blockers = deriveMergeBlockers({
      ...readyStatus,
      behindBy: 4,
      checks: [
        {
          name: "typecheck",
          required: true,
          state: "failure",
          url: null,
        },
        { name: "build", required: true, state: "pending", url: null },
      ],
      isDraft: true,
      mergeable: "CONFLICTING",
      reviewDecision: "CHANGES_REQUESTED",
      unresolvedThreads: [
        {
          author: "bob",
          body: "Handle this",
          id: "thread-1",
          isOutdated: false,
          line: 7,
          path: "src/api.ts",
          url: "https://github.com/acme/widgets/pull/42#discussion_r1",
        },
      ],
      viewerCanMerge: false,
    });

    expect(blockers).toEqual([
      { kind: "conflict" },
      { kind: "draft" },
      { kind: "required-checks-failed", names: ["typecheck"] },
      { kind: "required-checks-pending", names: ["build"] },
      { kind: "changes-requested" },
      { count: 1, kind: "unresolved-threads" },
      { count: 4, kind: "behind-base" },
      { kind: "permission-denied" },
    ]);
  });

  it("keeps optional check failures informational", () => {
    const status = {
      ...readyStatus,
      checks: [
        { name: "preview", required: false, state: "failure", url: null },
      ],
    } satisfies GitHubPullRequestStatus;

    expect(deriveMergeBlockers(status)).toEqual([]);
    expect(optionalFailedChecks(status).map((check) => check.name)).toEqual([
      "preview",
    ]);
  });

  it("surfaces an otherwise unexplained repository policy block", () => {
    expect(
      deriveMergeBlockers({ ...readyStatus, mergeStateStatus: "BLOCKED" }),
    ).toEqual([{ kind: "repository-policy" }]);
  });
});
