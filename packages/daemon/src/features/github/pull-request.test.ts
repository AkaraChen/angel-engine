import { Cause, Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

import type { GhRunner } from "./gh-cli";
import {
  getGitHubPullRequestStatus,
  mergeGitHubPullRequest,
  resolveGitHubReviewThread,
} from "./pull-request";

const pullRequestPayload = {
  author: { login: "alice" },
  baseRefName: "main",
  body: "Implements the feature.\n\n## Notes\n\nLong description.",
  headRefName: "feature",
  isDraft: false,
  mergeable: "MERGEABLE",
  mergeStateStatus: "BLOCKED",
  mergedAt: null,
  number: 42,
  reviewDecision: "",
  state: "OPEN",
  statusCheckRollup: [
    {
      __typename: "CheckRun",
      conclusion: "FAILURE",
      detailsUrl: "https://example.test/check",
      name: "typecheck",
      status: "COMPLETED",
    },
    {
      __typename: "CheckRun",
      conclusion: "FAILURE",
      detailsUrl: null,
      name: "preview",
      status: "COMPLETED",
    },
  ],
  title: "Feature",
  url: "https://github.com/acme/widgets/pull/42",
};

function statusRunner(calls: string[][]): GhRunner {
  return async (args) => {
    calls.push(args);
    if (args[0] === "pr") {
      return { stderr: "", stdout: JSON.stringify(pullRequestPayload) };
    }
    if (args[0] === "repo") {
      return {
        stderr: "",
        stdout: JSON.stringify({
          deleteBranchOnMerge: true,
          mergeCommitAllowed: false,
          nameWithOwner: "acme/widgets",
          rebaseMergeAllowed: true,
          squashMergeAllowed: true,
          viewerPermission: "WRITE",
        }),
      };
    }
    if (args.includes(".contexts")) {
      return { stderr: "", stdout: JSON.stringify(["typecheck"]) };
    }
    if (args.includes(".behind_by")) {
      return { stderr: "", stdout: "3\n" };
    }
    return {
      stderr: "",
      stdout: JSON.stringify({
        data: {
          repository: {
            pullRequest: {
              reviewThreads: {
                nodes: [
                  {
                    comments: {
                      nodes: [
                        {
                          author: { login: "bob" },
                          body: "Handle 404",
                          line: 7,
                          path: "src/api.ts",
                          url: "https://github.com/acme/widgets/pull/42#discussion_r1",
                        },
                      ],
                    },
                    id: "thread-1",
                    isOutdated: false,
                    isResolved: false,
                  },
                ],
              },
            },
          },
        },
      }),
    };
  };
}

describe("GitHub pull request operations", () => {
  it("combines repository policy, required checks, review threads and git state", async () => {
    const calls: string[][] = [];
    const result = await Effect.runPromise(
      getGitHubPullRequestStatus(
        { cwd: "/repos/widgets" },
        {
          isDirty: async () => true,
          runGh: statusRunner(calls),
          whichGh: async () => "/usr/bin/gh",
        },
      ),
    );

    expect(result).toMatchObject({
      allowedMergeMethods: ["squash", "rebase"],
      behindBy: 3,
      body: "Implements the feature.\n\n## Notes\n\nLong description.",
      defaultMergeMethod: "squash",
      deleteBranchOnMerge: true,
      viewerCanMerge: true,
      worktreeDirty: true,
      reviewDecision: null,
    });
    expect(result.checks).toEqual([
      expect.objectContaining({
        name: "typecheck",
        required: true,
        state: "failure",
      }),
      expect.objectContaining({ name: "preview", required: false }),
    ]);
    expect(result.unresolvedThreads).toEqual([
      expect.objectContaining({ id: "thread-1", path: "src/api.ts" }),
    ]);
    expect(calls.some((args) => args.includes(".behind_by"))).toBe(true);
  });

  it.each([
    "HTTP 403: Resource not accessible by integration",
    "HTTP 404: Branch protection not found",
  ])("keeps pull request status available when required checks cannot be read: %s", async (stderr) => {
    const baseRunner = statusRunner([]);
    const result = await Effect.runPromise(
      getGitHubPullRequestStatus(
        { cwd: "/repos/widgets" },
        {
          isDirty: async () => false,
          runGh: async (args, options) => {
            if (args.includes(".contexts")) throw { stderr };
            return baseRunner(args, options);
          },
          whichGh: async () => "/usr/bin/gh",
        },
      ),
    );

    expect(result.viewerCanMerge).toBe(true);
    expect(result.checks).toEqual([
      expect.objectContaining({ name: "typecheck", required: false }),
      expect.objectContaining({ name: "preview", required: false }),
    ]);
  });

  it("uses the selected merge method, branch deletion, and extended timeout", async () => {
    const calls: { args: string[]; timeoutMs?: number }[] = [];
    const runGh: GhRunner = async (args, options) => {
      calls.push({ args, timeoutMs: options?.timeoutMs });
      return args.includes("view")
        ? {
            stderr: "",
            stdout: JSON.stringify({
              state: "MERGED",
              url: "https://github.com/acme/widgets/pull/42",
            }),
          }
        : { stderr: "", stdout: "" };
    };

    await expect(
      Effect.runPromise(
        mergeGitHubPullRequest(
          {
            cwd: "/repos/widgets",
            deleteBranch: true,
            method: "rebase",
            number: 42,
          },
          { runGh, whichGh: async () => "/usr/bin/gh" },
        ),
      ),
    ).resolves.toEqual({
      merged: true,
      url: "https://github.com/acme/widgets/pull/42",
    });
    expect(calls[0]).toEqual({
      args: ["pr", "merge", "42", "--rebase", "--delete-branch"],
      timeoutMs: 60_000,
    });
  });

  it("maps permission failures and resolves review threads", async () => {
    const denied = await Effect.runPromiseExit(
      mergeGitHubPullRequest(
        { cwd: "/repos/widgets", method: "squash", number: 42 },
        {
          runGh: async () => {
            throw { stderr: "GraphQL: Resource not accessible by integration" };
          },
          whichGh: async () => "/usr/bin/gh",
        },
      ),
    );
    expect(Exit.isFailure(denied)).toBe(true);
    if (Exit.isFailure(denied)) {
      const failure = Cause.failureOption(denied.cause);
      expect(failure._tag === "Some" ? failure.value.code : null).toBe(
        "github-permission-denied",
      );
    }

    const resolved = await Effect.runPromise(
      resolveGitHubReviewThread(
        { cwd: "/repos/widgets", threadId: "thread-1" },
        {
          runGh: async () => ({
            stderr: "",
            stdout: JSON.stringify({
              data: {
                resolveReviewThread: { thread: { isResolved: true } },
              },
            }),
          }),
          whichGh: async () => "/usr/bin/gh",
        },
      ),
    );
    expect(resolved).toEqual({ resolved: true });
  });
});
