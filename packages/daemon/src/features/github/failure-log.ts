import type {
  GitHubFailureLogInput,
  GitHubFailureLogResult,
} from "@angel-engine/daemon-api/github";
import { Effect } from "effect";

import { DaemonError } from "../../platform/errors";
import {
  fetchGitHubCheckFailureLog,
  tailFailureLog as genericTailFailureLog,
} from "../source-control/providers/github/internal/checks";
import { type GhRunner, runGhCli } from "./gh-cli";

export const FAILURE_LOG_TAIL_LINES = 40;

export function fetchGitHubFailureLog(
  input: GitHubFailureLogInput,
  deps: { runGh?: GhRunner; whichGh?: () => Promise<string | null> } = {},
): Effect.Effect<GitHubFailureLogResult, DaemonError> {
  const displayPath = input.repo?.trim() || "unknown/unknown";
  const [owner = "unknown", name = "unknown"] = displayPath.split("/");
  return Effect.tryPromise({
    catch: (cause) =>
      cause instanceof DaemonError
        ? cause
        : DaemonError.sourceControlFetchFailed(cause),
    try: async () => {
      const result = await fetchGitHubCheckFailureLog(
        {
          logRef: {
            kind: "workflow-run",
            runId: String(input.runId),
            jobId: null,
          },
          repository: {
            providerId: "github",
            host: "github.com",
            namespace: [owner],
            name,
            remoteId: null,
            displayPath,
            webUrl: `https://github.com/${displayPath}`,
          },
          tailLines: FAILURE_LOG_TAIL_LINES,
        },
        {
          deadline: Date.now() + 30_000,
          signal: new AbortController().signal,
        },
        {
          findGh: deps.whichGh,
          runGh: (args) => {
            const repoIndex = args.indexOf("--repo");
            const forwarded =
              input.repo === undefined && repoIndex >= 0
                ? [...args.slice(0, repoIndex), ...args.slice(repoIndex + 2)]
                : args;
            return (deps.runGh ?? runGhCli)(forwarded, { cwd: input.cwd });
          },
        },
      );
      return {
        lines: result.text.length === 0 ? [] : result.text.split("\n"),
        truncated: result.truncated,
      };
    },
  });
}

export function tailFailureLog(
  raw: string,
  maxLines = FAILURE_LOG_TAIL_LINES,
): GitHubFailureLogResult {
  const result = genericTailFailureLog(raw, maxLines);
  return {
    lines: result.text.length === 0 ? [] : result.text.split("\n"),
    truncated: result.truncated,
  };
}
