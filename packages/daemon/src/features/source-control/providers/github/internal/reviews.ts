import type {
  NumberedItemInput,
  ProviderOperationContext,
  ResolveReviewThreadInput,
  ReviewComment,
  ReviewThread,
} from "@angel-engine/daemon-api/source-control";
import is from "@sindresorhus/is";
import { type as arkType } from "arktype";

import { DaemonError } from "../../../../../platform/errors";
import { findGhPath, type GhRunner, mapGhFailure, runGhCli } from "./gh-cli";

interface GitHubReviewDependencies {
  findGh?: () => Promise<string | null>;
  runGh?: GhRunner;
}

const authorSchema = arkType({
  "+": "ignore",
  "avatarUrl?": "string | null",
  "id?": "string | null",
  login: "string > 0",
  "name?": "string | null",
  "url?": "string | null",
}).or("null");
const commentSchema = arkType({
  "+": "ignore",
  author: authorSchema,
  body: "string | null",
  createdAt: "string > 0",
  id: "string > 0",
  "line?": "number | null",
  "path?": "string | null",
  "url?": "string | null",
});
const threadSchema = arkType({
  "+": "ignore",
  comments: { "+": "ignore", nodes: commentSchema.array() },
  id: "string > 0",
  "isOutdated?": "boolean",
  isResolved: "boolean",
  "line?": "number | null",
  "path?": "string | null",
});
const threadsPayloadSchema = arkType({
  "+": "ignore",
  data: {
    "+": "ignore",
    repository: arkType({
      "+": "ignore",
      pullRequest: arkType({
        "+": "ignore",
        reviewThreads: { "+": "ignore", nodes: threadSchema.array() },
      }).or("null"),
    }).or("null"),
  },
});
const resolvedPayloadSchema = arkType({
  "+": "ignore",
  data: {
    "+": "ignore",
    resolveReviewThread: {
      "+": "ignore",
      thread: {
        "+": "ignore",
        "id?": "string > 0",
        "isOutdated?": "boolean",
        isResolved: "boolean",
        "line?": "number | null",
        "path?": "string | null",
        "comments?": { "+": "ignore", nodes: commentSchema.array() },
      },
    },
  },
});

const THREADS_QUERY = `
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        nodes {
          id isResolved isOutdated path line
          comments(first: 50) {
            nodes {
              id body createdAt path line url
              author { login avatarUrl url ... on User { id name } }
            }
          }
        }
      }
    }
  }
}`.trim();

const RESOLVE_MUTATION = `
mutation($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) {
    thread {
      id isResolved isOutdated path line
      comments(first: 50) {
        nodes {
          id body createdAt path line url
          author { login avatarUrl url ... on User { id name } }
        }
      }
    }
  }
}`.trim();

export async function listGitHubReviewThreads(
  input: NumberedItemInput,
  _context: ProviderOperationContext,
  dependencies: GitHubReviewDependencies = {},
): Promise<readonly ReviewThread[]> {
  const repository = requireRepository(input);
  const payload = threadsPayloadSchema(
    await graphql(dependencies, THREADS_QUERY, {
      name: repository.name,
      number: requireNumber(input.id),
      owner: repository.namespace[0] ?? "",
    }),
  );
  if (payload instanceof arkType.errors) throw unexpected(payload.summary);
  const pullRequest = payload.data.repository?.pullRequest;
  if (pullRequest === null || pullRequest === undefined) {
    throw DaemonError.sourceControlItemNotFound();
  }
  return pullRequest.reviewThreads.nodes.map(mapThread);
}

export async function resolveGitHubReviewThread(
  input: ResolveReviewThreadInput,
  _context: ProviderOperationContext,
  dependencies: GitHubReviewDependencies = {},
): Promise<ReviewThread> {
  requireRepository(input);
  const payload = resolvedPayloadSchema(
    await graphql(dependencies, RESOLVE_MUTATION, { threadId: input.threadId }),
  );
  if (payload instanceof arkType.errors) throw unexpected(payload.summary);
  const thread = payload.data.resolveReviewThread.thread;
  return mapThread({
    comments: thread.comments ?? { nodes: [] },
    id: thread.id ?? input.threadId,
    isOutdated: thread.isOutdated ?? false,
    isResolved: thread.isResolved,
    line: thread.line ?? null,
    path: thread.path ?? null,
  });
}

export function buildGitHubReviewThreads(
  json: unknown,
): readonly ReviewThread[] {
  const payload = threadsPayloadSchema(json);
  if (payload instanceof arkType.errors) throw unexpected(payload.summary);
  const pullRequest = payload.data.repository?.pullRequest;
  if (pullRequest === null || pullRequest === undefined) {
    throw DaemonError.sourceControlItemNotFound();
  }
  return pullRequest.reviewThreads.nodes.map(mapThread);
}

function mapThread(thread: typeof threadSchema.infer): ReviewThread {
  const comments = thread.comments.nodes.map(mapComment);
  const locatedComment = thread.comments.nodes.find(
    (comment) =>
      is.nonEmptyString(comment.path) && typeof comment.line === "number",
  );
  const path = thread.path ?? locatedComment?.path;
  const line = thread.line ?? locatedComment?.line;
  return {
    id: thread.id,
    state: thread.isOutdated
      ? "outdated"
      : thread.isResolved
        ? "resolved"
        : "unresolved",
    resolvable: !thread.isResolved && !thread.isOutdated,
    location:
      is.nonEmptyString(path) && typeof line === "number"
        ? { path, side: "right", startLine: line, endLine: line }
        : null,
    comments,
    extensions: { github: { isOutdated: thread.isOutdated ?? false } },
  };
}

function mapComment(comment: typeof commentSchema.infer): ReviewComment {
  return {
    id: comment.id,
    author:
      comment.author === null
        ? null
        : {
            id: comment.author.id ?? null,
            login: comment.author.login,
            displayName: comment.author.name ?? null,
            avatarUrl: comment.author.avatarUrl ?? null,
            webUrl: comment.author.url ?? null,
          },
    body: comment.body ?? "",
    createdAt: comment.createdAt,
    updatedAt: null,
    webUrl: comment.url ?? null,
    extensions: {
      github: { line: comment.line ?? null, path: comment.path ?? null },
    },
  };
}

async function graphql(
  dependencies: GitHubReviewDependencies,
  query: string,
  variables: Record<string, string | number>,
): Promise<unknown> {
  const path = await (dependencies.findGh ?? findGhPath)();
  if (!is.nonEmptyString(path)) throw DaemonError.sourceControlCliMissing();
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [key, value] of Object.entries(variables)) {
    args.push(typeof value === "number" ? "-F" : "-f", `${key}=${value}`);
  }
  try {
    return JSON.parse(
      (await (dependencies.runGh ?? runGhCli)(args)).stdout,
    ) as unknown;
  } catch (cause) {
    if (cause instanceof SyntaxError) {
      throw DaemonError.sourceControlFetchFailed(
        cause,
        "GitHub CLI returned invalid JSON.",
      );
    }
    throw mapGhFailure(cause);
  }
}

function requireRepository(
  input: NumberedItemInput | ResolveReviewThreadInput,
) {
  const repository = input.repository;
  if (repository.providerId !== "github" || repository.namespace.length !== 1) {
    throw DaemonError.sourceControlUrlUnsupported();
  }
  return repository;
}

function requireNumber(id: string): number {
  const number = Number(id);
  if (!Number.isInteger(number) || number <= 0) {
    throw DaemonError.invalidRequest(
      "A positive change request number is required.",
    );
  }
  return number;
}

function unexpected(details: string) {
  return DaemonError.sourceControlFetchFailed(
    new TypeError(`Unexpected GitHub GraphQL payload: ${details}`),
  );
}
