import type {
  GitHubListRepositoriesInput,
  GitHubListRepositoriesResult,
  GitHubRepository,
  GitHubRepositoryOwner,
  GitHubRepositoryOwnersResult,
} from "@angel-engine/daemon-api/github";
import is from "@sindresorhus/is";
import { type as arkType } from "arktype";
import { Effect } from "effect";

import { DaemonError } from "../../platform/errors";
import { findGhPath, type GhRunner, mapGhFailure, runGhCli } from "./gh-cli";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;
const REPO_FIELDS = [
  "defaultBranchRef",
  "description",
  "isArchived",
  "isFork",
  "isPrivate",
  "name",
  "nameWithOwner",
  "owner",
  "pushedAt",
  "url",
].join(",");

const viewerSchema = arkType({
  "+": "ignore",
  login: "string > 0",
});
const organizationsSchema = arkType({
  "+": "ignore",
  login: "string > 0",
}).array();
const repositoriesSchema = arkType({
  "+": "ignore",
  defaultBranchRef: arkType({ "+": "ignore", "name?": "string" }).or("null"),
  description: arkType("string").or("null"),
  isArchived: "boolean",
  isFork: "boolean",
  isPrivate: "boolean",
  name: "string > 0",
  nameWithOwner: "string > 0",
  owner: arkType({ "+": "ignore", login: "string > 0" }),
  pushedAt: arkType("string").or("null"),
  url: "string > 0",
}).array();

/**
 * The accounts a clone picker can browse: the authenticated user plus every
 * organization they belong to. Organization membership needs the `read:org`
 * scope, so a rejected org read degrades to a viewer-only list rather than
 * failing the whole picker.
 */
export function listGitHubRepositoryOwners(
  deps: { runGh?: GhRunner; whichGh?: () => Promise<string | null> } = {},
): Effect.Effect<GitHubRepositoryOwnersResult, DaemonError> {
  return Effect.gen(function* () {
    const runGh = yield* requireGh(deps);

    const viewer = yield* ghJson(
      runGh,
      ["api", "user"],
      viewerSchema,
      "GitHub user",
    );
    const organizations = yield* ghJson(
      runGh,
      ["api", "user/orgs?per_page=100"],
      organizationsSchema,
      "GitHub organizations",
    ).pipe(Effect.orElseSucceed(() => []));

    const owners: GitHubRepositoryOwner[] = [
      { kind: "user", login: viewer.login },
      ...organizations.map(
        (organization): GitHubRepositoryOwner => ({
          kind: "organization",
          login: organization.login,
        }),
      ),
    ];
    return { owners };
  });
}

export function listGitHubRepositories(
  input: GitHubListRepositoriesInput,
  deps: {
    runGh?: GhRunner;
    whichGh?: () => Promise<string | null>;
  } = {},
): Effect.Effect<GitHubListRepositoriesResult, DaemonError> {
  return Effect.gen(function* () {
    const owner = input.owner.trim();
    if (!is.nonEmptyString(owner)) {
      return yield* Effect.fail(
        DaemonError.invalidRequest("Repository owner is required."),
      );
    }

    const runGh = yield* requireGh(deps);
    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const entries = yield* ghJson(
      runGh,
      ["repo", "list", owner, "--limit", String(limit), "--json", REPO_FIELDS],
      repositoriesSchema,
      "GitHub repositories",
    );

    const repositories = entries.map(
      (entry): GitHubRepository => ({
        defaultBranch: nonEmpty(entry.defaultBranchRef?.name ?? null),
        description: nonEmpty(entry.description),
        isArchived: entry.isArchived,
        isFork: entry.isFork,
        isPrivate: entry.isPrivate,
        name: entry.name,
        nameWithOwner: entry.nameWithOwner,
        owner: entry.owner.login,
        pushedAt: nonEmpty(entry.pushedAt),
        url: entry.url,
      }),
    );
    repositories.sort(
      (left, right) =>
        Date.parse(right.pushedAt ?? "") - Date.parse(left.pushedAt ?? "") ||
        left.nameWithOwner.localeCompare(right.nameWithOwner),
    );
    return { repositories };
  });
}

function requireGh(deps: {
  runGh?: GhRunner;
  whichGh?: () => Promise<string | null>;
}): Effect.Effect<GhRunner, DaemonError> {
  return Effect.gen(function* () {
    const whichGh = deps.whichGh ?? findGhPath;
    const ghPath = yield* Effect.tryPromise({
      catch: (cause) => DaemonError.sourceControlFetchFailed(cause),
      try: whichGh,
    });
    if (!is.nonEmptyString(ghPath)) {
      return yield* Effect.fail(DaemonError.sourceControlCliMissing());
    }
    return deps.runGh ?? runGhCli;
  });
}

function ghJson<Output>(
  runGh: GhRunner,
  args: string[],
  schema: (value: unknown) => Output | arkType.errors,
  label: string,
): Effect.Effect<Output, DaemonError> {
  return Effect.gen(function* () {
    const output = yield* Effect.tryPromise({
      catch: (cause) => mapGhFailure(cause),
      try: () => runGh(args),
    });

    let json: unknown;
    try {
      json = JSON.parse(output.stdout);
    } catch (cause) {
      return yield* Effect.fail(
        DaemonError.sourceControlFetchFailed(
          cause,
          "GitHub CLI returned invalid JSON.",
        ),
      );
    }

    const parsed = schema(json);
    if (parsed instanceof arkType.errors) {
      return yield* Effect.fail(
        DaemonError.sourceControlFetchFailed(
          new TypeError(`Unexpected ${label} payload: ${parsed.summary}`),
        ),
      );
    }
    return parsed;
  });
}

function nonEmpty(value: string | null): string | null {
  return is.nonEmptyString(value) ? value : null;
}
