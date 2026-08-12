import type {
  ResolvedTaskLink,
  TaskLinkResolveInput,
} from "@angel-engine/daemon-api/links";
import type {
  ChangeRequest,
  WorkItem,
} from "@angel-engine/daemon-api/source-control";
import { Effect } from "effect";
import { DaemonError } from "../../platform/errors";
import { createSourceControlRegistry } from "../source-control/providers";
import type { SourceControlRegistry } from "../source-control/registry/registry";
import { resolveLinearIssue } from "./linear-api";
import { parseTaskLink } from "./parse";

export function resolveTaskLink(
  input: TaskLinkResolveInput,
  registry: SourceControlRegistry = createSourceControlRegistry(),
): Effect.Effect<ResolvedTaskLink, DaemonError> {
  return Effect.gen(function* () {
    const parsed = parseTaskLink(input.url, registry);
    if (parsed === null) {
      return yield* Effect.fail(DaemonError.linkUnsupported());
    }
    if (parsed.provider === "linear") return yield* resolveLinearIssue(parsed);

    const resolution = yield* Effect.tryPromise({
      catch: (cause) => DaemonError.sourceControlFetchFailed(cause),
      try: () => registry.resolveLink(parsed.url),
    });
    if (resolution.status !== "resolved") {
      return yield* Effect.fail(DaemonError.linkUnsupported());
    }
    if (resolution.descriptor.kind === "work-item") {
      return legacyWorkItem(resolution.item as WorkItem);
    }
    const item = resolution.item as ChangeRequest;
    const isCrossRepository =
      item.source.repository.providerId !== item.repository.providerId ||
      item.source.repository.host !== item.repository.host ||
      item.source.repository.displayPath !== item.repository.displayPath;
    if (isCrossRepository) {
      return yield* Effect.fail(DaemonError.prFromForkUnsupported());
    }
    return legacyChangeRequest(item, isCrossRepository);
  });
}

function legacyWorkItem(item: WorkItem): ResolvedTaskLink {
  const number = item.number ?? Number(item.id);
  const owner = item.repository.namespace.join("/");
  const contextText = formatContext({
    author: item.author?.login ?? null,
    body: item.body,
    kind: "Issue",
    number,
    repository: item.repository.displayPath,
    state: item.state,
    title: item.title,
    url: item.webUrl,
  });
  return {
    author: item.author?.login ?? null,
    body: item.body,
    contextText,
    kind: "issue",
    number,
    owner,
    provider: "github",
    repo: item.repository.name,
    state: item.state.toUpperCase(),
    title: item.title,
    url: item.webUrl,
  };
}

function legacyChangeRequest(
  item: ChangeRequest,
  isCrossRepository: boolean,
): ResolvedTaskLink {
  const number = item.number ?? Number(item.id);
  const owner = item.repository.namespace.join("/");
  const contextText = formatContext({
    author: item.author?.login ?? null,
    body: item.body,
    branches: `${item.target.name} ← ${item.source.name}`,
    draft: item.draft,
    kind: "Pull Request",
    number,
    repository: item.repository.displayPath,
    state: item.state,
    title: item.title,
    url: item.webUrl,
  });
  return {
    author: item.author?.login ?? null,
    baseRefName: item.target.name,
    body: item.body,
    contextText,
    headRefName: item.source.name,
    isCrossRepository,
    isDraft: item.draft,
    kind: "pullRequest",
    number,
    owner,
    provider: "github",
    repo: item.repository.name,
    state: item.state.toUpperCase(),
    title: item.title,
    url: item.webUrl,
  };
}

function formatContext(item: {
  author: string | null;
  body: string;
  branches?: string;
  draft?: boolean;
  kind: "Issue" | "Pull Request";
  number: number;
  repository: string;
  state: string;
  title: string;
  url: string;
}) {
  const lines = [
    `GitHub ${item.kind} #${item.number} — ${item.title}`,
    "",
    `Repository: ${item.repository}`,
    `Source: ${item.url}`,
    `State: ${item.state.toUpperCase()}`,
  ];
  if (item.author) lines.push(`Author: @${item.author}`);
  if (item.branches) lines.push(`Branches: ${item.branches}`);
  if (item.draft) lines.push("Draft: yes");
  lines.push("", "Body:", item.body.length > 0 ? item.body : "(empty)");
  return lines.join("\n");
}
