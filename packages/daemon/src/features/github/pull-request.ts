import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  GitHubMergeInput,
  GitHubMergeMethod,
  GitHubMergeResult,
  GitHubPullRequestCheck,
  GitHubPullRequestStatus,
  GitHubPullRequestStatusInput,
  GitHubResolveThreadInput,
  GitHubResolveThreadResult,
  GitHubReviewThread,
} from "@angel-engine/daemon-api/github";
import is from "@sindresorhus/is";
import { type as arkType } from "arktype";
import { Cause, Effect, Exit } from "effect";

import { DaemonError } from "../../platform/errors";
import { findGhPath, type GhRunner, mapGhFailure, runGhCli } from "./gh-cli";

const execFileAsync = promisify(execFile);
const MERGE_TIMEOUT_MS = 60_000;
const PR_FIELDS = [
  "author",
  "baseRefName",
  "headRefName",
  "isDraft",
  "mergeable",
  "mergeStateStatus",
  "mergedAt",
  "number",
  "reviewDecision",
  "state",
  "statusCheckRollup",
  "title",
  "url",
].join(",");
const REPO_FIELDS = [
  "deleteBranchOnMerge",
  "mergeCommitAllowed",
  "nameWithOwner",
  "rebaseMergeAllowed",
  "squashMergeAllowed",
  "viewerPermission",
].join(",");

const positiveInteger = arkType("number.integer > 0");
const nullableString = arkType("string").or("null");
const authorSchema = arkType({
  "+": "ignore",
  login: "string > 0",
}).or("null");
const pullRequestPayloadSchema = arkType({
  "+": "ignore",
  author: authorSchema,
  baseRefName: "string > 0",
  headRefName: "string > 0",
  isDraft: "boolean",
  mergeable: "'CONFLICTING' | 'MERGEABLE' | 'UNKNOWN'",
  mergeStateStatus:
    "'BEHIND' | 'BLOCKED' | 'CLEAN' | 'DIRTY' | 'DRAFT' | 'HAS_HOOKS' | 'UNKNOWN' | 'UNSTABLE'",
  mergedAt: nullableString,
  number: positiveInteger,
  reviewDecision: arkType(
    "'' | 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED'",
  ).or("null"),
  state: "'CLOSED' | 'MERGED' | 'OPEN'",
  statusCheckRollup: "unknown[]",
  title: "string > 0",
  url: "string > 0",
});
const repositoryPayloadSchema = arkType({
  "+": "ignore",
  deleteBranchOnMerge: "boolean",
  mergeCommitAllowed: "boolean",
  nameWithOwner: /^([^/]+)\/([^/]+)$/,
  rebaseMergeAllowed: "boolean",
  squashMergeAllowed: "boolean",
  viewerPermission: "string",
});
const checkRunSchema = arkType({
  "+": "ignore",
  __typename: "'CheckRun'",
  conclusion: nullableString,
  detailsUrl: nullableString,
  name: "string > 0",
  status: "string > 0",
});
const statusContextSchema = arkType({
  "+": "ignore",
  __typename: "'StatusContext'",
  context: "string > 0",
  state: "string > 0",
  targetUrl: nullableString,
});
const requiredContextsSchema = arkType("string[]");
const reviewThreadsPayloadSchema = arkType({
  "+": "ignore",
  data: {
    "+": "ignore",
    repository: {
      "+": "ignore",
      pullRequest: {
        "+": "ignore",
        reviewThreads: {
          "+": "ignore",
          nodes: arkType({
            "+": "ignore",
            comments: {
              "+": "ignore",
              nodes: arkType({
                "+": "ignore",
                author: authorSchema,
                body: "string",
                line: arkType("number.integer").or("null"),
                path: arkType("string").or("null"),
                url: "string > 0",
              }).array(),
            },
            id: "string > 0",
            isOutdated: "boolean",
            isResolved: "boolean",
          }).array(),
        },
      },
    },
  },
});
const resolvedThreadPayloadSchema = arkType({
  "+": "ignore",
  data: {
    "+": "ignore",
    resolveReviewThread: {
      "+": "ignore",
      thread: {
        "+": "ignore",
        isResolved: "boolean",
      },
    },
  },
});

const REVIEW_THREADS_QUERY = `
  query PullRequestReviewThreads($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        reviewThreads(first: 100) {
          nodes {
            id
            isOutdated
            isResolved
            comments(first: 1) {
              nodes { author { login } body line path url }
            }
          }
        }
      }
    }
  }
`;
const RESOLVE_THREAD_MUTATION = `
  mutation ResolveReviewThread($threadId: ID!) {
    resolveReviewThread(input: { threadId: $threadId }) {
      thread { isResolved }
    }
  }
`;

export interface PullRequestDependencies {
  isDirty?: (cwd: string) => Promise<boolean>;
  runGh?: GhRunner;
  whichGh?: () => Promise<string | null>;
}

export function getGitHubPullRequestStatus(
  input: GitHubPullRequestStatusInput,
  dependencies: PullRequestDependencies = {},
): Effect.Effect<GitHubPullRequestStatus, DaemonError> {
  return Effect.gen(function* () {
    const runGh = yield* requireGh(dependencies);
    const prArgs = ["pr", "view"];
    if (input.number !== undefined) prArgs.push(String(input.number));
    prArgs.push("--json", PR_FIELDS);

    const [pullRequestOutput, repositoryOutput] = yield* Effect.all(
      [
        gh(runGh, prArgs, input.cwd),
        gh(runGh, ["repo", "view", "--json", REPO_FIELDS], input.cwd),
      ],
      { concurrency: "unbounded" },
    );
    const pullRequest = parsePayload(
      pullRequestPayloadSchema,
      pullRequestOutput.stdout,
      "pull request",
    );
    const repository = parsePayload(
      repositoryPayloadSchema,
      repositoryOutput.stdout,
      "repository",
    );
    const [owner, repo] = repository.nameWithOwner.split("/") as [
      string,
      string,
    ];

    const worktreeDirty = yield* gitWorktreeDirty(
      input.cwd,
      dependencies.isDirty,
    );
    const [behindBy, requiredContexts, unresolvedThreads] =
      pullRequest.state === "OPEN"
        ? yield* Effect.all(
            [
              getBehindBy({
                baseRefName: pullRequest.baseRefName,
                cwd: input.cwd,
                headRefName: pullRequest.headRefName,
                owner,
                repo,
                runGh,
              }),
              getRequiredContexts({
                baseRefName: pullRequest.baseRefName,
                cwd: input.cwd,
                owner,
                repo,
                runGh,
              }),
              getReviewThreads({
                cwd: input.cwd,
                number: pullRequest.number,
                owner,
                repo,
                runGh,
              }),
            ],
            { concurrency: "unbounded" },
          )
        : [0, new Set<string>(), [] as GitHubReviewThread[]];
    const allowedMergeMethods = allowedMethods(repository);

    return {
      allowedMergeMethods,
      author: pullRequest.author?.login ?? null,
      baseRefName: pullRequest.baseRefName,
      behindBy,
      checks: parseChecks(pullRequest.statusCheckRollup, requiredContexts),
      defaultMergeMethod: allowedMergeMethods[0] ?? "squash",
      deleteBranchOnMerge: repository.deleteBranchOnMerge,
      headRefName: pullRequest.headRefName,
      isDraft: pullRequest.isDraft,
      mergeable: pullRequest.mergeable,
      mergeStateStatus: pullRequest.mergeStateStatus,
      mergedAt: pullRequest.mergedAt,
      number: pullRequest.number,
      reviewDecision:
        pullRequest.reviewDecision === "" ? null : pullRequest.reviewDecision,
      state: pullRequest.state,
      title: pullRequest.title,
      unresolvedThreads,
      url: pullRequest.url,
      viewerCanMerge: ["ADMIN", "MAINTAIN", "WRITE"].includes(
        repository.viewerPermission,
      ),
      worktreeDirty,
    };
  });
}

export function mergeGitHubPullRequest(
  input: GitHubMergeInput,
  dependencies: PullRequestDependencies = {},
): Effect.Effect<GitHubMergeResult, DaemonError> {
  return Effect.gen(function* () {
    const runGh = yield* requireGh(dependencies);
    const args = ["pr", "merge", String(input.number), `--${input.method}`];
    if (input.deleteBranch === true) args.push("--delete-branch");
    yield* Effect.tryPromise({
      catch: mapGhFailure,
      try: () => runGh(args, { cwd: input.cwd, timeoutMs: MERGE_TIMEOUT_MS }),
    });
    const output = yield* gh(
      runGh,
      ["pr", "view", String(input.number), "--json", "state,url"],
      input.cwd,
    );
    const result = parsePayload(
      arkType({
        "+": "ignore",
        state: "'CLOSED' | 'MERGED' | 'OPEN'",
        url: "string > 0",
      }),
      output.stdout,
      "merged pull request",
    );
    return { merged: result.state === "MERGED", url: result.url };
  });
}

export function resolveGitHubReviewThread(
  input: GitHubResolveThreadInput,
  dependencies: PullRequestDependencies = {},
): Effect.Effect<GitHubResolveThreadResult, DaemonError> {
  return Effect.gen(function* () {
    const runGh = yield* requireGh(dependencies);
    const output = yield* gh(
      runGh,
      [
        "api",
        "graphql",
        "-f",
        `query=${RESOLVE_THREAD_MUTATION}`,
        "-F",
        `threadId=${input.threadId}`,
      ],
      input.cwd,
    );
    const payload = parsePayload(
      resolvedThreadPayloadSchema,
      output.stdout,
      "resolved review thread",
    );
    return { resolved: payload.data.resolveReviewThread.thread.isResolved };
  });
}

function requireGh(dependencies: PullRequestDependencies) {
  return Effect.gen(function* () {
    const whichGh = dependencies.whichGh ?? findGhPath;
    const ghPath = yield* Effect.tryPromise({
      catch: (cause) => DaemonError.githubFetchFailed(cause),
      try: whichGh,
    });
    if (!is.nonEmptyString(ghPath)) {
      return yield* Effect.fail(DaemonError.githubCliMissing());
    }
    return dependencies.runGh ?? runGhCli;
  });
}

function gh(runGh: GhRunner, args: string[], cwd: string) {
  return Effect.tryPromise({
    catch: mapGhFailure,
    try: () => runGh(args, { cwd }),
  });
}

function parsePayload<T>(
  schema: (value: unknown) => T | arkType.errors,
  stdout: string,
  label: string,
): T {
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch (cause) {
    throw DaemonError.githubFetchFailed(
      cause,
      `GitHub CLI returned invalid ${label} JSON.`,
    );
  }
  const payload = schema(json);
  if (payload instanceof arkType.errors) {
    throw DaemonError.githubFetchFailed(
      new TypeError(`Unexpected ${label} payload: ${payload.summary}`),
    );
  }
  return payload;
}

function allowedMethods(repository: {
  mergeCommitAllowed: boolean;
  rebaseMergeAllowed: boolean;
  squashMergeAllowed: boolean;
}): GitHubMergeMethod[] {
  const methods: GitHubMergeMethod[] = [];
  if (repository.squashMergeAllowed) methods.push("squash");
  if (repository.mergeCommitAllowed) methods.push("merge");
  if (repository.rebaseMergeAllowed) methods.push("rebase");
  return methods;
}

function parseChecks(
  entries: unknown[],
  requiredContexts: ReadonlySet<string>,
): GitHubPullRequestCheck[] {
  const checks: GitHubPullRequestCheck[] = [];
  for (const entry of entries) {
    const checkRun = checkRunSchema(entry);
    if (!(checkRun instanceof arkType.errors)) {
      checks.push({
        name: checkRun.name,
        required: requiredContexts.has(checkRun.name),
        state: checkState(checkRun.status, checkRun.conclusion),
        url: checkRun.detailsUrl,
      });
      continue;
    }
    const context = statusContextSchema(entry);
    if (!(context instanceof arkType.errors)) {
      checks.push({
        name: context.context,
        required: requiredContexts.has(context.context),
        state: checkState(context.state, context.state),
        url: context.targetUrl,
      });
    }
  }
  return checks;
}

function checkState(
  status: string,
  conclusion: string | null,
): GitHubPullRequestCheck["state"] {
  const normalized = (conclusion ?? status).toUpperCase();
  if (["COMPLETED", "SUCCESS", "NEUTRAL"].includes(normalized)) {
    return "success";
  }
  if (["SKIPPED", "STALE"].includes(normalized)) return "skipped";
  if (
    ["FAILURE", "ACTION_REQUIRED", "CANCELLED", "ERROR", "TIMED_OUT"].includes(
      normalized,
    )
  ) {
    return "failure";
  }
  return "pending";
}

function getRequiredContexts({
  baseRefName,
  cwd,
  owner,
  repo,
  runGh,
}: {
  baseRefName: string;
  cwd: string;
  owner: string;
  repo: string;
  runGh: GhRunner;
}): Effect.Effect<ReadonlySet<string>, DaemonError> {
  return Effect.gen(function* () {
    const exit = yield* Effect.exit(
      gh(
        runGh,
        [
          "api",
          `repos/${owner}/${repo}/branches/${encodeURIComponent(baseRefName)}/protection/required_status_checks`,
          "--jq",
          ".contexts",
        ],
        cwd,
      ),
    );
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      if (
        failure._tag === "Some" &&
        failure.value.code === "github-item-not-found"
      ) {
        return new Set<string>();
      }
      return yield* Effect.fail(
        failure._tag === "Some"
          ? failure.value
          : DaemonError.githubFetchFailed(exit.cause),
      );
    }
    const contexts = parsePayload(
      requiredContextsSchema,
      exit.value.stdout,
      "required checks",
    );
    return new Set(contexts);
  });
}

function getBehindBy({
  baseRefName,
  cwd,
  headRefName,
  owner,
  repo,
  runGh,
}: {
  baseRefName: string;
  cwd: string;
  headRefName: string;
  owner: string;
  repo: string;
  runGh: GhRunner;
}): Effect.Effect<number, DaemonError> {
  return Effect.gen(function* () {
    const output = yield* gh(
      runGh,
      [
        "api",
        `repos/${owner}/${repo}/compare/${encodeURIComponent(baseRefName)}...${encodeURIComponent(headRefName)}`,
        "--jq",
        ".behind_by",
      ],
      cwd,
    );
    const behindBy = Number.parseInt(output.stdout.trim(), 10);
    if (!Number.isInteger(behindBy) || behindBy < 0) {
      return yield* Effect.fail(
        DaemonError.githubFetchFailed(
          new TypeError("GitHub compare response did not include behind_by."),
        ),
      );
    }
    return behindBy;
  });
}

function getReviewThreads({
  cwd,
  number,
  owner,
  repo,
  runGh,
}: {
  cwd: string;
  number: number;
  owner: string;
  repo: string;
  runGh: GhRunner;
}): Effect.Effect<GitHubReviewThread[], DaemonError> {
  return Effect.gen(function* () {
    const output = yield* gh(
      runGh,
      [
        "api",
        "graphql",
        "-f",
        `query=${REVIEW_THREADS_QUERY}`,
        "-F",
        `owner=${owner}`,
        "-F",
        `repo=${repo}`,
        "-F",
        `number=${number}`,
      ],
      cwd,
    );
    const payload = parsePayload(
      reviewThreadsPayloadSchema,
      output.stdout,
      "review threads",
    );
    return payload.data.repository.pullRequest.reviewThreads.nodes.flatMap(
      (thread) => {
        if (thread.isResolved) return [];
        const comment = thread.comments.nodes[0];
        if (comment === undefined) return [];
        return [
          {
            author: comment.author?.login ?? null,
            body: comment.body,
            id: thread.id,
            isOutdated: thread.isOutdated,
            line: comment.line,
            path: comment.path,
            url: comment.url,
          },
        ];
      },
    );
  });
}

function gitWorktreeDirty(
  cwd: string,
  injected?: (cwd: string) => Promise<boolean>,
): Effect.Effect<boolean, DaemonError> {
  return Effect.tryPromise({
    catch: (cause) => DaemonError.gitFailed(cause),
    try: async () => {
      if (injected !== undefined) return injected(cwd);
      const result = await execFileAsync("git", ["status", "--porcelain"], {
        cwd,
      });
      return result.stdout.toString().trim().length > 0;
    },
  });
}
