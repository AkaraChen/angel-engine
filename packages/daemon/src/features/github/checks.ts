import type {
  GitHubPrCheck,
  GitHubPrChecksFixPromptInput,
  GitHubPrChecksFixPromptResult,
  GitHubPrChecksInput,
  GitHubPrChecksResult,
  GitHubPrChecksSummary,
  GitHubPrRef,
} from "@angel-engine/daemon-api/github";
import type {
  CheckRun,
  RepositoryIdentity,
} from "@angel-engine/daemon-api/source-control";
import is from "@sindresorhus/is";
import { type as arkType } from "arktype";
import { Effect } from "effect";

import { DaemonError } from "../../platform/errors";
import {
  buildGitHubChecksFixPrompt as buildGenericFixPrompt,
  snapshotGitHubChecks,
} from "../source-control/providers/github/internal/checks";
import { parseGitHubRepositoryUrl } from "../source-control/providers/github/internal/resolve";
import {
  findGhPath,
  type GhRunner,
  isNoPullRequestMessage,
  mapGhFailure,
  runGhCli,
} from "./gh-cli";

const prSchema = arkType({
  "+": "ignore",
  headRefName: "string > 0",
  number: "number.integer > 0",
  title: "string > 0",
  url: "string > 0",
});

export type GhCapturingRunner = (
  args: string[],
  options?: { cwd?: string },
) => Promise<{ exitCode: number; stderr: string; stdout: string }>;

interface LegacyDependencies {
  runGh?: GhRunner;
  runGhCapturing?: GhCapturingRunner;
  whichGh?: () => Promise<string | null>;
}

export function listGitHubPrChecks(
  input: GitHubPrChecksInput,
  deps: LegacyDependencies = {},
): Effect.Effect<GitHubPrChecksResult, DaemonError> {
  return Effect.tryPromise({
    catch: asDaemonError,
    try: async () => {
      const resolved = await resolveCurrentPullRequest(input.cwd, deps);
      if (resolved === null) return emptyResult();
      const checks = (
        await snapshotGitHubChecks(
          {
            id: String(resolved.pullRequest.number),
            repository: resolved.repository,
          },
          operationContext(),
          { findGh: deps.whichGh, runGh: deps.runGh },
        )
      ).checks.map(toLegacyCheck);
      return {
        checks,
        hasPullRequest: true,
        pullRequest: resolved.pullRequest,
        summary: summarizeChecks(checks),
      };
    },
  });
}

export function buildGitHubPrChecksFixPrompt(
  input: GitHubPrChecksFixPromptInput,
  deps: LegacyDependencies = {},
): Effect.Effect<GitHubPrChecksFixPromptResult, DaemonError> {
  return Effect.tryPromise({
    catch: asDaemonError,
    try: async () => {
      const resolved = await resolveCurrentPullRequest(input.cwd, deps);
      if (resolved === null) {
        throw DaemonError.sourceControlItemNotFound(
          "No pull request is associated with the current branch.",
        );
      }
      const generic = await buildGenericFixPrompt(
        {
          id: String(resolved.pullRequest.number),
          repository: resolved.repository,
        },
        operationContext(),
        { findGh: deps.whichGh, runGh: deps.runGh },
      );
      if (
        input.checkNames !== undefined &&
        !generic.checks.failed.some((check) =>
          input.checkNames?.includes(check.name),
        )
      ) {
        throw DaemonError.invalidRequest("No failed checks to fix.");
      }
      return {
        failedCheckNames: generic.checks.failed
          .map((check) => check.name)
          .filter(
            (name) =>
              input.checkNames === undefined || input.checkNames.includes(name),
          ),
        prompt: generic.prompt,
        pullRequest: resolved.pullRequest,
      };
    },
  });
}

export function extractActionsRunId(link: string | null): string | null {
  if (!is.nonEmptyString(link)) return null;
  try {
    const url = new URL(link);
    if (url.hostname !== "github.com" && url.hostname !== "www.github.com")
      return null;
    return url.pathname.match(/\/actions\/runs\/(\d+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function summarizeChecks(
  checks: GitHubPrCheck[],
): GitHubPrChecksSummary {
  const count = (bucket: GitHubPrCheck["bucket"]) =>
    checks.filter((check) => check.bucket === bucket).length;
  return {
    fail: count("fail"),
    other: count("cancel") + count("skipping"),
    pass: count("pass"),
    pending: count("pending"),
    total: checks.length,
  };
}

async function resolveCurrentPullRequest(
  cwd: string,
  deps: LegacyDependencies,
): Promise<{
  pullRequest: GitHubPrRef;
  repository: RepositoryIdentity;
} | null> {
  const path = await (deps.whichGh ?? findGhPath)();
  if (!is.nonEmptyString(path)) throw DaemonError.sourceControlCliMissing();
  let output: { stdout: string };
  try {
    output = await (deps.runGh ?? runGhCli)(
      ["pr", "view", "--json", "number,title,url,headRefName"],
      { cwd },
    );
  } catch (cause) {
    if (
      isNoPullRequestMessage(
        cause instanceof Error ? cause.message : String(cause),
      )
    )
      return null;
    throw mapGhFailure(cause);
  }
  let json: unknown;
  try {
    json = JSON.parse(output.stdout) as unknown;
  } catch (cause) {
    throw DaemonError.sourceControlFetchFailed(
      cause,
      "GitHub CLI returned invalid JSON for pull request.",
    );
  }
  const parsed = prSchema(json);
  if (parsed instanceof arkType.errors) {
    throw DaemonError.sourceControlFetchFailed(
      new TypeError(`Unexpected GitHub PR payload: ${parsed.summary}`),
    );
  }
  const repository = parseGitHubRepositoryUrl(parsed.url);
  if (repository === null) throw DaemonError.sourceControlUrlUnsupported();
  return { pullRequest: parsed, repository };
}

function toLegacyCheck(check: CheckRun): GitHubPrCheck {
  return {
    bucket:
      check.status === "queued" ||
      check.status === "running" ||
      check.status === "waiting-manual"
        ? "pending"
        : check.conclusion === "success"
          ? "pass"
          : check.conclusion === "skipped"
            ? "skipping"
            : check.conclusion === "canceled"
              ? "cancel"
              : "fail",
    completedAt: check.completedAt,
    description: null,
    link: check.detailsUrl,
    name: check.name,
    startedAt: check.startedAt,
    state:
      check.conclusion?.replaceAll("-", "_").toUpperCase() ??
      check.status.toUpperCase(),
    workflow: check.group?.name ?? null,
  };
}

function emptyResult(): GitHubPrChecksResult {
  return {
    checks: [],
    hasPullRequest: false,
    pullRequest: null,
    summary: { fail: 0, other: 0, pass: 0, pending: 0, total: 0 },
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
