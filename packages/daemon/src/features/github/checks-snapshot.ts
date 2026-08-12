import type {
  GitHubCheckItem,
  GitHubChecksInput,
  GitHubChecksSnapshot,
} from "@angel-engine/daemon-api/github";
import type {
  CheckRun,
  CheckSummary,
  RepositoryIdentity,
} from "@angel-engine/daemon-api/source-control";
import { Effect } from "effect";

import { DaemonError } from "../../platform/errors";
import {
  buildGitHubCheckSummary,
  parseGitHubCheckAttempt,
  snapshotGitHubChecks,
} from "../source-control/providers/github/internal/checks";
import type { GhRunner } from "./gh-cli";

export function fetchGitHubChecks(
  input: GitHubChecksInput,
  deps: { runGh?: GhRunner; whichGh?: () => Promise<string | null> } = {},
): Effect.Effect<GitHubChecksSnapshot, DaemonError> {
  return Effect.tryPromise({
    catch: asDaemonError,
    try: async () =>
      toLegacySnapshot(
        await snapshotGitHubChecks(
          { id: String(input.prNumber), repository: repository(input) },
          operationContext(),
          { findGh: deps.whichGh, runGh: deps.runGh },
        ),
      ),
  });
}

export function buildChecksSnapshotFromGraphql(
  json: unknown,
): GitHubChecksSnapshot {
  return toLegacySnapshot(buildGitHubCheckSummary(json));
}

export const parseAttempt = parseGitHubCheckAttempt;

function toLegacySnapshot(summary: CheckSummary): GitHubChecksSnapshot {
  const checks = summary.checks.map(toLegacyCheck);
  const failedIds = new Set(summary.failed.map((check) => check.id));
  const failedRequiredIds = new Set(
    summary.failedBlocking.map((check) => check.id),
  );
  return {
    checks,
    failed: checks.filter((check, index) =>
      failedIds.has(summary.checks[index]?.id ?? ""),
    ),
    failedRequired: checks.filter((check, index) =>
      failedRequiredIds.has(summary.checks[index]?.id ?? ""),
    ),
    hasPending: summary.hasPending,
    headOid: summary.headOid,
    requiredAllGreen: summary.requiredAllGreen,
  };
}

function toLegacyCheck(check: CheckRun): GitHubCheckItem {
  const extension = check.extensions?.github as
    | { checkRunId?: number | string | null }
    | undefined;
  return {
    attempt: check.attempt,
    checkRunId:
      extension?.checkRunId == null ? null : String(extension.checkRunId),
    conclusion: legacyConclusion(check),
    detailsUrl: check.detailsUrl,
    isPending:
      check.status === "queued" ||
      check.status === "running" ||
      check.status === "waiting-manual",
    isRequired: check.requiredness === "required",
    name: check.name,
    status: legacyStatus(check),
    workflowName: check.group?.name ?? null,
    workflowRunId:
      check.logRef?.kind === "workflow-run" ? check.logRef.runId : null,
  };
}

function legacyStatus(check: CheckRun): string {
  if (check.status === "queued") return "QUEUED";
  if (check.status === "running") return "IN_PROGRESS";
  if (check.status === "waiting-manual") return "WAITING";
  return "COMPLETED";
}

function legacyConclusion(check: CheckRun): string | null {
  if (check.conclusion === null) return null;
  return check.conclusion.replaceAll("-", "_").toUpperCase();
}

function repository(input: GitHubChecksInput): RepositoryIdentity {
  return {
    providerId: "github",
    host: "github.com",
    namespace: [input.owner],
    name: input.repo,
    remoteId: null,
    displayPath: `${input.owner}/${input.repo}`,
    webUrl: `https://github.com/${input.owner}/${input.repo}`,
  };
}

function operationContext() {
  return {
    deadline: Date.now() + 30_000,
    signal: new AbortController().signal,
  };
}

function asDaemonError(cause: unknown) {
  return cause instanceof DaemonError
    ? cause
    : DaemonError.sourceControlFetchFailed(cause);
}
