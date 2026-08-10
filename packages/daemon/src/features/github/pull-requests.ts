import type {
  GitHubAddPullRequestCommentInput,
  GitHubAddPullRequestCommentResult,
  GitHubCreatePullRequestInput,
  GitHubCreatePullRequestResult,
  GitHubListPullRequestsInput,
  GitHubListPullRequestsResult,
  GitHubPullRequestComment,
  GitHubPullRequestDetail,
  GitHubPullRequestListItem,
  GitHubViewPullRequestInput,
} from "@angel-engine/daemon-api/github";
import is from "@sindresorhus/is";
import { type as arkType } from "arktype";
import { Effect } from "effect";

import { DaemonError } from "../../platform/errors";
import {
  findGhPath,
  type GhRunner,
  mapGhFailure,
  normalizeText,
  runGhCli,
} from "./gh-cli";
import { parseGitHubUrl, truncateBody } from "./resolve";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const positiveInteger = arkType("number").narrow(
  (value) => Number.isInteger(value) && value > 0,
);
const nonNegativeInteger = arkType("number").narrow(
  (value) => Number.isInteger(value) && value >= 0,
);
const gitHubAuthorSchema = arkType({
  "+": "ignore",
  login: "string > 0",
}).or("null");
const pullRequestListPayloadSchema = arkType({
  "+": "ignore",
  author: gitHubAuthorSchema,
  baseRefName: "string > 0",
  headRefName: "string > 0",
  isDraft: "boolean",
  number: positiveInteger,
  state: "string > 0",
  title: "string > 0",
  updatedAt: "string > 0",
  url: "string > 0",
}).array();
const pullRequestCommentSchema = arkType({
  "+": "ignore",
  author: gitHubAuthorSchema,
  body: "string | null",
  createdAt: "string > 0",
  id: "string | number",
  url: "string > 0",
});
const pullRequestDetailPayloadSchema = arkType({
  "+": "ignore",
  additions: nonNegativeInteger,
  author: gitHubAuthorSchema,
  baseRefName: "string > 0",
  body: "string | null",
  changedFiles: nonNegativeInteger,
  comments: pullRequestCommentSchema.array(),
  commits: "unknown[]",
  deletions: nonNegativeInteger,
  headRefName: "string > 0",
  isDraft: "boolean",
  number: positiveInteger,
  state: "string > 0",
  title: "string > 0",
  updatedAt: "string > 0",
  url: "string > 0",
});
const createPullRequestPayloadSchema = arkType({
  "+": "ignore",
  number: positiveInteger,
  url: "string > 0",
});

const LIST_FIELDS =
  "number,title,state,author,url,updatedAt,isDraft,baseRefName,headRefName";
const VIEW_FIELDS = `${LIST_FIELDS},additions,body,changedFiles,comments,commits,deletions`;

export function listPullRequests(
  input: GitHubListPullRequestsInput,
  deps: {
    runGh?: GhRunner;
    whichGh?: () => Promise<string | null>;
  } = {},
): Effect.Effect<GitHubListPullRequestsResult, DaemonError> {
  return Effect.gen(function* () {
    const runGh = yield* requireGh(deps);
    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const state = input.state ?? "open";
    const search = input.query?.trim() ?? "";
    const args = [
      "pr",
      "list",
      "--state",
      state,
      "--limit",
      String(limit),
      "--json",
      LIST_FIELDS,
    ];
    if (search.length > 0) {
      args.push("--search", search);
    }

    const output = yield* Effect.tryPromise({
      catch: (cause) => mapGhFailure(cause),
      try: () => runGh(args, { cwd: input.cwd }),
    });
    const json = yield* parseJson(output.stdout);
    const payload = pullRequestListPayloadSchema(json);
    if (payload instanceof arkType.errors) {
      return yield* Effect.fail(
        DaemonError.githubFetchFailed(
          new TypeError(`Unexpected GitHub CLI payload: ${payload.summary}`),
        ),
      );
    }

    const items: GitHubPullRequestListItem[] = payload.map((entry) => {
      const parsed = parseGitHubUrl(entry.url);
      if (parsed === null || parsed.kind !== "pullRequest") {
        throw DaemonError.githubFetchFailed(
          new TypeError(`Unexpected GitHub CLI PR URL: ${entry.url}`),
        );
      }
      return {
        author: entry.author?.login ?? null,
        baseRefName: entry.baseRefName,
        headRefName: entry.headRefName,
        isDraft: entry.isDraft,
        number: entry.number,
        owner: parsed.owner,
        repo: parsed.repo,
        state: entry.state,
        title: entry.title,
        updatedAt: entry.updatedAt,
        url: parsed.url,
      };
    });

    return { items };
  });
}

export function viewPullRequest(
  input: GitHubViewPullRequestInput,
  deps: {
    runGh?: GhRunner;
    whichGh?: () => Promise<string | null>;
  } = {},
): Effect.Effect<GitHubPullRequestDetail, DaemonError> {
  return Effect.gen(function* () {
    const runGh = yield* requireGh(deps);
    if (!Number.isInteger(input.number) || input.number <= 0) {
      return yield* Effect.fail(
        DaemonError.invalidRequest("Pull request number is required."),
      );
    }

    const output = yield* Effect.tryPromise({
      catch: (cause) => mapGhFailure(cause),
      try: () =>
        runGh(["pr", "view", String(input.number), "--json", VIEW_FIELDS], {
          cwd: input.cwd,
        }),
    });
    const json = yield* parseJson(output.stdout);
    const payload = pullRequestDetailPayloadSchema(json);
    if (payload instanceof arkType.errors) {
      return yield* Effect.fail(
        DaemonError.githubFetchFailed(
          new TypeError(`Unexpected GitHub CLI payload: ${payload.summary}`),
        ),
      );
    }

    const parsed = parseGitHubUrl(payload.url);
    if (parsed === null || parsed.kind !== "pullRequest") {
      return yield* Effect.fail(
        DaemonError.githubFetchFailed(
          new TypeError(`Unexpected GitHub CLI PR URL: ${payload.url}`),
        ),
      );
    }

    const { body } = truncateBody(payload.body ?? "");
    const comments: GitHubPullRequestComment[] = payload.comments.map(
      (comment) => ({
        author: comment.author?.login ?? null,
        body: normalizeText(comment.body ?? ""),
        createdAt: comment.createdAt,
        id: String(comment.id),
        url: comment.url,
      }),
    );

    return {
      additions: payload.additions,
      author: payload.author?.login ?? null,
      baseRefName: payload.baseRefName,
      body,
      changedFiles: payload.changedFiles,
      comments,
      commitCount: payload.commits.length,
      deletions: payload.deletions,
      headRefName: payload.headRefName,
      isDraft: payload.isDraft,
      number: payload.number,
      owner: parsed.owner,
      repo: parsed.repo,
      state: payload.state,
      title: payload.title,
      updatedAt: payload.updatedAt,
      url: parsed.url,
    };
  });
}

export function createPullRequest(
  input: GitHubCreatePullRequestInput,
  deps: {
    runGh?: GhRunner;
    whichGh?: () => Promise<string | null>;
  } = {},
): Effect.Effect<GitHubCreatePullRequestResult, DaemonError> {
  return Effect.gen(function* () {
    const runGh = yield* requireGh(deps);
    const title = input.title.trim();
    if (title.length === 0) {
      return yield* Effect.fail(
        DaemonError.invalidRequest("Pull request title is required."),
      );
    }

    const args = ["pr", "create", "--title", title, "--body", input.body ?? ""];
    if (is.nonEmptyString(input.base)) {
      args.push("--base", input.base);
    }
    if (is.nonEmptyString(input.head)) {
      args.push("--head", input.head);
    }
    if (input.draft === true) {
      args.push("--draft");
    }
    args.push("--json", "number,url");

    const output = yield* Effect.tryPromise({
      catch: (cause) => mapGhFailure(cause),
      try: () => runGh(args, { cwd: input.cwd }),
    });
    const json = yield* parseJson(output.stdout);
    const payload = createPullRequestPayloadSchema(json);
    if (payload instanceof arkType.errors) {
      return yield* Effect.fail(
        DaemonError.githubFetchFailed(
          new TypeError(`Unexpected GitHub CLI payload: ${payload.summary}`),
        ),
      );
    }

    return {
      number: payload.number,
      url: payload.url,
    };
  });
}

export function addPullRequestComment(
  input: GitHubAddPullRequestCommentInput,
  deps: {
    runGh?: GhRunner;
    whichGh?: () => Promise<string | null>;
  } = {},
): Effect.Effect<GitHubAddPullRequestCommentResult, DaemonError> {
  return Effect.gen(function* () {
    const runGh = yield* requireGh(deps);
    const body = normalizeText(input.body);
    if (body.length === 0) {
      return yield* Effect.fail(
        DaemonError.invalidRequest("Comment body is required."),
      );
    }
    if (!Number.isInteger(input.number) || input.number <= 0) {
      return yield* Effect.fail(
        DaemonError.invalidRequest("Pull request number is required."),
      );
    }

    yield* Effect.tryPromise({
      catch: (cause) => mapGhFailure(cause),
      try: () =>
        runGh(["pr", "comment", String(input.number), "--body", body], {
          cwd: input.cwd,
        }),
    });

    // `gh pr comment` does not return structured JSON; re-view the PR and take
    // the newest comment that matches the posted body.
    const detail = yield* viewPullRequest(
      { cwd: input.cwd, number: input.number },
      deps,
    );
    const comment =
      [...detail.comments].reverse().find((entry) => entry.body === body) ??
      detail.comments.at(-1);

    if (!comment) {
      return {
        comment: {
          author: null,
          body,
          createdAt: new Date().toISOString(),
          id: `local-${Date.now()}`,
          url: detail.url,
        },
      };
    }

    return { comment };
  });
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

function parseJson(stdout: string): Effect.Effect<unknown, DaemonError> {
  return Effect.try({
    catch: (cause) =>
      DaemonError.githubFetchFailed(cause, "GitHub CLI returned invalid JSON."),
    try: () => JSON.parse(stdout) as unknown,
  });
}
