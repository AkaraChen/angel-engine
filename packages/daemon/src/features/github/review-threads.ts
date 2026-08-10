import type {
  GitHubReviewThread,
  GitHubReviewThreadComment,
  GitHubReviewThreadsInput,
  GitHubReviewThreadsResult,
} from "@angel-engine/daemon-api/github";
import is from "@sindresorhus/is";
import { type as arkType } from "arktype";
import { Effect } from "effect";

import { DaemonError } from "../../platform/errors";
import { findGhPath, type GhRunner, mapGhFailure, runGhCli } from "./gh-cli";

const authorSchema = arkType({
  "+": "ignore",
  login: "string > 0",
}).or("null");

const commentNodeSchema = arkType({
  "+": "ignore",
  author: authorSchema,
  body: "string | null",
  createdAt: "string > 0",
  id: "string > 0",
  "line?": "number | null",
  "path?": "string | null",
});

const threadNodeSchema = arkType({
  "+": "ignore",
  comments: {
    "+": "ignore",
    nodes: commentNodeSchema.array(),
  },
  id: "string > 0",
  isResolved: "boolean",
  "line?": "number | null",
  "path?": "string | null",
});

const reviewThreadsPayloadSchema = arkType({
  "+": "ignore",
  data: {
    "+": "ignore",
    repository: arkType({
      "+": "ignore",
      pullRequest: arkType({
        "+": "ignore",
        reviewThreads: {
          "+": "ignore",
          nodes: threadNodeSchema.array(),
        },
      }).or("null"),
    }).or("null"),
  },
});

const REVIEW_THREADS_QUERY = `
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          path
          line
          comments(first: 50) {
            nodes {
              id
              body
              createdAt
              path
              line
              author { login }
            }
          }
        }
      }
    }
  }
}
`.trim();

export function fetchGitHubReviewThreads(
  input: GitHubReviewThreadsInput,
  deps: {
    runGh?: GhRunner;
    whichGh?: () => Promise<string | null>;
  } = {},
): Effect.Effect<GitHubReviewThreadsResult, DaemonError> {
  return Effect.gen(function* () {
    const runGh = yield* requireGh(deps);
    if (!isValidPrContext(input)) {
      return yield* Effect.fail(
        DaemonError.invalidRequest("owner, repo, and prNumber are required."),
      );
    }

    const args = [
      "api",
      "graphql",
      "-f",
      `query=${REVIEW_THREADS_QUERY}`,
      "-f",
      `owner=${input.owner}`,
      "-f",
      `name=${input.repo}`,
      "-F",
      `number=${input.prNumber}`,
    ];
    const output = yield* Effect.tryPromise({
      catch: (cause) => mapGhFailure(cause),
      try: () => runGh(args, { cwd: input.cwd }),
    });

    let json: unknown;
    try {
      json = JSON.parse(output.stdout);
    } catch (cause) {
      return yield* Effect.fail(
        DaemonError.githubFetchFailed(
          cause,
          "GitHub CLI returned invalid JSON.",
        ),
      );
    }

    return yield* Effect.try({
      catch: (cause) =>
        cause instanceof DaemonError
          ? cause
          : DaemonError.githubFetchFailed(cause),
      try: () => buildReviewThreadsResult(json),
    });
  });
}

/** Pure mapper for fixture-driven tests. */
export function buildReviewThreadsResultFromGraphql(
  json: unknown,
): GitHubReviewThreadsResult {
  return buildReviewThreadsResult(json);
}

function buildReviewThreadsResult(json: unknown): GitHubReviewThreadsResult {
  const payload = reviewThreadsPayloadSchema(json);
  if (payload instanceof arkType.errors) {
    throw DaemonError.githubFetchFailed(
      new TypeError(`Unexpected GitHub GraphQL payload: ${payload.summary}`),
    );
  }
  const pr = payload.data.repository?.pullRequest;
  if (!pr) {
    throw DaemonError.githubItemNotFound();
  }

  const threads: GitHubReviewThread[] = pr.reviewThreads.nodes.map(
    (thread) => ({
      comments: thread.comments.nodes.map(mapComment),
      id: thread.id,
      isResolved: thread.isResolved,
      line: thread.line ?? null,
      path: thread.path ?? null,
    }),
  );
  const unresolved = threads.filter((thread) => !thread.isResolved);
  const resolvedCount = threads.length - unresolved.length;
  return {
    resolvedCount,
    threads,
    unresolved,
    unresolvedCount: unresolved.length,
  };
}

function mapComment(comment: {
  author: { login: string } | null;
  body: string | null;
  createdAt: string;
  id: string;
  line?: number | null;
  path?: string | null;
}): GitHubReviewThreadComment {
  return {
    author: comment.author?.login ?? null,
    body: comment.body ?? "",
    createdAt: comment.createdAt,
    id: comment.id,
    line: comment.line ?? null,
    path: comment.path ?? null,
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

function isValidPrContext(input: GitHubReviewThreadsInput): boolean {
  return (
    is.nonEmptyString(input.owner) &&
    is.nonEmptyString(input.repo) &&
    Number.isInteger(input.prNumber) &&
    input.prNumber > 0
  );
}
