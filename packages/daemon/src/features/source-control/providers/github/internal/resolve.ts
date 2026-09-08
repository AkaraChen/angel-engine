import type {
  NumberedItemInput,
  ProviderOperationContext,
  RepositoryIdentity,
  UrlOperationInput,
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
export interface ParsedGitHubUrl {
  kind: GitHubItemKind;
  number: number;
  owner: string;
  repo: string;
  url: string;
}

export function parseGitHubRepositoryUrl(
  raw: string,
  allowedHost?: string,
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
  if (
    allowedHost
      ? host !== allowedHost
      : host !== "github.com" && host !== "www.github.com"
  )
    return null;
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 2) return null;
  const namespace = segments[0];
  const name = segments[1].endsWith(".git")
    ? segments[1].slice(0, -4)
    : segments[1];
  if (!is.nonEmptyString(namespace) || !is.nonEmptyString(name)) return null;
  return gitHubRepositoryIdentity(namespace, name, host);
}

function gitHubRepositoryIdentity(
  namespace: string,
  name: string,
  host = "github.com",
): RepositoryIdentity {
  return {
    providerId: "github",
    host,
    namespace: [namespace],
    name,
    remoteId: null,
    displayPath: `${namespace}/${name}`,
    webUrl: `https://${host}/${namespace}/${name}`,
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
