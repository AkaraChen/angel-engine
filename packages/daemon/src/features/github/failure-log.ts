import type {
  GitHubFailureLogInput,
  GitHubFailureLogResult,
} from "@angel-engine/daemon-api/github";
import is from "@sindresorhus/is";
import { Effect } from "effect";

import { DaemonError } from "../../platform/errors";
import {
  findGhPath,
  type GhRunner,
  mapGhFailure,
  normalizeText,
  runGhCli,
} from "./gh-cli";

/** Trailing lines kept for shepherd prompt context. */
export const FAILURE_LOG_TAIL_LINES = 40;

/**
 * Fetch failed-job logs for a workflow run.
 * Not on the poll path — only call when composing a shepherd prompt.
 */
export function fetchGitHubFailureLog(
  input: GitHubFailureLogInput,
  deps: {
    runGh?: GhRunner;
    whichGh?: () => Promise<string | null>;
  } = {},
): Effect.Effect<GitHubFailureLogResult, DaemonError> {
  return Effect.gen(function* () {
    const runGh = yield* requireGh(deps);
    const runId = String(input.runId).trim();
    if (runId.length === 0) {
      return yield* Effect.fail(
        DaemonError.invalidRequest("Workflow run id is required."),
      );
    }

    const args = ["run", "view", runId, "--log-failed"];
    if (is.nonEmptyString(input.repo)) {
      args.push("--repo", input.repo);
    }

    const output = yield* Effect.tryPromise({
      catch: (cause) => mapGhFailure(cause),
      try: () => runGh(args, { cwd: input.cwd }),
    });

    return tailFailureLog(output.stdout);
  });
}

/** Pure: take the last N non-empty-preserving lines from a failed log dump. */
export function tailFailureLog(
  raw: string,
  maxLines = FAILURE_LOG_TAIL_LINES,
): GitHubFailureLogResult {
  const normalized = normalizeText(raw);
  if (normalized.length === 0) {
    return { lines: [], truncated: false };
  }
  const allLines = normalized.split("\n");
  if (allLines.length <= maxLines) {
    return { lines: allLines, truncated: false };
  }
  return {
    lines: allLines.slice(-maxLines),
    truncated: true,
  };
}

function requireGh(deps: {
  runGh?: GhRunner;
  whichGh?: () => Promise<string | null>;
}): Effect.Effect<GhRunner, DaemonError> {
  return Effect.gen(function* () {
    const whichGh = deps.whichGh ?? findGhPath;
    const ghPath = yield* Effect.tryPromise({
      catch: (cause) => DaemonError.githubFetchFailed(cause),
      try: whichGh,
    });
    if (!is.nonEmptyString(ghPath)) {
      return yield* Effect.fail(DaemonError.githubCliMissing());
    }
    return deps.runGh ?? runGhCli;
  });
}
