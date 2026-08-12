import { Cause, Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

import { DaemonError } from "../../../../../platform/errors";
import { listGitHubItems } from "./list";

const issuePayload = [
  {
    author: { login: "alice" },
    number: 1,
    state: "OPEN",
    title: "First issue",
    updatedAt: "2026-07-20T10:00:00Z",
    url: "https://github.com/acme/widgets/issues/1",
  },
];
const pullRequestPayload = [
  {
    author: null,
    isDraft: true,
    number: 7,
    state: "OPEN",
    title: "Add spinner",
    updatedAt: "2026-07-24T10:00:00Z",
    url: "https://github.com/acme/widgets/pull/7",
  },
];

function runner(calls: string[][] = []) {
  return async (args: string[], options?: { cwd?: string }) => {
    calls.push([...args, `cwd=${options?.cwd ?? ""}`]);
    return {
      stderr: "",
      stdout: JSON.stringify(
        args[0] === "issue" ? issuePayload : pullRequestPayload,
      ),
    };
  };
}

describe("listGitHubItems", () => {
  it("merges issues and pull requests sorted by last update", async () => {
    const calls: string[][] = [];
    const result = await Effect.runPromise(
      listGitHubItems(
        { cwd: "/repos/widgets" },
        { runGh: runner(calls), whichGh: async () => "/usr/bin/gh" },
      ),
    );

    expect(result.items.map((item) => item.number)).toEqual([7, 1]);
    expect(result.items[0]).toMatchObject({
      author: null,
      isDraft: true,
      kind: "pullRequest",
      owner: "acme",
      repo: "widgets",
      url: "https://github.com/acme/widgets/pull/7",
    });
    expect(result.items[1]).toMatchObject({
      author: "alice",
      kind: "issue",
      number: 1,
    });
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call).toContain("cwd=/repos/widgets");
      expect(call[call.indexOf("--search") + 1]).toBe("sort:updated-desc");
    }
  });

  it("forwards the search query to the GitHub CLI", async () => {
    const calls: string[][] = [];
    await Effect.runPromise(
      listGitHubItems(
        { cwd: "/repos/widgets", limit: 5, query: "  spinner  " },
        { runGh: runner(calls), whichGh: async () => "/usr/bin/gh" },
      ),
    );

    for (const call of calls) {
      expect(call).toContain("--search");
      expect(call[call.indexOf("--search") + 1]).toBe(
        "spinner sort:updated-desc",
      );
      expect(call[call.indexOf("--limit") + 1]).toBe("5");
    }
  });

  it("fails when the GitHub CLI is missing", async () => {
    const exit = await Effect.runPromiseExit(
      listGitHubItems(
        { cwd: "/repos/widgets" },
        { runGh: runner(), whichGh: async () => null },
      ),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      expect(failure._tag === "Some" && failure.value).toBeInstanceOf(
        DaemonError,
      );
      expect(failure._tag === "Some" ? failure.value.code : undefined).toBe(
        "source-control/cli-missing",
      );
    }
  });
});
