import type {
  GitHubCheckBucket,
  GitHubPrCheck,
  GitHubPrChecksFixPromptInput,
  GitHubPrChecksFixPromptResult,
  GitHubPrChecksInput,
  GitHubPrChecksResult,
  GitHubPrChecksSummary,
  GitHubPrRef,
} from "@angel-engine/daemon-api/github";
import is from "@sindresorhus/is";
import { type as arkType } from "arktype";
import { Effect } from "effect";

import { DaemonError } from "../../platform/errors";
import {
  extractProcessOutput,
  findGhPath,
  type GhRunner,
  isNoPullRequestMessage,
  mapGhFailure,
  normalizeText,
  runGhCli,
  runGhCliCapturingExit,
} from "./gh-cli";
import { truncateBody } from "./resolve";

const CHECK_FIELDS =
  "name,state,bucket,link,description,workflow,startedAt,completedAt";
const PR_VIEW_FIELDS = "number,title,url,headRefName";
const LOG_PER_CHECK_MAX_CHARS = 4_000;
const LOG_TOTAL_MAX_CHARS = 12_000;
const MAX_FAILED_LOGS = 5;

const positiveInteger = arkType("number").narrow(
  (value) => Number.isInteger(value) && value > 0,
);
const gitHubCheckBucketSchema = arkType(
  "'pass' | 'fail' | 'pending' | 'skipping' | 'cancel'",
);
const gitHubCheckPayloadSchema = arkType({
  "+": "ignore",
  bucket: gitHubCheckBucketSchema,
  "completedAt?": "string | null",
  "description?": "string | null",
  "link?": "string | null",
  name: "string > 0",
  "startedAt?": "string | null",
  state: "string > 0",
  "workflow?": "string | null",
}).array();
const gitHubPrViewPayloadSchema = arkType({
  "+": "ignore",
  headRefName: "string > 0",
  number: positiveInteger,
  title: "string > 0",
  url: "string > 0",
});

export type GhCapturingRunner = (
  args: string[],
  options?: { cwd?: string },
) => Promise<{ exitCode: number; stderr: string; stdout: string }>;

export function listGitHubPrChecks(
  input: GitHubPrChecksInput,
  deps: {
    runGh?: GhRunner;
    runGhCapturing?: GhCapturingRunner;
    whichGh?: () => Promise<string | null>;
  } = {},
): Effect.Effect<GitHubPrChecksResult, DaemonError> {
  return Effect.gen(function* () {
    const whichGh = deps.whichGh ?? findGhPath;
    const ghPath = yield* Effect.tryPromise({
      catch: (cause) => DaemonError.sourceControlFetchFailed(cause),
      try: whichGh,
    });
    if (!is.nonEmptyString(ghPath)) {
      return yield* Effect.fail(DaemonError.sourceControlCliMissing());
    }

    const runGh = deps.runGh ?? runGhCli;
    const runGhCapturing = deps.runGhCapturing ?? runGhCliCapturingExit;

    const pullRequest = yield* loadPullRequestForCwd(input.cwd, runGh);
    if (pullRequest === null) {
      return emptyChecksResult();
    }

    const checks = yield* loadChecksForPr(
      input.cwd,
      pullRequest.number,
      runGhCapturing,
    );
    return {
      checks,
      hasPullRequest: true,
      pullRequest,
      summary: summarizeChecks(checks),
    };
  });
}

export function buildGitHubPrChecksFixPrompt(
  input: GitHubPrChecksFixPromptInput,
  deps: {
    runGh?: GhRunner;
    runGhCapturing?: GhCapturingRunner;
    whichGh?: () => Promise<string | null>;
  } = {},
): Effect.Effect<GitHubPrChecksFixPromptResult, DaemonError> {
  return Effect.gen(function* () {
    const listed = yield* listGitHubPrChecks(
      { cwd: input.cwd },
      {
        runGh: deps.runGh,
        runGhCapturing: deps.runGhCapturing,
        whichGh: deps.whichGh,
      },
    );
    if (!listed.hasPullRequest || listed.pullRequest === null) {
      return yield* Effect.fail(
        DaemonError.sourceControlItemNotFound(
          "No pull request is associated with the current branch.",
        ),
      );
    }

    const nameFilter =
      input.checkNames === undefined
        ? null
        : new Set(input.checkNames.map((name) => name.trim()).filter(Boolean));
    const failed = listed.checks.filter((check) => {
      if (check.bucket !== "fail") return false;
      if (nameFilter === null) return true;
      return nameFilter.has(check.name);
    });
    if (failed.length === 0) {
      return yield* Effect.fail(
        DaemonError.invalidRequest("No failed checks to fix."),
      );
    }

    const runGh = deps.runGh ?? runGhCli;
    const logSections: string[] = [];
    let remainingLogBudget = LOG_TOTAL_MAX_CHARS;
    for (const check of failed.slice(0, MAX_FAILED_LOGS)) {
      if (remainingLogBudget <= 0) break;
      const runId = extractActionsRunId(check.link);
      if (runId === null) {
        logSections.push(
          formatCheckLogSection(check, "(no GitHub Actions run log available)"),
        );
        continue;
      }
      const rawLog = yield* fetchFailedRunLog(input.cwd, runId, runGh);
      const perCheckCap = Math.min(LOG_PER_CHECK_MAX_CHARS, remainingLogBudget);
      const truncated = truncateBody(rawLog, perCheckCap);
      remainingLogBudget -= truncated.body.length;
      logSections.push(formatCheckLogSection(check, truncated.body));
    }

    const pullRequest = listed.pullRequest;
    const failedNames = failed.map((check) => check.name);
    const prompt = [
      "CI checks failed on this pull request. Please investigate and fix the failures.",
      "",
      `Pull request: #${pullRequest.number} — ${pullRequest.title}`,
      `URL: ${pullRequest.url}`,
      `Branch: ${pullRequest.headRefName}`,
      "",
      "Failed checks:",
      ...failed.map((check) => {
        const link = is.nonEmptyString(check.link) ? ` (${check.link})` : "";
        const description = is.nonEmptyString(check.description)
          ? ` — ${check.description}`
          : "";
        return `- ${check.name} [${check.state}]${description}${link}`;
      }),
      "",
      "Failure log summary (truncated):",
      ...logSections,
      "",
      "Reproduce locally if needed, fix the root cause, and keep changes scoped to the failures above.",
    ].join("\n");

    return {
      failedCheckNames: failedNames,
      prompt,
      pullRequest,
    };
  });
}

export function summarizeChecks(
  checks: GitHubPrCheck[],
): GitHubPrChecksSummary {
  let fail = 0;
  let pass = 0;
  let pending = 0;
  let other = 0;
  for (const check of checks) {
    switch (check.bucket) {
      case "fail":
        fail += 1;
        break;
      case "pass":
        pass += 1;
        break;
      case "pending":
        pending += 1;
        break;
      case "cancel":
      case "skipping":
        other += 1;
        break;
    }
  }
  return { fail, other, pass, pending, total: checks.length };
}

export function extractActionsRunId(link: string | null): string | null {
  if (!is.nonEmptyString(link)) return null;
  try {
    const url = new URL(link);
    const host = url.hostname.toLowerCase();
    if (host !== "github.com" && host !== "www.github.com") return null;
    const match = url.pathname.match(/\/actions\/runs\/(\d+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function emptyChecksResult(): GitHubPrChecksResult {
  return {
    checks: [],
    hasPullRequest: false,
    pullRequest: null,
    summary: { fail: 0, other: 0, pass: 0, pending: 0, total: 0 },
  };
}

function loadPullRequestForCwd(
  cwd: string,
  runGh: GhRunner,
): Effect.Effect<GitHubPrRef | null, DaemonError> {
  return Effect.tryPromise({
    catch: (cause) =>
      cause instanceof DaemonError
        ? cause
        : DaemonError.sourceControlFetchFailed(cause),
    try: async () => {
      let output: { stderr: string; stdout: string };
      try {
        output = await runGh(["pr", "view", "--json", PR_VIEW_FIELDS], {
          cwd,
        });
      } catch (cause) {
        if (isNoPullRequestMessage(combinedGhMessage(cause))) {
          return null;
        }
        throw mapGhFailure(cause);
      }

      let json: unknown;
      try {
        json = JSON.parse(output.stdout);
      } catch (cause) {
        throw DaemonError.sourceControlFetchFailed(
          cause,
          "GitHub CLI returned invalid JSON for pull request.",
        );
      }

      const payload = gitHubPrViewPayloadSchema(json);
      if (payload instanceof arkType.errors) {
        throw DaemonError.sourceControlFetchFailed(
          new TypeError(`Unexpected GitHub PR payload: ${payload.summary}`),
        );
      }
      return {
        headRefName: payload.headRefName,
        number: payload.number,
        title: payload.title,
        url: payload.url,
      };
    },
  });
}

function loadChecksForPr(
  cwd: string,
  prNumber: number,
  runGhCapturing: GhCapturingRunner,
): Effect.Effect<GitHubPrCheck[], DaemonError> {
  return Effect.gen(function* () {
    const result = yield* Effect.tryPromise({
      catch: (cause) => mapGhFailure(cause),
      try: () =>
        runGhCapturing(
          ["pr", "checks", String(prNumber), "--json", CHECK_FIELDS],
          { cwd },
        ),
    });

    const message = `${result.stderr}\n${result.stdout}`;
    if (isNoPullRequestMessage(message)) {
      return [];
    }

    const stdout = result.stdout.trim();
    if (stdout.length === 0) {
      // No checks configured yet is a valid empty list.
      if (result.exitCode === 0 || result.exitCode === 1) {
        return [];
      }
      return yield* Effect.fail(
        DaemonError.sourceControlFetchFailed(
          new Error(result.stderr || `gh pr checks exited ${result.exitCode}`),
        ),
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(result.stdout);
    } catch (cause) {
      // Exit 1 with a human message and no JSON still means failure to list.
      if (result.exitCode !== 0 && result.exitCode !== 8) {
        return yield* Effect.fail(mapGhFailure(new Error(message)));
      }
      return yield* Effect.fail(
        DaemonError.sourceControlFetchFailed(
          cause,
          "GitHub CLI returned invalid JSON for checks.",
        ),
      );
    }

    const payload = gitHubCheckPayloadSchema(json);
    if (payload instanceof arkType.errors) {
      return yield* Effect.fail(
        DaemonError.sourceControlFetchFailed(
          new TypeError(`Unexpected GitHub checks payload: ${payload.summary}`),
        ),
      );
    }

    return payload.map(
      (entry): GitHubPrCheck => ({
        bucket: entry.bucket as GitHubCheckBucket,
        completedAt: emptyToNull(entry.completedAt),
        description: emptyToNull(entry.description),
        link: emptyToNull(entry.link),
        name: entry.name,
        startedAt: emptyToNull(entry.startedAt),
        state: entry.state,
        workflow: emptyToNull(entry.workflow),
      }),
    );
  });
}

function fetchFailedRunLog(
  cwd: string,
  runId: string,
  runGh: GhRunner,
): Effect.Effect<string, never> {
  return Effect.promise(async () => {
    try {
      const output = await runGh(["run", "view", runId, "--log-failed"], {
        cwd,
      });
      const text = normalizeText(output.stdout);
      if (text.length > 0) return text;
      const stderr = normalizeText(output.stderr);
      return stderr.length > 0
        ? stderr
        : "(failed run log was empty or unavailable)";
    } catch (cause) {
      // Missing logs should not block the fix prompt.
      const fallback = normalizeText(combinedGhMessage(cause));
      return fallback.length > 0
        ? fallback
        : "(failed run log was empty or unavailable)";
    }
  });
}

function formatCheckLogSection(check: GitHubPrCheck, logBody: string) {
  const header = `### ${check.name}${check.workflow ? ` (${check.workflow})` : ""}`;
  return `${header}\n\`\`\`\n${logBody}\n\`\`\``;
}

function emptyToNull(value: string | null | undefined): string | null {
  if (!is.string(value)) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  // gh sometimes emits the zero-time sentinel for unfinished checks.
  if (trimmed.startsWith("0001-01-01")) return null;
  return trimmed;
}

function combinedGhMessage(cause: unknown): string {
  const stdout = extractProcessOutput(cause, "stdout") ?? "";
  const stderr = extractProcessOutput(cause, "stderr") ?? "";
  if (is.object(cause) && is.string((cause as { message?: unknown }).message)) {
    return `${(cause as { message: string }).message}\n${stderr}\n${stdout}`;
  }
  if (cause instanceof Error) {
    return `${cause.message}\n${stderr}\n${stdout}`;
  }
  return `${String(cause)}\n${stderr}\n${stdout}`;
}
