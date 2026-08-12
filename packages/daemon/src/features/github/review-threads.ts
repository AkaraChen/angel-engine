import type {
  GitHubReviewThread,
  GitHubReviewThreadsInput,
  GitHubReviewThreadsResult,
} from "@angel-engine/daemon-api/github";
import type {
  RepositoryIdentity,
  ReviewThread,
} from "@angel-engine/daemon-api/source-control";
import { Effect } from "effect";

import { DaemonError } from "../../platform/errors";
import {
  buildGitHubReviewThreads,
  listGitHubReviewThreads,
} from "../source-control/providers/github/internal/reviews";
import type { GhRunner } from "./gh-cli";

export function fetchGitHubReviewThreads(
  input: GitHubReviewThreadsInput,
  deps: { runGh?: GhRunner; whichGh?: () => Promise<string | null> } = {},
): Effect.Effect<GitHubReviewThreadsResult, DaemonError> {
  return Effect.tryPromise({
    catch: asDaemonError,
    try: async () =>
      toLegacyResult(
        await listGitHubReviewThreads(
          { id: String(input.prNumber), repository: repository(input) },
          operationContext(),
          { findGh: deps.whichGh, runGh: deps.runGh },
        ),
      ),
  });
}

export function buildReviewThreadsResultFromGraphql(
  json: unknown,
): GitHubReviewThreadsResult {
  return toLegacyResult(buildGitHubReviewThreads(json));
}

function toLegacyResult(
  threads: readonly ReviewThread[],
): GitHubReviewThreadsResult {
  const mapped = threads.map(toLegacyThread);
  const unresolved = mapped.filter((thread) => !thread.isResolved);
  return {
    resolvedCount: mapped.length - unresolved.length,
    threads: mapped,
    unresolved,
    unresolvedCount: unresolved.length,
  };
}

function toLegacyThread(thread: ReviewThread): GitHubReviewThread {
  return {
    comments: thread.comments.map((comment) => {
      const extension = comment.extensions?.github as
        | { line?: number | null; path?: string | null }
        | undefined;
      return {
        author: comment.author?.login ?? null,
        body: comment.body,
        createdAt: comment.createdAt,
        id: comment.id,
        line: extension?.line ?? thread.location?.endLine ?? null,
        path: extension?.path ?? thread.location?.path ?? null,
      };
    }),
    id: thread.id,
    isResolved: thread.state === "resolved",
    line: thread.location?.endLine ?? null,
    path: thread.location?.path ?? null,
  };
}

function repository(input: GitHubReviewThreadsInput): RepositoryIdentity {
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
