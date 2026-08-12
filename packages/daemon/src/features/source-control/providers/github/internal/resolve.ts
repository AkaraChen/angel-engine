import type {
  NumberedItemInput,
  ProviderOperationContext,
  RepositoryIdentity,
  UrlOperationInput,
  WorkItem,
} from "@angel-engine/daemon-api/source-control";
import is from "@sindresorhus/is";
import { type as arkType } from "arktype";
import { Effect } from "effect";

import { DaemonError } from "../../../../../platform/errors";
import { GitHubError } from "./errors";
import {
  findGhPath,
  type GhRunner,
  mapGhFailure,
  normalizeText,
  runGhCli,
} from "./gh-cli";
import type {
  GitHubItemKind,
  GitHubResolveUrlInput,
  GitHubResolvedItem,
} from "./types";

const BODY_MAX_CHARS = 12_000;
const positiveInteger = arkType("number").narrow(
  (value) => Number.isInteger(value) && value > 0,
);
const gitHubAuthorSchema = arkType({
  "+": "ignore",
  login: "string > 0",
}).or("null");
const gitHubIssuePayloadSchema = arkType({
  "+": "ignore",
  author: gitHubAuthorSchema,
  // GitHub often returns null for empty issue/PR bodies.
  body: "string | null",
  number: positiveInteger,
  state: "string > 0",
  title: "string > 0",
  url: "string > 0",
});
const gitHubPullRequestPayloadSchema = arkType({
  "+": "ignore",
  author: gitHubAuthorSchema,
  baseRefName: "string > 0",
  // GitHub often returns null for empty issue/PR bodies.
  body: "string | null",
  headRefName: "string > 0",
  isDraft: "boolean",
  "isCrossRepository?": "boolean",
  number: positiveInteger,
  state: "string > 0",
  title: "string > 0",
  url: "string > 0",
});
const gitHubActorSchema = arkType({
  "+": "ignore",
  "avatarUrl?": "string | null",
  "id?": "string | null",
  login: "string > 0",
  "name?": "string | null",
  "url?": "string | null",
});
const gitHubWorkItemPayloadSchema = arkType({
  "+": "ignore",
  assignees: gitHubActorSchema.array(),
  author: gitHubActorSchema.or("null"),
  body: "string | null",
  closedAt: "string | null",
  createdAt: "string > 0",
  labels: arkType({ "+": "ignore", name: "string > 0" }).array(),
  number: positiveInteger,
  state: "string > 0",
  title: "string > 0",
  updatedAt: "string > 0",
  url: "string > 0",
});

const WORK_ITEM_FIELDS = [
  "assignees",
  "author",
  "body",
  "closedAt",
  "createdAt",
  "labels",
  "number",
  "state",
  "title",
  "updatedAt",
  "url",
].join(",");

export interface ParsedGitHubUrl {
  kind: GitHubItemKind;
  number: number;
  owner: string;
  repo: string;
  url: string;
}

export function parseGitHubRepositoryUrl(
  raw: string,
): RepositoryIdentity | null {
  const trimmed = raw.trim();
  const shorthand = /^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/.exec(trimmed);
  if (shorthand) {
    return gitHubRepositoryIdentity(shorthand[1], shorthand[2]);
  }
  const scpMatch = /^[\w.-]+@([^:]+):(.+)$/.exec(trimmed);
  let host: string;
  let pathname: string;
  if (scpMatch) {
    host = scpMatch[1].toLowerCase();
    pathname = scpMatch[2];
  } else {
    try {
      const parsed = new URL(trimmed);
      host = parsed.hostname.toLowerCase();
      pathname = parsed.pathname;
    } catch {
      return null;
    }
  }
  if (host !== "github.com" && host !== "www.github.com") return null;
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 2) return null;
  const namespace = segments[0];
  const name = segments[1].endsWith(".git")
    ? segments[1].slice(0, -4)
    : segments[1];
  if (!is.nonEmptyString(namespace) || !is.nonEmptyString(name)) return null;
  return gitHubRepositoryIdentity(namespace, name);
}

function gitHubRepositoryIdentity(
  namespace: string,
  name: string,
): RepositoryIdentity {
  return {
    providerId: "github",
    host: "github.com",
    namespace: [namespace],
    name,
    remoteId: null,
    displayPath: `${namespace}/${name}`,
    webUrl: `https://github.com/${namespace}/${name}`,
  };
}

export function parseGitHubUrl(raw: string): ParsedGitHubUrl | null {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") {
    return null;
  }

  const segments = parsed.pathname.split("/").filter((part) => part.length > 0);
  if (segments.length < 4) return null;

  const [owner, repo, type, numberText] = segments;
  if (!is.nonEmptyString(owner) || !is.nonEmptyString(repo)) return null;
  if (type !== "issues" && type !== "pull") return null;

  const number = Number(numberText);
  if (!Number.isInteger(number) || number <= 0) return null;

  const kind: GitHubItemKind = type === "issues" ? "issue" : "pullRequest";
  return {
    kind,
    number,
    owner,
    repo,
    url: `https://github.com/${owner}/${repo}/${type}/${number}`,
  };
}

export function truncateBody(body: string, maxChars = BODY_MAX_CHARS) {
  const normalized = normalizeText(body);
  if (normalized.length <= maxChars) {
    return { body: normalized, truncated: false };
  }
  return {
    body: `${normalized.slice(0, maxChars)}\n\n[Truncated: body exceeded ${maxChars} characters]`,
    truncated: true,
  };
}

export function formatGitHubContextText(item: {
  author: string | null;
  baseRefName?: string;
  body: string;
  headRefName?: string;
  isDraft?: boolean;
  kind: GitHubItemKind;
  number: number;
  owner: string;
  repo: string;
  state: string;
  title: string;
  url: string;
}): string {
  const label = item.kind === "issue" ? "Issue" : "Pull Request";
  const lines = [
    `GitHub ${label} #${item.number} — ${item.title}`,
    "",
    `Repository: ${item.owner}/${item.repo}`,
    `Source: ${item.url}`,
    `State: ${item.state}`,
  ];
  if (is.nonEmptyString(item.author)) {
    lines.push(`Author: @${item.author}`);
  }
  if (item.kind === "pullRequest") {
    if (
      is.nonEmptyString(item.baseRefName) &&
      is.nonEmptyString(item.headRefName)
    ) {
      lines.push(`Branches: ${item.baseRefName} ← ${item.headRefName}`);
    }
    if (item.isDraft === true) {
      lines.push("Draft: yes");
    }
  }
  lines.push("", "Body:", item.body.length > 0 ? item.body : "(empty)");
  return lines.join("\n");
}

export function resolveGitHubUrl(
  input: GitHubResolveUrlInput,
  deps: {
    runGh?: GhRunner;
    whichGh?: () => Promise<string | null>;
  } = {},
): Effect.Effect<GitHubResolvedItem, DaemonError> {
  return Effect.gen(function* () {
    const parsed = parseGitHubUrl(input.url);
    if (parsed === null) {
      return yield* Effect.fail(GitHubError.sourceControlUrlUnsupported());
    }

    const whichGh = deps.whichGh ?? findGhPath;
    const ghPath = yield* Effect.tryPromise({
      catch: (cause) => GitHubError.sourceControlFetchFailed(cause),
      try: whichGh,
    });
    if (!is.nonEmptyString(ghPath)) {
      return yield* Effect.fail(GitHubError.sourceControlCliMissing());
    }

    const runGh = deps.runGh ?? runGhCli;
    const fields =
      parsed.kind === "issue"
        ? "number,title,body,state,author,url"
        : "number,title,body,state,author,url,baseRefName,headRefName,isDraft,isCrossRepository";
    const command =
      parsed.kind === "issue"
        ? (["issue", "view", parsed.url, "--json", fields] as const)
        : (["pr", "view", parsed.url, "--json", fields] as const);

    const output = yield* Effect.tryPromise({
      catch: (cause) => mapGhFailure(cause),
      try: () => runGh([...command]),
    });

    let json: unknown;
    try {
      json = JSON.parse(output.stdout);
    } catch (cause) {
      return yield* Effect.fail(
        GitHubError.sourceControlFetchFailed(
          cause,
          "GitHub CLI returned invalid JSON.",
        ),
      );
    }

    return yield* Effect.try({
      catch: (cause) =>
        cause instanceof DaemonError
          ? cause
          : GitHubError.sourceControlFetchFailed(cause),
      try: () => buildResolvedItem(parsed, json),
    });
  });
}

export async function getGitHubWorkItem(
  input: NumberedItemInput,
  _context: ProviderOperationContext,
  deps: {
    runGh?: GhRunner;
    whichGh?: () => Promise<string | null>;
  } = {},
): Promise<WorkItem> {
  const repository = requireGitHubRepository(input.repository);
  return fetchGitHubWorkItem(
    ["issue", "view", input.id, "--repo", repository.displayPath],
    deps,
    {
      id: input.id,
      owner: repository.namespace[0],
      repo: repository.name,
    },
  );
}

export async function getGitHubWorkItemByUrl(
  input: UrlOperationInput,
  _context: ProviderOperationContext,
  deps: {
    runGh?: GhRunner;
    whichGh?: () => Promise<string | null>;
  } = {},
): Promise<WorkItem> {
  const parsed = parseGitHubUrl(input.url);
  if (parsed?.kind !== "issue") {
    throw GitHubError.sourceControlUrlUnsupported(
      "Only GitHub issue URLs are supported for work items.",
    );
  }
  return fetchGitHubWorkItem(["issue", "view", parsed.url], deps, {
    id: String(parsed.number),
    owner: parsed.owner,
    repo: parsed.repo,
  });
}

async function fetchGitHubWorkItem(
  command: string[],
  deps: {
    runGh?: GhRunner;
    whichGh?: () => Promise<string | null>;
  },
  expected: { id: string; owner: string; repo: string },
): Promise<WorkItem> {
  const ghPath = await (deps.whichGh ?? findGhPath)().catch((cause) => {
    throw GitHubError.sourceControlFetchFailed(cause);
  });
  if (!is.nonEmptyString(ghPath)) throw GitHubError.sourceControlCliMissing();
  const output = await (deps.runGh ?? runGhCli)([
    ...command,
    "--json",
    WORK_ITEM_FIELDS,
  ]).catch((cause) => {
    throw mapGhFailure(cause);
  });
  let json: unknown;
  try {
    json = JSON.parse(output.stdout);
  } catch (cause) {
    throw GitHubError.sourceControlFetchFailed(
      cause,
      "GitHub CLI returned invalid JSON.",
    );
  }
  const payload = gitHubWorkItemPayloadSchema(json);
  if (payload instanceof arkType.errors) {
    throw unexpectedGitHubPayload(payload.summary);
  }
  const parsed = parseGitHubUrl(payload.url);
  if (
    parsed?.kind !== "issue" ||
    payload.number !== parsed.number ||
    String(payload.number) !== expected.id ||
    parsed.owner !== expected.owner ||
    parsed.repo !== expected.repo
  ) {
    throw unexpectedGitHubPayload(
      `received issue #${payload.number} at ${payload.url}`,
    );
  }
  const repository = parseGitHubRepositoryUrl(payload.url);
  if (repository === null) throw unexpectedGitHubPayload(payload.url);
  return {
    id: String(payload.number),
    number: payload.number,
    repository,
    kind: "issue",
    title: payload.title,
    body: normalizeText(payload.body ?? ""),
    state: normalizeGitHubWorkItemState(payload.state),
    author: payload.author ? gitHubActor(payload.author) : null,
    assignees: payload.assignees.map(gitHubActor),
    labels: payload.labels.map((label) => label.name),
    webUrl: parsed.url,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
    closedAt: payload.closedAt,
    extensions: { github: { state: payload.state } },
  };
}

export function normalizeGitHubWorkItemState(state: string): WorkItem["state"] {
  if (state === "OPEN") return "open";
  if (state === "CLOSED") return "closed";
  throw unexpectedGitHubPayload(`unknown issue state ${state}`);
}

function requireGitHubRepository(
  repository: RepositoryIdentity,
): RepositoryIdentity {
  if (repository.providerId !== "github" || repository.namespace.length !== 1) {
    throw DaemonError.invalidRequest("A GitHub repository is required.");
  }
  return repository;
}

function gitHubActor(actor: {
  avatarUrl?: string | null;
  id?: string | null;
  login: string;
  name?: string | null;
  url?: string | null;
}) {
  return {
    id: actor.id ?? null,
    login: actor.login,
    displayName: actor.name ?? null,
    avatarUrl: actor.avatarUrl ?? null,
    webUrl: actor.url ?? null,
  };
}

function buildResolvedItem(
  parsed: ParsedGitHubUrl,
  json: unknown,
): GitHubResolvedItem {
  if (parsed.kind === "issue") {
    const payload = gitHubIssuePayloadSchema(json);
    if (payload instanceof arkType.errors) {
      throw unexpectedGitHubPayload(payload.summary);
    }
    const identity = gitHubPayloadIdentity(parsed, payload.number, payload.url);
    const { body } = truncateBody(payload.body ?? "");
    return finalizeResolvedItem(identity, {
      author: payload.author?.login ?? null,
      body,
      state: payload.state,
      title: payload.title,
      url: payload.url,
    });
  }

  const payload = gitHubPullRequestPayloadSchema(json);
  if (payload instanceof arkType.errors) {
    throw unexpectedGitHubPayload(payload.summary);
  }
  const identity = gitHubPayloadIdentity(parsed, payload.number, payload.url);
  const { body } = truncateBody(payload.body ?? "");
  return finalizeResolvedItem(identity, {
    author: payload.author?.login ?? null,
    baseRefName: payload.baseRefName,
    body,
    headRefName: payload.headRefName,
    isDraft: payload.isDraft,
    isCrossRepository: payload.isCrossRepository,
    state: payload.state,
    title: payload.title,
    url: payload.url,
  });
}

type ResolvedGitHubFields = Omit<
  GitHubResolvedItem,
  "contextText" | "kind" | "number" | "owner" | "repo"
>;

function finalizeResolvedItem(
  parsed: ParsedGitHubUrl,
  fields: ResolvedGitHubFields,
): GitHubResolvedItem {
  const item = {
    ...parsed,
    ...fields,
  };
  return {
    ...item,
    contextText: formatGitHubContextText(item),
  };
}

function gitHubPayloadIdentity(
  parsed: ParsedGitHubUrl,
  number: number,
  url: string,
): ParsedGitHubUrl {
  const resolved = parseGitHubUrl(url);
  if (
    resolved !== null &&
    resolved.kind === parsed.kind &&
    resolved.number === parsed.number &&
    number === parsed.number
  ) {
    return resolved;
  }
  throw unexpectedGitHubPayload(
    `expected ${parsed.url}, received item #${number} at ${url}`,
  );
}

function unexpectedGitHubPayload(details: string): DaemonError {
  return GitHubError.sourceControlFetchFailed(
    new TypeError(`Unexpected GitHub CLI payload: ${details}`),
  );
}
