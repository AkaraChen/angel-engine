import type {
  GitHubItemKind,
  GitHubListItem,
  GitHubListItemsInput,
  GitHubListItemsResult,
} from "@angel-engine/daemon-api/github";
import is from "@sindresorhus/is";
import { type as arkType } from "arktype";
import { Effect } from "effect";

import { DaemonError } from "../../platform/errors";
import { findGhPath, type GhRunner, mapGhFailure, runGhCli } from "./gh-cli";
import { parseGitHubUrl } from "./resolve";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const UPDATED_SORT_QUALIFIER = "sort:updated-desc";
const ISSUE_FIELDS = "number,title,state,author,url,updatedAt";
const PULL_REQUEST_FIELDS = `${ISSUE_FIELDS},isDraft`;

const positiveInteger = arkType("number").narrow(
  (value) => Number.isInteger(value) && value > 0,
);
const gitHubAuthorSchema = arkType({
  "+": "ignore",
  login: "string > 0",
}).or("null");
const gitHubListPayloadSchema = arkType({
  "+": "ignore",
  author: gitHubAuthorSchema,
  "isDraft?": "boolean",
  number: positiveInteger,
  state: "string > 0",
  title: "string > 0",
  updatedAt: "string > 0",
  url: "string > 0",
}).array();

export function listGitHubItems(
  input: GitHubListItemsInput,
  deps: {
    runGh?: GhRunner;
    whichGh?: () => Promise<string | null>;
  } = {},
): Effect.Effect<GitHubListItemsResult, DaemonError> {
  return Effect.gen(function* () {
    const whichGh = deps.whichGh ?? findGhPath;
    const ghPath = yield* Effect.tryPromise({
      catch: (cause) => DaemonError.githubFetchFailed(cause),
      try: whichGh,
    });
    if (!is.nonEmptyString(ghPath)) {
      return yield* Effect.fail(DaemonError.githubCliMissing());
    }

    const runGh = deps.runGh ?? runGhCli;
    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const search = input.query?.trim() ?? "";
    const [issues, pullRequests] = yield* Effect.all(
      [
        listByKind({ cwd: input.cwd, kind: "issue", limit, runGh, search }),
        listByKind({
          cwd: input.cwd,
          kind: "pullRequest",
          limit,
          runGh,
          search,
        }),
      ],
      { concurrency: "unbounded" },
    );

    const items = [...issues, ...pullRequests].sort(
      (left, right) =>
        Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
        right.number - left.number,
    );
    return { items: items.slice(0, limit) };
  });
}

function listByKind({
  cwd,
  kind,
  limit,
  runGh,
  search,
}: {
  cwd: string;
  kind: GitHubItemKind;
  limit: number;
  runGh: GhRunner;
  search: string;
}): Effect.Effect<GitHubListItem[], DaemonError> {
  return Effect.gen(function* () {
    const args = [
      kind === "issue" ? "issue" : "pr",
      "list",
      "--state",
      "all",
      "--limit",
      String(limit),
      "--json",
      kind === "issue" ? ISSUE_FIELDS : PULL_REQUEST_FIELDS,
      "--search",
      search.length > 0
        ? `${search} ${UPDATED_SORT_QUALIFIER}`
        : UPDATED_SORT_QUALIFIER,
    ];

    const output = yield* Effect.tryPromise({
      catch: (cause) => mapGhFailure(cause),
      try: () => runGh(args, { cwd }),
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
      try: () => buildListItems(kind, json),
    });
  });
}

function buildListItems(kind: GitHubItemKind, json: unknown): GitHubListItem[] {
  const payload = gitHubListPayloadSchema(json);
  if (payload instanceof arkType.errors) {
    throw DaemonError.githubFetchFailed(
      new TypeError(`Unexpected GitHub CLI payload: ${payload.summary}`),
    );
  }

  return payload.map((entry) => {
    const parsed = parseGitHubUrl(entry.url);
    if (parsed === null || parsed.kind !== kind) {
      throw DaemonError.githubFetchFailed(
        new TypeError(`Unexpected GitHub CLI item URL: ${entry.url}`),
      );
    }
    return {
      author: entry.author?.login ?? null,
      isDraft: entry.isDraft,
      kind,
      number: parsed.number,
      owner: parsed.owner,
      repo: parsed.repo,
      state: entry.state,
      title: entry.title,
      updatedAt: entry.updatedAt,
      url: parsed.url,
    };
  });
}
