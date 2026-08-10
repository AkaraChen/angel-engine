import type { GitHubPullRequestStatus } from "@angel-engine/daemon-api/github";
import { describe, expect, it } from "vitest";

import {
  deriveMergeBlockers,
  optionalFailedChecks,
  type MergeBlocker,
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
  it.each([
    {
      expected: [],
      label: "ready pull request",
      patch: {},
    },
    {
      expected: [],
      label: "branch behind a base that does not require freshness",
      patch: { behindBy: 2 },
    },
    {
      expected: [{ count: 2, kind: "behind-base" }],
      label: "branch blocked by an up-to-date policy",
      patch: { behindBy: 2, mergeStateStatus: "BEHIND" },
    },
    {
      expected: [
        {
          checks: [
            {
              name: "build",
              required: true,
              state: "pending",
              url: "https://example.test/build",
            },
          ],
          kind: "required-checks-pending",
        },
      ],
      label: "required check still running",
      patch: {
        checks: [
          {
            name: "build",
            required: true,
            state: "pending",
            url: "https://example.test/build",
          },
        ],
      },
    },
    {
      expected: [{ kind: "repository-policy" }],
      label: "otherwise unexplained repository policy",
      patch: { mergeStateStatus: "BLOCKED" },
    },
  ] satisfies {
    expected: MergeBlocker[];
    label: string;
    patch: Partial<GitHubPullRequestStatus>;
  }[])("returns readable blockers for $label", ({ expected, patch }) => {
    expect(deriveMergeBlockers({ ...readyStatus, ...patch })).toEqual(expected);
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
      {
        checks: [
          {
            name: "typecheck",
            required: true,
            state: "failure",
            url: null,
          },
        ],
        kind: "required-checks-failed",
      },
      {
        checks: [
          { name: "build", required: true, state: "pending", url: null },
        ],
        kind: "required-checks-pending",
      },
      { kind: "changes-requested" },
      { count: 1, kind: "unresolved-threads" },
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
});
