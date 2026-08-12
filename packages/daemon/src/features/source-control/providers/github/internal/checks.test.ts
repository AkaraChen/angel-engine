import { describe, expect, it } from "vitest";

import {
  buildGitHubCheckSummary,
  fetchGitHubCheckFailureLog,
  parseGitHubCheckAttempt,
  tailFailureLog,
} from "./checks";

const repository = {
  providerId: "github",
  host: "github.com",
  namespace: ["acme"],
  name: "widgets",
  remoteId: null,
  displayPath: "acme/widgets",
  webUrl: "https://github.com/acme/widgets",
};
const context = {
  deadline: Date.now() + 30_000,
  signal: new AbortController().signal,
};

function rollup(nodes: unknown[], oid = "abc123") {
  return {
    data: {
      repository: {
        pullRequest: {
          commits: {
            nodes: [
              {
                commit: {
                  oid,
                  statusCheckRollup:
                    nodes.length === 0 ? null : { contexts: { nodes } },
                },
              },
            ],
          },
        },
      },
    },
  };
}

describe("buildGitHubCheckSummary", () => {
  it("maps required, optional, pending, and workflow metadata", () => {
    const summary = buildGitHubCheckSummary(
      rollup([
        {
          __typename: "CheckRun",
          checkSuite: {
            workflowRun: { databaseId: 9001, workflow: { name: "CI" } },
          },
          completedAt: "2026-08-12T00:01:00Z",
          conclusion: "FAILURE",
          databaseId: 111,
          detailsUrl:
            "https://github.com/acme/widgets/actions/runs/9001/attempts/2",
          isRequired: true,
          name: "test",
          startedAt: "2026-08-12T00:00:00Z",
          status: "COMPLETED",
        },
        {
          __typename: "CheckRun",
          conclusion: null,
          databaseId: 222,
          detailsUrl: null,
          isRequired: false,
          name: "deploy",
          status: "IN_PROGRESS",
        },
      ]),
    );

    expect(summary).toMatchObject({
      hasPending: true,
      headOid: "abc123",
      requiredAllGreen: false,
    });
    expect(summary.failedBlocking.map((check) => check.name)).toEqual(["test"]);
    expect(summary.checks[0]).toMatchObject({
      attempt: 2,
      blocking: true,
      conclusion: "failure",
      group: { kind: "workflow-run", name: "CI" },
      id: "111",
      name: "test",
      requiredness: "required",
      status: "completed",
    });
    expect(summary.checks[0]?.logRef).toEqual({
      jobId: "111",
      kind: "workflow-run",
      runId: "9001",
    });
  });

  it("keeps logical fingerprint fields stable across attempts", () => {
    const first = buildGitHubCheckSummary(
      rollup([
        {
          __typename: "CheckRun",
          checkSuite: {
            workflowRun: { databaseId: 1, workflow: { name: "CI" } },
          },
          conclusion: "FAILURE",
          databaseId: 10,
          detailsUrl: "https://github.com/acme/widgets/actions/runs/1",
          isRequired: true,
          name: "test",
          status: "COMPLETED",
        },
      ]),
    ).checks[0];
    const retry = buildGitHubCheckSummary(
      rollup([
        {
          __typename: "CheckRun",
          checkSuite: {
            workflowRun: { databaseId: 2, workflow: { name: "CI" } },
          },
          conclusion: "SUCCESS",
          databaseId: 20,
          detailsUrl:
            "https://github.com/acme/widgets/actions/runs/2/attempts/2",
          isRequired: true,
          name: "test",
          status: "COMPLETED",
        },
      ]),
    ).checks[0];

    expect([
      first?.group?.kind,
      first?.group?.name,
      first?.group?.stage,
      first?.name,
    ]).toEqual([
      retry?.group?.kind,
      retry?.group?.name,
      retry?.group?.stage,
      retry?.name,
    ]);
    expect(first?.id).not.toBe(retry?.id);
    expect(first?.attempt).not.toBe(retry?.attempt);
    expect(first?.conclusion).not.toBe(retry?.conclusion);
  });

  it("maps commit status contexts without inventing workflow identity", () => {
    const summary = buildGitHubCheckSummary(
      rollup([
        {
          __typename: "StatusContext",
          context: "external/build",
          isRequired: true,
          state: "SUCCESS",
          targetUrl: "https://ci.example/build/1",
        },
      ]),
    );
    expect(summary.requiredAllGreen).toBe(true);
    expect(summary.checks[0]).toMatchObject({
      group: null,
      name: "external/build",
      conclusion: "success",
      status: "completed",
    });
  });
});

describe("failure logs", () => {
  it("uses repository-scoped workflow log references", async () => {
    let args: string[] = [];
    const result = await fetchGitHubCheckFailureLog(
      {
        logRef: { kind: "workflow-run", runId: "9001", jobId: "111" },
        repository,
        tailLines: 2,
      },
      context,
      {
        findGh: async () => "/usr/bin/gh",
        runGh: async (seen) => {
          args = seen;
          return { stderr: "", stdout: "a\nb\nc" };
        },
      },
    );
    expect(args).toEqual([
      "run",
      "view",
      "9001",
      "--repo",
      "acme/widgets",
      "--log-failed",
    ]);
    expect(result).toEqual({ text: "b\nc", truncated: true });
  });

  it("parses attempts and preserves short logs", () => {
    expect(
      parseGitHubCheckAttempt(
        "https://github.com/a/b/actions/runs/1/attempts/3",
      ),
    ).toBe(3);
    expect(parseGitHubCheckAttempt(null)).toBe(1);
    expect(tailFailureLog("a\nb", 3)).toEqual({
      text: "a\nb",
      truncated: false,
    });
  });
});
