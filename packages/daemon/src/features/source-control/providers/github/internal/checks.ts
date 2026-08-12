import type {
  CheckLogRef,
  CheckRun,
  CheckRunConclusion,
  CheckRunStatus,
  ChecksFixPromptInput,
  ChecksFixPromptResult,
  CheckSummary,
  FailureLogInput,
  FailureLogResult,
  NumberedItemInput,
  ProviderOperationContext,
  RepositoryIdentity,
} from "@angel-engine/daemon-api/source-control";
import is from "@sindresorhus/is";
import { type as arkType } from "arktype";

import { DaemonError } from "../../../../../platform/errors";
import { truncateBody } from "./resolve";
import {
  findGhPath,
  type GhRunner,
  mapGhFailure,
  normalizeText,
  runGhCli,
} from "./gh-cli";
import { getGitHubChangeRequest } from "./change-requests";

export interface GitHubChecksDependencies {
  findGh?: () => Promise<string | null>;
  runGh?: GhRunner;
}

const positiveInteger = arkType("number.integer > 0");
const prIdPayloadSchema = arkType({
  "+": "ignore",
  data: {
    "+": "ignore",
    repository: arkType({
      "+": "ignore",
      pullRequest: arkType({ "+": "ignore", id: "string > 0" }).or("null"),
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
  "completedAt?": "string | null",
  "conclusion?": "string | null",
  "databaseId?": "number | null",
  "detailsUrl?": "string | null",
  isRequired: "boolean",
  name: "string > 0",
  "startedAt?": "string | null",
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
                contexts: { "+": "ignore", nodes: "unknown[]" },
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
    pullRequest(number: $number) { id }
  }
}`.trim();

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
                    databaseId name status conclusion detailsUrl startedAt completedAt
                    isRequired(pullRequestId: $prId)
                    checkSuite { workflowRun { databaseId workflow { name } } }
                  }
                  ... on StatusContext {
                    context state targetUrl isRequired(pullRequestId: $prId)
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}`.trim();

const FAILURE_LOG_TAIL_LINES = 40;
const LOG_PER_CHECK_MAX_CHARS = 4_000;
const LOG_TOTAL_MAX_CHARS = 12_000;
const MAX_FAILED_LOGS = 5;

export async function listGitHubChecks(
  input: NumberedItemInput,
  context: ProviderOperationContext,
  dependencies: GitHubChecksDependencies = {},
): Promise<readonly CheckRun[]> {
  return (await snapshotGitHubChecks(input, context, dependencies)).checks;
}

export async function snapshotGitHubChecks(
  input: NumberedItemInput,
  _context: ProviderOperationContext,
  dependencies: GitHubChecksDependencies = {},
): Promise<CheckSummary> {
  const repository = requireGitHubRepository(input.repository);
  const number = requireNumber(input.id);
  const runGh = await requireGh(dependencies);
  const variables = {
    name: repository.name,
    number,
    owner: repository.namespace[0] ?? "",
  };
  const prIdPayload = prIdPayloadSchema(
    await runGraphql(runGh, PR_ID_QUERY, variables),
  );
  if (prIdPayload instanceof arkType.errors) {
    throw unexpectedPayload(prIdPayload.summary);
  }
  const prId = prIdPayload.data.repository?.pullRequest?.id;
  if (!is.nonEmptyString(prId)) throw DaemonError.sourceControlItemNotFound();
  return buildGitHubCheckSummary(
    await runGraphql(runGh, CHECKS_QUERY, { ...variables, prId }),
  );
}

export async function fetchGitHubCheckFailureLog(
  input: FailureLogInput,
  _context: ProviderOperationContext,
  dependencies: GitHubChecksDependencies = {},
): Promise<FailureLogResult> {
  const repository = requireGitHubRepository(input.repository);
  const runGh = await requireGh(dependencies);
  const args = failureLogArgs(input.logRef, repository);
  let output: { stderr: string; stdout: string };
  try {
    output = await runGh(args);
  } catch (cause) {
    throw mapGhFailure(cause);
  }
  return tailFailureLog(output.stdout, input.tailLines);
}

export async function buildGitHubChecksFixPrompt(
  input: ChecksFixPromptInput,
  context: ProviderOperationContext,
  dependencies: GitHubChecksDependencies = {},
): Promise<ChecksFixPromptResult> {
  const [changeRequest, checks] = await Promise.all([
    getGitHubChangeRequest(input, context, dependencies),
    snapshotGitHubChecks(input, context, dependencies),
  ]);
  if (checks.failed.length === 0) {
    throw DaemonError.invalidRequest("No failed checks to fix.");
  }
  const sections: string[] = [];
  let remaining = LOG_TOTAL_MAX_CHARS;
  for (const check of checks.failed.slice(0, MAX_FAILED_LOGS)) {
    if (remaining <= 0) break;
    let text = "(no provider log available)";
    if (check.logRef !== null) {
      try {
        text = (
          await fetchGitHubCheckFailureLog(
            {
              repository: input.repository,
              logRef: check.logRef,
              tailLines: FAILURE_LOG_TAIL_LINES,
            },
            context,
            dependencies,
          )
        ).text;
      } catch (cause) {
        text = normalizeText(
          cause instanceof Error ? cause.message : String(cause),
        );
      }
    }
    const truncated = truncateBody(
      text,
      Math.min(LOG_PER_CHECK_MAX_CHARS, remaining),
    );
    remaining -= truncated.body.length;
    sections.push(`### ${check.name}\n\`\`\`\n${truncated.body}\n\`\`\``);
  }
  return {
    changeRequest,
    checks,
    prompt: [
      "CI checks failed on this change request. Please investigate and fix the failures.",
      "",
      `Change request: #${changeRequest.number ?? changeRequest.id} — ${changeRequest.title}`,
      `URL: ${changeRequest.webUrl}`,
      `Branch: ${changeRequest.source.name}`,
      "",
      "Failed checks:",
      ...checks.failed.map(
        (check) =>
          `- ${check.name}${check.detailsUrl ? ` (${check.detailsUrl})` : ""}`,
      ),
      "",
      "Failure log summary (truncated):",
      ...sections,
      "",
      "Reproduce locally if needed, fix the root cause, and keep changes scoped to the failures above.",
    ].join("\n"),
  };
}

export function buildGitHubCheckSummary(json: unknown): CheckSummary {
  const payload = rollupPayloadSchema(json);
  if (payload instanceof arkType.errors)
    throw unexpectedPayload(payload.summary);
  const pr = payload.data.repository?.pullRequest;
  if (!pr) throw DaemonError.sourceControlItemNotFound();
  const commit = pr.commits.nodes[0]?.commit;
  const checks = (commit?.statusCheckRollup?.contexts.nodes ?? []).map(
    mapCheck,
  );
  const failed = checks.filter(
    (check) =>
      check.conclusion === "failure" ||
      check.conclusion === "timed-out" ||
      check.conclusion === "action-required" ||
      check.conclusion === "canceled",
  );
  const failedBlocking = failed.filter((check) => check.blocking);
  const required = checks.filter((check) => check.requiredness === "required");
  const hasPending = checks.some(
    (check) =>
      check.status === "queued" ||
      check.status === "running" ||
      check.status === "waiting-manual",
  );
  return {
    checks,
    failed,
    failedBlocking,
    hasPending,
    headOid: commit?.oid ?? null,
    requiredAllGreen: !required.some(
      (check) => check.status !== "completed" || check.blocking,
    ),
  };
}

export function parseGitHubCheckAttempt(detailsUrl: string | null): number {
  if (!is.nonEmptyString(detailsUrl)) return 1;
  const value = Number(detailsUrl.match(/\/attempts\/(\d+)/)?.[1]);
  return Number.isInteger(value) && value > 0 ? value : 1;
}

export function tailFailureLog(
  raw: string,
  maxLines = FAILURE_LOG_TAIL_LINES,
): FailureLogResult {
  const normalized = normalizeText(raw);
  if (normalized.length === 0) return { text: "", truncated: false };
  const lines = normalized.split("\n");
  return lines.length <= maxLines
    ? { text: normalized, truncated: false }
    : { text: lines.slice(-maxLines).join("\n"), truncated: true };
}

function mapCheck(node: unknown): CheckRun {
  if (
    is.object(node) &&
    (node as { __typename?: string }).__typename === "CheckRun"
  ) {
    const check = checkRunNodeSchema(node);
    if (check instanceof arkType.errors) throw unexpectedPayload(check.summary);
    const status = normalizeCheckStatus(check.status, check.conclusion ?? null);
    const conclusion = normalizeConclusion(check.conclusion ?? null);
    const detailsUrl = check.detailsUrl ?? null;
    const attempt = parseGitHubCheckAttempt(detailsUrl);
    const workflowRunId =
      check.checkSuite?.workflowRun?.databaseId == null
        ? null
        : String(check.checkSuite.workflowRun.databaseId);
    const workflowName = check.checkSuite?.workflowRun?.workflow?.name ?? null;
    return {
      id:
        check.databaseId == null
          ? `check:${check.name}:${detailsUrl ?? "unknown"}`
          : String(check.databaseId),
      group:
        workflowRunId === null
          ? null
          : {
              id: workflowRunId,
              kind: "workflow-run",
              name: workflowName ?? check.name,
              stage: null,
              parentGroupId: null,
              attempt,
              detailsUrl,
            },
      name: check.name,
      status,
      conclusion,
      requiredness: check.isRequired ? "required" : "optional",
      blocking: check.isRequired && isBlockingConclusion(conclusion),
      attempt,
      retryOf: null,
      allowFailure: !check.isRequired,
      manual: conclusion === "action-required",
      startedAt: normalizeTimestamp(check.startedAt),
      completedAt: normalizeTimestamp(check.completedAt),
      detailsUrl,
      logRef:
        workflowRunId === null
          ? null
          : {
              kind: "workflow-run",
              runId: workflowRunId,
              jobId: check.databaseId == null ? null : String(check.databaseId),
            },
      extensions: { github: { checkRunId: check.databaseId ?? null } },
    };
  }
  const status = statusContextNodeSchema(node);
  if (status instanceof arkType.errors) throw unexpectedPayload(status.summary);
  const normalizedStatus = normalizeCheckStatus(status.state, status.state);
  const conclusion = normalizeConclusion(status.state);
  return {
    id: `status:${status.context}`,
    group: null,
    name: status.context,
    status: normalizedStatus,
    conclusion,
    requiredness: status.isRequired ? "required" : "optional",
    blocking: status.isRequired && isBlockingConclusion(conclusion),
    attempt: 1,
    retryOf: null,
    allowFailure: !status.isRequired,
    manual: false,
    startedAt: null,
    completedAt: null,
    detailsUrl: status.targetUrl ?? null,
    logRef: null,
    extensions: { github: { statusContext: status.context } },
  };
}

function normalizeCheckStatus(
  status: string,
  conclusion: string | null,
): CheckRunStatus {
  const value = status.toUpperCase();
  if (
    value === "QUEUED" ||
    value === "PENDING" ||
    value === "REQUESTED" ||
    value === "EXPECTED"
  )
    return "queued";
  if (value === "IN_PROGRESS" || value === "WAITING") return "running";
  if (value === "SKIPPED") return "skipped";
  if (value === "CANCELLED" || value === "CANCELED") return "canceled";
  if (
    value === "ACTION_REQUIRED" ||
    conclusion?.toUpperCase() === "ACTION_REQUIRED"
  )
    return "waiting-manual";
  return "completed";
}

function normalizeConclusion(value: string | null): CheckRunConclusion | null {
  switch (value?.toUpperCase()) {
    case "SUCCESS":
      return "success";
    case "FAILURE":
    case "ERROR":
    case "STARTUP_FAILURE":
      return "failure";
    case "NEUTRAL":
      return "neutral";
    case "CANCELLED":
    case "CANCELED":
      return "canceled";
    case "TIMED_OUT":
      return "timed-out";
    case "ACTION_REQUIRED":
      return "action-required";
    case "SKIPPED":
      return "skipped";
    case undefined:
      return null;
    default:
      return null;
  }
}

function isBlockingConclusion(conclusion: CheckRunConclusion | null): boolean {
  return (
    conclusion === "failure" ||
    conclusion === "canceled" ||
    conclusion === "timed-out" ||
    conclusion === "action-required"
  );
}

function normalizeTimestamp(value: string | null | undefined): string | null {
  if (!is.nonEmptyString(value) || value.startsWith("0001-01-01")) return null;
  return value;
}

function failureLogArgs(
  logRef: CheckLogRef,
  repository: RepositoryIdentity,
): string[] {
  const repo = repository.displayPath;
  if (logRef.kind === "workflow-run")
    return ["run", "view", logRef.runId, "--repo", repo, "--log-failed"];
  return ["run", "view", "--repo", repo, "--job", logRef.jobId, "--log"];
}

async function runGraphql(
  runGh: GhRunner,
  query: string,
  variables: Record<string, string | number>,
): Promise<unknown> {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [key, value] of Object.entries(variables))
    args.push(typeof value === "number" ? "-F" : "-f", `${key}=${value}`);
  try {
    return JSON.parse((await runGh(args)).stdout) as unknown;
  } catch (cause) {
    if (cause instanceof SyntaxError)
      throw DaemonError.sourceControlFetchFailed(
        cause,
        "GitHub CLI returned invalid JSON.",
      );
    throw mapGhFailure(cause);
  }
}

async function requireGh(
  dependencies: GitHubChecksDependencies,
): Promise<GhRunner> {
  const path = await (dependencies.findGh ?? findGhPath)();
  if (!is.nonEmptyString(path)) throw DaemonError.sourceControlCliMissing();
  return dependencies.runGh ?? runGhCli;
}

function requireGitHubRepository(
  repository: RepositoryIdentity,
): RepositoryIdentity {
  if (
    repository.providerId !== "github" ||
    repository.namespace.length !== 1 ||
    !is.nonEmptyString(repository.namespace[0])
  )
    throw DaemonError.sourceControlUrlUnsupported();
  return repository;
}

function requireNumber(id: string): number {
  const number = Number(id);
  const parsed = positiveInteger(number);
  if (parsed instanceof arkType.errors)
    throw DaemonError.invalidRequest(
      "A positive change request number is required.",
    );
  return parsed;
}

function unexpectedPayload(details: string): DaemonError {
  return DaemonError.sourceControlFetchFailed(
    new TypeError(`Unexpected GitHub GraphQL payload: ${details}`),
  );
}
