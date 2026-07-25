import type {
  GitHubItemKind,
  GitHubResolveUrlInput,
  GitHubResolvedItem,
} from "@angel-engine/daemon-api/github";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import is from "@sindresorhus/is";
import { Effect } from "effect";
import which from "which";

import { DaemonError } from "../../platform/errors";

const execFileAsync = promisify(execFile);
const GH_OUTPUT_MAX_BUFFER = 2 * 1024 * 1024;
const BODY_MAX_CHARS = 12_000;
const GH_TIMEOUT_MS = 30_000;

export interface ParsedGitHubUrl {
  kind: GitHubItemKind;
  number: number;
  owner: string;
  repo: string;
  url: string;
}

export type GhRunner = (args: string[]) => Promise<{
  stderr: string;
  stdout: string;
}>;

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
      return yield* Effect.fail(DaemonError.githubUrlUnsupported());
    }

    const whichGh =
      deps.whichGh ?? (async () => which("gh", { nothrow: true }));
    const ghPath = yield* Effect.tryPromise({
      catch: (cause) => DaemonError.githubFetchFailed(cause),
      try: whichGh,
    });
    if (!is.nonEmptyString(ghPath)) {
      return yield* Effect.fail(DaemonError.githubCliMissing());
    }

    const runGh = deps.runGh ?? defaultRunGh;
    const fields =
      parsed.kind === "issue"
        ? "number,title,body,state,author,url"
        : "number,title,body,state,author,url,baseRefName,headRefName,isDraft";
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
      try: () => buildResolvedItem(parsed, json),
    });
  });
}

function buildResolvedItem(
  parsed: ParsedGitHubUrl,
  json: unknown,
): GitHubResolvedItem {
  if (!is.plainObject(json)) {
    throw DaemonError.githubFetchFailed(
      new Error("Unexpected GitHub CLI payload."),
    );
  }

  const title = stringField(json, "title") ?? `Untitled #${parsed.number}`;
  const state = stringField(json, "state") ?? "unknown";
  const url = stringField(json, "url") ?? parsed.url;
  const author = authorLogin(json.author);
  const rawBody = stringField(json, "body") ?? "";
  const { body } = truncateBody(rawBody);
  const baseRefName = stringField(json, "baseRefName");
  const headRefName = stringField(json, "headRefName");
  const isDraft = typeof json.isDraft === "boolean" ? json.isDraft : undefined;

  const contextText = formatGitHubContextText({
    author,
    baseRefName: baseRefName ?? undefined,
    body,
    headRefName: headRefName ?? undefined,
    isDraft,
    kind: parsed.kind,
    number: parsed.number,
    owner: parsed.owner,
    repo: parsed.repo,
    state,
    title,
    url,
  });

  return {
    author,
    ...(baseRefName !== null ? { baseRefName } : {}),
    body,
    contextText,
    ...(headRefName !== null ? { headRefName } : {}),
    ...(isDraft !== undefined ? { isDraft } : {}),
    kind: parsed.kind,
    number: parsed.number,
    owner: parsed.owner,
    repo: parsed.repo,
    state,
    title,
    url,
  };
}

function stringField(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function authorLogin(author: unknown): string | null {
  if (!is.plainObject(author)) return null;
  const login = author.login;
  return typeof login === "string" && login.length > 0 ? login : null;
}

function normalizeText(value: string) {
  return value
    .replaceAll("\u0000", "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .trim();
}

async function defaultRunGh(args: string[]) {
  const result = await execFileAsync("gh", args, {
    env: {
      ...process.env,
      GH_NO_UPDATE_NOTIFIER: "1",
      GH_PAGER: "cat",
      GH_PROMPT_DISABLED: "1",
      GIT_TERMINAL_PROMPT: "0",
      NO_COLOR: "1",
    },
    maxBuffer: GH_OUTPUT_MAX_BUFFER,
    timeout: GH_TIMEOUT_MS,
  });
  return {
    stderr: result.stderr.toString(),
    stdout: result.stdout.toString(),
  };
}

function mapGhFailure(cause: unknown): DaemonError {
  const message = stderrOrMessage(cause).toLowerCase();
  if (
    message.includes("not logged into") ||
    message.includes("to re-authenticate") ||
    message.includes("authentication required") ||
    message.includes("gh auth login")
  ) {
    return DaemonError.githubCliUnauthenticated(
      "GitHub CLI is not authenticated. Run `gh auth login` and try again.",
    );
  }
  if (
    message.includes("could not resolve") ||
    message.includes("not found") ||
    message.includes("http 404") ||
    message.includes("status 404")
  ) {
    return DaemonError.githubItemNotFound();
  }
  return DaemonError.githubFetchFailed(cause);
}

function stderrOrMessage(cause: unknown): string {
  if (typeof cause === "object" && cause !== null) {
    const record = cause as { message?: unknown; stderr?: unknown };
    if (typeof record.stderr === "string" && record.stderr.trim().length > 0) {
      return record.stderr;
    }
    if (typeof record.message === "string") {
      return record.message;
    }
  }
  if (cause instanceof Error) return cause.message;
  return String(cause);
}
