import { Cause, Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

import { DaemonError } from "../../platform/errors";
import {
  createPullRequest,
  listPullRequests,
  viewPullRequest,
} from "./pull-requests";

const listPayload = [
  {
    author: { login: "alice" },
    baseRefName: "main",
    headRefName: "feat/spinner",
    isDraft: false,
    number: 7,
    state: "OPEN",
    title: "Add spinner",
    updatedAt: "2026-07-24T10:00:00Z",
    url: "https://github.com/acme/widgets/pull/7",
  },
];

const detailPayload = {
  ...listPayload[0],
  additions: 120,
  body: "PR body",
  changedFiles: 8,
  comments: [
    {
      author: { login: "bob" },
      body: "Looks good",
      createdAt: "2026-07-24T11:00:00Z",
      id: "IC_1",
      url: "https://github.com/acme/widgets/pull/7#issuecomment-1",
    },
  ],
  commits: [{ oid: "abc" }, { oid: "def" }],
  deletions: 35,
};

function runner(calls: string[][] = [], stdout = JSON.stringify(listPayload)) {
  return async (args: string[], options?: { cwd?: string }) => {
    calls.push([...args, `cwd=${options?.cwd ?? ""}`]);
    return { stderr: "", stdout };
  };
}

describe("listPullRequests", () => {
  it("lists open pull requests via gh", async () => {
    const calls: string[][] = [];
    const result = await Effect.runPromise(
      listPullRequests(
        { cwd: "/repos/widgets" },
        { runGh: runner(calls), whichGh: async () => "/usr/bin/gh" },
      ),
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      author: "alice",
      baseRefName: "main",
      headRefName: "feat/spinner",
      number: 7,
      owner: "acme",
      repo: "widgets",
    });
    expect(calls[0]?.slice(0, 3)).toEqual(["pr", "list", "--state"]);
  });

  it("fails when gh is missing", async () => {
    const exit = await Effect.runPromiseExit(
      listPullRequests(
        { cwd: "/repos/widgets" },
        { runGh: runner(), whichGh: async () => null },
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      expect(
        failure._tag === "Some" ? failure.value : undefined,
      ).toBeInstanceOf(DaemonError);
    }
  });
});

describe("viewPullRequest", () => {
  it("returns detail and comments", async () => {
    const result = await Effect.runPromise(
      viewPullRequest(
        { cwd: "/repos/widgets", number: 7 },
        {
          runGh: runner([], JSON.stringify(detailPayload)),
          whichGh: async () => "/usr/bin/gh",
        },
      ),
    );

    expect(result.body).toBe("PR body");
    expect(result).toMatchObject({
      additions: 120,
      changedFiles: 8,
      commitCount: 2,
      deletions: 35,
    });
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0]?.author).toBe("bob");
  });
});

describe("createPullRequest", () => {
  it("creates a pull request with title and body", async () => {
    const calls: string[][] = [];
    const result = await Effect.runPromise(
      createPullRequest(
        {
          body: "## Summary\n",
          cwd: "/repos/widgets",
          title: "Add spinner",
        },
        {
          runGh: runner(
            calls,
            JSON.stringify({
              number: 9,
              url: "https://github.com/acme/widgets/pull/9",
            }),
          ),
          whichGh: async () => "/usr/bin/gh",
        },
      ),
    );

    expect(result).toEqual({
      number: 9,
      url: "https://github.com/acme/widgets/pull/9",
    });
    expect(calls[0]).toContain("--title");
    expect(calls[0]).toContain("Add spinner");
    expect(calls[0]).toContain("--body");
  });
});
