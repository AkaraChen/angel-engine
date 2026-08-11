import type {
  GitHubCheckItem,
  GitHubChecksInput,
  GitHubChecksSnapshot,
} from "@angel-engine/daemon-api/github";
import is from "@sindresorhus/is";
import { type as arkType } from "arktype";
import { Effect } from "effect";

import { DaemonError } from "../../platform/errors";
import { findGhPath, type GhRunner, mapGhFailure, runGhCli } from "./gh-cli";

/**
 * Why GraphQL instead of `gh pr view --json statusCheckRollup`:
 * The CLI export only returns name/status/conclusion/detailsUrl/workflowName.
 * It drops `isRequired`, `databaseId`, and any attempt marker — all required for
 * shepherd fingerprints and "required checks only" green logic. We call
 * `gh api graphql` so the public snapshot still matches the design contract.
 */

const prIdPayloadSchema = arkType({
  "+": "ignore",
  data: {
    "+": "ignore",
    repository: arkType({
      "+": "ignore",
      pullRequest: arkType({
        "+": "ignore",
        id: "string > 0",
      }).or("null"),
    }).or("null"),
  },
});

const checkRunNodeSchema = arkType({
  "+": "ignore",
  __typename: "'CheckRun'",
  "checkSuite?": arkType({
    "+": "ignore",
    "workflowRun?": arkType({
      "+": "ignore",
      "databaseId?": "number | null",
      "workflow?": arkType({
        "+": "ignore",
        "name?": "string | null",
      }).or("null"),
    }).or("null"),
  }).or("null"),
  "conclusion?": "string | null",
  "databaseId?": "number | null",
  "detailsUrl?": "string | null",
  isRequired: "boolean",
  name: "string > 0",
  status: "string > 0",
});

const statusContextNodeSchema = arkType({
  "+": "ignore",
  __typename: "'StatusContext'",
  context: "string > 0",
  isRequired: "boolean",
  state: "string > 0",
  "targetUrl?": "string | null",
});

const rollupPayloadSchema = arkType({
  "+": "ignore",
  data: {
    "+": "ignore",
    repository: arkType({
      "+": "ignore",
      pullRequest: arkType({
        "+": "ignore",
        commits: {
          "+": "ignore",
          nodes: arkType({
            "+": "ignore",
            commit: {
              "+": "ignore",
              oid: "string > 0",
              "statusCheckRollup?": arkType({
                "+": "ignore",
                contexts: {
                  "+": "ignore",
                  nodes: "unknown[]",
                },
              }).or("null"),
            },
          }).array(),
        },
      }).or("null"),
    }).or("null"),
  },
});

const PR_ID_QUERY = `
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      id
    }
  }
}
`.trim();

const CHECKS_QUERY = `
query($owner: String!, $name: String!, $number: Int!, $prId: ID!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      commits(last: 1) {
        nodes {
          commit {
            oid
            statusCheckRollup {
              contexts(first: 100) {
                nodes {
                  __typename
                  ... on CheckRun {
                    databaseId
                    name
                    status
                    conclusion
                    detailsUrl
                    isRequired(pullRequestId: $prId)
                    checkSuite {
                      workflowRun {
                        databaseId
                        workflow { name }
                      }
                    }
                  }
                  ... on StatusContext {
                    context
                    state
                    targetUrl
                    isRequired(pullRequestId: $prId)
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
`.trim();

const FAILING_CONCLUSIONS = new Set([
  "FAILURE",
  "TIMED_OUT",
  "CANCELLED",
  "ACTION_REQUIRED",
  "STARTUP_FAILURE",
  "ERROR",
]);

const PENDING_CHECK_STATUSES = new Set([
  "QUEUED",
  "IN_PROGRESS",
  "PENDING",
  "REQUESTED",
  "WAITING",
  "EXPECTED",
]);

const PENDING_STATUS_STATES = new Set(["PENDING", "EXPECTED"]);

export function fetchGitHubChecks(
  input: GitHubChecksInput,
  deps: {
    runGh?: GhRunner;
    whichGh?: () => Promise<string | null>;
  } = {},
): Effect.Effect<GitHubChecksSnapshot, DaemonError> {
  return Effect.gen(function* () {
    const runGh = yield* requireGh(deps);
    if (!isValidPrContext(input)) {
      return yield* Effect.fail(
        DaemonError.invalidRequest("owner, repo, and prNumber are required."),
      );
    }

    const prIdJson = yield* runGraphql(runGh, input.cwd, PR_ID_QUERY, {
      name: input.repo,
      number: input.prNumber,
      owner: input.owner,
    });
    const prIdPayload = prIdPayloadSchema(prIdJson);
    if (prIdPayload instanceof arkType.errors) {
      return yield* Effect.fail(unexpectedPayload(prIdPayload.summary));
    }
    const prId = prIdPayload.data.repository?.pullRequest?.id;
    if (!is.nonEmptyString(prId)) {
      return yield* Effect.fail(DaemonError.sourceControlItemNotFound());
    }

    const rollupJson = yield* runGraphql(runGh, input.cwd, CHECKS_QUERY, {
      name: input.repo,
      number: input.prNumber,
      owner: input.owner,
      prId,
    });
    return yield* Effect.try({
      catch: (cause) =>
        cause instanceof DaemonError
          ? cause
          : DaemonError.sourceControlFetchFailed(cause),
      try: () => buildSnapshot(rollupJson),
    });
  });
}

/** Pure: map a GraphQL rollup payload into the public snapshot. */
export function buildChecksSnapshotFromGraphql(
  json: unknown,
): GitHubChecksSnapshot {
  return buildSnapshot(json);
}

function buildSnapshot(json: unknown): GitHubChecksSnapshot {
  const payload = rollupPayloadSchema(json);
  if (payload instanceof arkType.errors) {
    throw unexpectedPayload(payload.summary);
  }
  const pr = payload.data.repository?.pullRequest;
  if (!pr) {
    throw DaemonError.sourceControlItemNotFound();
  }
  const commitNode = pr.commits.nodes[0]?.commit;
  const headOid = commitNode?.oid ?? null;
  const nodes = commitNode?.statusCheckRollup?.contexts.nodes ?? [];
  const checks = nodes.map(mapContextNode);

  const hasPending = checks.some((check) => check.isPending);
  const failed = checks.filter(
    (check) => !check.isPending && isFailingConclusion(check.conclusion),
  );
  const failedRequired = failed.filter((check) => check.isRequired);
  const required = checks.filter((check) => check.isRequired);
  // Vacuously true when the PR has no required checks.
  const requiredAllGreen =
    !required.some((check) => check.isPending) && failedRequired.length === 0;

  return {
    checks,
    failed,
    failedRequired,
    hasPending,
    headOid,
    requiredAllGreen,
  };
}

function mapContextNode(node: unknown): GitHubCheckItem {
  if (
    is.object(node) &&
    (node as { __typename?: string }).__typename === "CheckRun"
  ) {
    const parsed = checkRunNodeSchema(node);
    if (parsed instanceof arkType.errors) {
      throw unexpectedPayload(parsed.summary);
    }
    const isPending = PENDING_CHECK_STATUSES.has(parsed.status.toUpperCase());
    const conclusion = parsed.conclusion?.toUpperCase() ?? null;
    const detailsUrl = parsed.detailsUrl ?? null;
    const workflowRunId =
      parsed.checkSuite?.workflowRun?.databaseId != null
        ? String(parsed.checkSuite.workflowRun.databaseId)
        : null;
    return {
      attempt: parseAttempt(detailsUrl),
      checkRunId: parsed.databaseId != null ? String(parsed.databaseId) : null,
      conclusion: isPending ? null : conclusion,
      detailsUrl,
      isPending,
      isRequired: parsed.isRequired,
      name: parsed.name,
      status: parsed.status.toUpperCase(),
      workflowName: parsed.checkSuite?.workflowRun?.workflow?.name ?? null,
      workflowRunId,
    };
  }

  const parsed = statusContextNodeSchema(node);
  if (parsed instanceof arkType.errors) {
    throw unexpectedPayload(parsed.summary);
  }
  const state = parsed.state.toUpperCase();
  const isPending = PENDING_STATUS_STATES.has(state);
  return {
    attempt: 1,
    checkRunId: null,
    conclusion: isPending ? null : state,
    detailsUrl: parsed.targetUrl ?? null,
    isPending,
    isRequired: parsed.isRequired,
    name: parsed.context,
    status: state,
    workflowName: null,
    workflowRunId: null,
  };
}

function isFailingConclusion(conclusion: string | null): boolean {
  if (!is.nonEmptyString(conclusion)) return false;
  return FAILING_CONCLUSIONS.has(conclusion.toUpperCase());
}

/** Extract `/attempts/N` from a GitHub Actions details URL when present. */
export function parseAttempt(detailsUrl: string | null): number {
  if (!is.nonEmptyString(detailsUrl)) return 1;
  const match = detailsUrl.match(/\/attempts\/(\d+)/);
  if (match?.[1] === undefined) return 1;
  const attempt = Number(match[1]);
  return Number.isInteger(attempt) && attempt > 0 ? attempt : 1;
}

function runGraphql(
  runGh: GhRunner,
  cwd: string,
  query: string,
  variables: Record<string, string | number>,
): Effect.Effect<unknown, DaemonError> {
  return Effect.gen(function* () {
    const args = ["api", "graphql", "-f", `query=${query}`];
    for (const [key, value] of Object.entries(variables)) {
      if (typeof value === "number") {
        args.push("-F", `${key}=${value}`);
      } else {
        args.push("-f", `${key}=${value}`);
      }
    }
    const output = yield* Effect.tryPromise({
      catch: (cause) => mapGhFailure(cause),
      try: () => runGh(args, { cwd }),
    });
    return yield* Effect.try({
      catch: (cause) =>
        DaemonError.sourceControlFetchFailed(
          cause,
          "GitHub CLI returned invalid JSON.",
        ),
      try: () => JSON.parse(output.stdout) as unknown,
    });
  });
}

function requireGh(deps: {
  runGh?: GhRunner;
  whichGh?: () => Promise<string | null>;
}): Effect.Effect<GhRunner, DaemonError> {
  return Effect.gen(function* () {
    const whichGh = deps.whichGh ?? findGhPath;
    const ghPath = yield* Effect.tryPromise({
      catch: (cause) => DaemonError.sourceControlFetchFailed(cause),
      try: whichGh,
    });
    if (!is.nonEmptyString(ghPath)) {
      return yield* Effect.fail(DaemonError.sourceControlCliMissing());
    }
    return deps.runGh ?? runGhCli;
  });
}

function isValidPrContext(input: GitHubChecksInput): boolean {
  return (
    is.nonEmptyString(input.owner) &&
    is.nonEmptyString(input.repo) &&
    Number.isInteger(input.prNumber) &&
    input.prNumber > 0
  );
}

function unexpectedPayload(details: string): DaemonError {
  return DaemonError.sourceControlFetchFailed(
    new TypeError(`Unexpected GitHub GraphQL payload: ${details}`),
  );
}
