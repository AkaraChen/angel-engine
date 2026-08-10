import { Cause, Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

import {
  buildGitHubPrChecksFixPrompt,
  extractActionsRunId,
  listGitHubPrChecks,
  summarizeChecks,
} from "./checks";
import type { GhRunner } from "./gh-cli";

async function expectDaemonFailure(
  effect: Effect.Effect<unknown, { code: string }>,
  code: string,
) {
  const exit = await Effect.runPromiseExit(effect);
  expect(Exit.isFailure(exit)).toBe(true);
  if (!Exit.isFailure(exit)) return;
  const failure = Cause.failureOption(exit.cause);
  expect(failure._tag).toBe("Some");
  if (failure._tag === "Some") {
    expect(failure.value).toMatchObject({ code });
  }
}

const prPayload = {
  headRefName: "feature/spinner",
  number: 42,
  title: "Add spinner",
  url: "https://github.com/acme/widgets/pull/42",
};

const checksPayload = [
  {
    bucket: "pass",
    completedAt: "2026-08-09T10:00:00Z",
    description: "",
    link: "https://github.com/acme/widgets/actions/runs/100/job/1",
    name: "Typecheck",
    startedAt: "2026-08-09T09:59:00Z",
    state: "SUCCESS",
    workflow: "CI",
  },
  {
    bucket: "fail",
    completedAt: "2026-08-09T10:01:00Z",
    description: "Process completed with exit code 1.",
    link: "https://github.com/acme/widgets/actions/runs/101/job/2",
    name: "Test",
    startedAt: "2026-08-09T09:59:30Z",
    state: "FAILURE",
    workflow: "CI",
  },
  {
    bucket: "pending",
    completedAt: "0001-01-01T00:00:00Z",
    description: null,
    link: null,
    name: "Deploy",
    startedAt: "2026-08-09T10:00:30Z",
    state: "PENDING",
    workflow: "Deploy",
  },
];

function capturingRunner(stdout: string, exitCode = 0) {
  return async () => ({
    exitCode,
    stderr: "",
    stdout,
  });
}

function prAndChecksRunner(options?: {
  checksExitCode?: number;
  logBody?: string;
  noPr?: boolean;
}): GhRunner {
  return async (args) => {
    if (options?.noPr && args[0] === "pr" && args[1] === "view") {
      const error = new Error(
        'no pull requests found for branch "feature/spinner"',
      );
      (error as { stderr?: string }).stderr =
        'no pull requests found for branch "feature/spinner"';
      throw error;
    }
    if (args[0] === "pr" && args[1] === "view") {
      return { stderr: "", stdout: JSON.stringify(prPayload) };
    }
    if (args[0] === "run" && args[1] === "view") {
      return {
        stderr: "",
        stdout: options?.logBody ?? "FAIL test/foo.ts\nAssertionError: boom",
      };
    }
    throw new Error(`Unexpected gh args: ${args.join(" ")}`);
  };
}

describe("listGitHubPrChecks", () => {
  it("returns checks for the PR on the current branch", async () => {
    const result = await Effect.runPromise(
      listGitHubPrChecks(
        { cwd: "/repos/widgets" },
        {
          runGh: prAndChecksRunner(),
          runGhCapturing: capturingRunner(JSON.stringify(checksPayload), 1),
          whichGh: async () => "/usr/bin/gh",
        },
      ),
    );

    expect(result.hasPullRequest).toBe(true);
    expect(result.pullRequest).toEqual(prPayload);
    expect(result.checks).toHaveLength(3);
    expect(result.summary).toEqual({
      fail: 1,
      other: 0,
      pass: 1,
      pending: 1,
      total: 3,
    });
    expect(result.checks[1]).toMatchObject({
      bucket: "fail",
      name: "Test",
    });
    expect(result.checks[2]?.completedAt).toBeNull();
  });

  it("returns a clear empty state when no PR is bound", async () => {
    const result = await Effect.runPromise(
      listGitHubPrChecks(
        { cwd: "/repos/widgets" },
        {
          runGh: prAndChecksRunner({ noPr: true }),
          whichGh: async () => "/usr/bin/gh",
        },
      ),
    );

    expect(result).toEqual({
      checks: [],
      hasPullRequest: false,
      pullRequest: null,
      summary: { fail: 0, other: 0, pass: 0, pending: 0, total: 0 },
    });
  });

  it("fails when the GitHub CLI is missing", async () => {
    await expectDaemonFailure(
      listGitHubPrChecks(
        { cwd: "/repos/widgets" },
        { whichGh: async () => null },
      ),
      "github-cli-missing",
    );
  });
});

describe("buildGitHubPrChecksFixPrompt", () => {
  it("builds a truncated fix prompt with failed check logs", async () => {
    const longLog = "e".repeat(10_000);
    const result = await Effect.runPromise(
      buildGitHubPrChecksFixPrompt(
        { cwd: "/repos/widgets" },
        {
          runGh: prAndChecksRunner({ logBody: longLog }),
          runGhCapturing: capturingRunner(JSON.stringify(checksPayload), 1),
          whichGh: async () => "/usr/bin/gh",
        },
      ),
    );

    expect(result.failedCheckNames).toEqual(["Test"]);
    expect(result.pullRequest.number).toBe(42);
    expect(result.prompt).toContain("CI checks failed");
    expect(result.prompt).toContain("#42");
    expect(result.prompt).toContain("Test");
    expect(result.prompt).toContain("[Truncated:");
    expect(result.prompt.length).toBeLessThan(20_000);
  });

  it("rejects when there are no failed checks", async () => {
    const onlyPassing = checksPayload.filter(
      (check) => check.bucket === "pass",
    );
    await expectDaemonFailure(
      buildGitHubPrChecksFixPrompt(
        { cwd: "/repos/widgets" },
        {
          runGh: prAndChecksRunner(),
          runGhCapturing: capturingRunner(JSON.stringify(onlyPassing)),
          whichGh: async () => "/usr/bin/gh",
        },
      ),
      "invalid-request",
    );
  });
});

describe("extractActionsRunId", () => {
  it("parses run ids from GitHub Actions URLs", () => {
    expect(
      extractActionsRunId(
        "https://github.com/acme/widgets/actions/runs/31320948060/job/1",
      ),
    ).toBe("31320948060");
    expect(extractActionsRunId(null)).toBeNull();
    expect(extractActionsRunId("https://example.com/runs/1")).toBeNull();
  });
});

describe("summarizeChecks", () => {
  it("counts buckets", () => {
    expect(
      summarizeChecks([
        {
          bucket: "pass",
          completedAt: null,
          description: null,
          link: null,
          name: "a",
          startedAt: null,
          state: "SUCCESS",
          workflow: null,
        },
        {
          bucket: "fail",
          completedAt: null,
          description: null,
          link: null,
          name: "b",
          startedAt: null,
          state: "FAILURE",
          workflow: null,
        },
        {
          bucket: "skipping",
          completedAt: null,
          description: null,
          link: null,
          name: "c",
          startedAt: null,
          state: "SKIPPED",
          workflow: null,
        },
      ]),
    ).toEqual({ fail: 1, other: 1, pass: 1, pending: 0, total: 3 });
  });
});
