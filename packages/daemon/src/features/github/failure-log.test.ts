import { Cause, Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

import {
  FAILURE_LOG_TAIL_LINES,
  fetchGitHubFailureLog,
  tailFailureLog,
} from "./failure-log";

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

describe("tailFailureLog", () => {
  it("returns all lines when under the cap", () => {
    const result = tailFailureLog("a\nb\nc", 10);
    expect(result).toEqual({ lines: ["a", "b", "c"], truncated: false });
  });

  it(`keeps only the last ${FAILURE_LOG_TAIL_LINES} lines`, () => {
    const lines = Array.from({ length: 50 }, (_, i) => `line-${i + 1}`);
    const result = tailFailureLog(lines.join("\n"));
    expect(result.truncated).toBe(true);
    expect(result.lines).toHaveLength(FAILURE_LOG_TAIL_LINES);
    expect(result.lines[0]).toBe("line-11");
    expect(result.lines.at(-1)).toBe("line-50");
  });
});

describe("fetchGitHubFailureLog", () => {
  it("invokes gh run view --log-failed via the injected runner", async () => {
    let seenArgs: string[] | undefined;
    const result = await Effect.runPromise(
      fetchGitHubFailureLog(
        { cwd: "/tmp/repo", runId: 12345 },
        {
          runGh: async (args) => {
            seenArgs = args;
            return {
              stderr: "",
              stdout: "job1\tFAIL\nerror: boom\nstack: …\n",
            };
          },
          whichGh: async () => "/bin/gh",
        },
      ),
    );

    expect(seenArgs).toEqual(["run", "view", "12345", "--log-failed"]);
    expect(result.lines).toContain("error: boom");
    expect(result.truncated).toBe(false);
  });

  it("maps unauthenticated failures", async () => {
    await expectDaemonFailure(
      fetchGitHubFailureLog(
        { cwd: "/tmp/repo", runId: "9" },
        {
          runGh: async () => {
            const error = new Error("gh failed") as Error & { stderr: string };
            error.stderr = "gh auth login";
            throw error;
          },
          whichGh: async () => "/bin/gh",
        },
      ),
      "github-cli-unauthenticated",
    );
  });
});
