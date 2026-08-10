import { Cause, Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

import {
  buildChecksSnapshotFromGraphql,
  fetchGitHubChecks,
  parseAttempt,
} from "./checks-snapshot";
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

const BASE_INPUT = {
  cwd: "/tmp/repo",
  owner: "acme",
  prNumber: 12,
  repo: "widgets",
};

function prIdResponse() {
  return {
    data: {
      repository: {
        pullRequest: { id: "PR_kwDOTestId" },
      },
    },
  };
}

function rollupResponse(nodes: unknown[], headOid = "abc123") {
  return {
    data: {
      repository: {
        pullRequest: {
          commits: {
            nodes: [
              {
                commit: {
                  oid: headOid,
                  statusCheckRollup:
                    nodes.length === 0
                      ? null
                      : {
                          contexts: { nodes },
                        },
                },
              },
            ],
          },
        },
      },
    },
  };
}

function sequentialRunner(responses: unknown[]): GhRunner {
  let index = 0;
  return async () => {
    const next = responses[index] ?? responses.at(-1);
    index += 1;
    return { stderr: "", stdout: JSON.stringify(next) };
  };
}

describe("parseAttempt", () => {
  it("reads /attempts/N from Actions URLs", () => {
    expect(
      parseAttempt(
        "https://github.com/acme/widgets/actions/runs/99/attempts/3",
      ),
    ).toBe(3);
    expect(
      parseAttempt("https://github.com/acme/widgets/actions/runs/99"),
    ).toBe(1);
    expect(parseAttempt(null)).toBe(1);
  });
});

describe("buildChecksSnapshotFromGraphql", () => {
  it("marks all required green when every required check succeeded", () => {
    const snapshot = buildChecksSnapshotFromGraphql(
      rollupResponse([
        {
          __typename: "CheckRun",
          checkSuite: {
            workflowRun: {
              databaseId: 9001,
              workflow: { name: "CI" },
            },
          },
          conclusion: "SUCCESS",
          databaseId: 111,
          detailsUrl:
            "https://github.com/acme/widgets/actions/runs/9001/attempts/2",
          isRequired: true,
          name: "build",
          status: "COMPLETED",
        },
        {
          __typename: "CheckRun",
          checkSuite: {
            workflowRun: {
              databaseId: 9002,
              workflow: { name: "CI" },
            },
          },
          conclusion: "SUCCESS",
          databaseId: 222,
          detailsUrl: "https://github.com/acme/widgets/actions/runs/9002",
          isRequired: false,
          name: "lint-extra",
          status: "COMPLETED",
        },
      ]),
    );

    expect(snapshot.hasPending).toBe(false);
    expect(snapshot.requiredAllGreen).toBe(true);
    expect(snapshot.failed).toEqual([]);
    expect(snapshot.checks[0]).toMatchObject({
      attempt: 2,
      checkRunId: "111",
      isRequired: true,
      name: "build",
      workflowRunId: "9001",
    });
  });

  it("treats required red + optional green as not all-green", () => {
    const snapshot = buildChecksSnapshotFromGraphql(
      rollupResponse([
        {
          __typename: "CheckRun",
          conclusion: "FAILURE",
          databaseId: 1,
          detailsUrl: null,
          isRequired: true,
          name: "build",
          status: "COMPLETED",
        },
        {
          __typename: "CheckRun",
          conclusion: "SUCCESS",
          databaseId: 2,
          detailsUrl: null,
          isRequired: false,
          name: "docs",
          status: "COMPLETED",
        },
      ]),
    );

    expect(snapshot.requiredAllGreen).toBe(false);
    expect(snapshot.failedRequired.map((c) => c.name)).toEqual(["build"]);
    expect(snapshot.failed.map((c) => c.name)).toEqual(["build"]);
  });

  it("ignores optional red for requiredAllGreen", () => {
    const snapshot = buildChecksSnapshotFromGraphql(
      rollupResponse([
        {
          __typename: "CheckRun",
          conclusion: "SUCCESS",
          databaseId: 1,
          detailsUrl: null,
          isRequired: true,
          name: "build",
          status: "COMPLETED",
        },
        {
          __typename: "CheckRun",
          conclusion: "FAILURE",
          databaseId: 2,
          detailsUrl: null,
          isRequired: false,
          name: "optional-flaky",
          status: "COMPLETED",
        },
      ]),
    );

    expect(snapshot.requiredAllGreen).toBe(true);
    expect(snapshot.failed.map((c) => c.name)).toEqual(["optional-flaky"]);
    expect(snapshot.failedRequired).toEqual([]);
  });

  it("flags pending checks", () => {
    const snapshot = buildChecksSnapshotFromGraphql(
      rollupResponse([
        {
          __typename: "CheckRun",
          conclusion: null,
          databaseId: 1,
          detailsUrl: null,
          isRequired: true,
          name: "build",
          status: "IN_PROGRESS",
        },
      ]),
    );

    expect(snapshot.hasPending).toBe(true);
    expect(snapshot.requiredAllGreen).toBe(false);
    expect(snapshot.checks[0]?.isPending).toBe(true);
    expect(snapshot.checks[0]?.conclusion).toBeNull();
  });

  it("handles no checks", () => {
    const snapshot = buildChecksSnapshotFromGraphql(rollupResponse([]));
    expect(snapshot.checks).toEqual([]);
    expect(snapshot.hasPending).toBe(false);
    expect(snapshot.requiredAllGreen).toBe(true);
    expect(snapshot.headOid).toBe("abc123");
  });
});

describe("fetchGitHubChecks", () => {
  it("resolves through injected GhRunner fixtures", async () => {
    const result = await Effect.runPromise(
      fetchGitHubChecks(BASE_INPUT, {
        runGh: sequentialRunner([
          prIdResponse(),
          rollupResponse([
            {
              __typename: "CheckRun",
              conclusion: "SUCCESS",
              databaseId: 42,
              detailsUrl: null,
              isRequired: true,
              name: "test",
              status: "COMPLETED",
            },
          ]),
        ]),
        whichGh: async () => "/usr/local/bin/gh",
      }),
    );

    expect(result.requiredAllGreen).toBe(true);
    expect(result.checks[0]?.checkRunId).toBe("42");
  });

  it("maps unauthenticated failures", async () => {
    await expectDaemonFailure(
      fetchGitHubChecks(BASE_INPUT, {
        runGh: async () => {
          const error = new Error("gh failed") as Error & { stderr: string };
          error.stderr =
            "To get started with GitHub CLI, please run: gh auth login";
          throw error;
        },
        whichGh: async () => "/bin/gh",
      }),
      "github-cli-unauthenticated",
    );
  });

  it("fails when gh is missing", async () => {
    await expectDaemonFailure(
      fetchGitHubChecks(BASE_INPUT, { whichGh: async () => null }),
      "github-cli-missing",
    );
  });
});
