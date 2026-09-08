import type {
  NumberedItemInput,
  ProbeContext,
  ProviderMatch,
  ProviderOperationContext,
  RemoteDescriptor,
  RepositoryIdentity,
  SourceControlActor,
  SourceControlProviderPlugin,
} from "@angel-engine/daemon-api/source-control";
import { type as arkType } from "arktype";

import { DaemonError } from "../../../../platform/errors";
import { executeGit, type LocalGitRunner } from "../../local-git/backend";
import { credentialedClone } from "../../local-git/credentialed-clone";
import {
  createProviderCliRunner,
  findProviderCli,
  type ProviderCliRunner,
} from "../provider-cli";

const PROVIDER_ID = "gitlab";
const PUBLIC_HOSTS = new Set(["gitlab.com", "www.gitlab.com"]);
const positiveInteger = arkType("number").narrow(
  (value) => Number.isInteger(value) && value > 0,
);
const actorSchema = arkType({
  "+": "ignore",
  "avatar_url?": "string | null",
  "id?": "number | string | null",
  "name?": "string | null",
  username: "string > 0",
  "web_url?": "string | null",
});
const projectSchema = arkType({
  "+": "ignore",
  id: "number | string",
  name: "string > 0",
  path_with_namespace: "string > 0",
  web_url: "string > 0",
});
const groupSchema = arkType({
  "+": "ignore",
  "avatar_url?": "string | null",
  full_path: "string > 0",
  id: "number | string",
  name: "string > 0",
});
interface GitLabDependencies {
  findGlab?: () => Promise<string | null>;
  getToken?: () => Promise<string | null>;
  runGit?: LocalGitRunner;
  runGlab?: ProviderCliRunner;
}

export function createGitLabPlugin(
  dependencies: GitLabDependencies = {},
): SourceControlProviderPlugin {
  const findGlab = dependencies.findGlab ?? (() => findProviderCli("glab"));
  const runGlab = dependencies.runGlab ?? createProviderCliRunner("glab");
  const runGit = dependencies.runGit ?? executeGit;
  const getToken =
    dependencies.getToken ??
    (async () => process.env.GITLAB_TOKEN ?? process.env.GLAB_TOKEN ?? null);
  const api = <Output>(
    host: string,
    endpoint: string,
    schema: (value: unknown) => Output | arkType.errors,
    context: ProviderOperationContext,
    extra: readonly string[] = [],
  ) => gitLabJson(runGlab, host, endpoint, schema, context, extra);

  return {
    manifest: {
      capabilities: [
        "provider.auth",
        "discovery.listNamespaces",
        "discovery.listRepositories",
        "repositoryIdentity",
        "provider.clone",
      ],
      displayName: "GitLab",
      hosts: ["gitlab.com"],
      id: PROVIDER_ID,
      unsupportedCapabilities: {
},
    },
    discovery: {
      match: matchGitLab,
      checkReadiness: async (match, context) =>
        gitLabReadiness(findGlab, runGlab, match, context),
      listNamespaces: async (input, context) => {
        const groups = await api(
          "gitlab.com",
          `/groups?per_page=${input.limit}&search=${encodeURIComponent(input.query ?? "")}`,
          groupSchema.array(),
          context,
        );
        return groups.map((group) => ({
          avatarUrl: group.avatar_url ?? null,
          id: String(group.id),
          name: group.name,
          path: group.full_path.split("/"),
        }));
      },
      listRepositories: async (input, context) => {
        const endpoint = input.namespace
          ? `/groups/${encodeURIComponent(input.namespace.join("/"))}/projects?include_subgroups=true&per_page=${input.limit}&search=${encodeURIComponent(input.query ?? "")}`
          : `/projects?membership=true&simple=true&per_page=${input.limit}&search=${encodeURIComponent(input.query ?? "")}`;
        const projects = await api(
          "gitlab.com",
          endpoint,
          projectSchema.array(),
          context,
        );
        return projects.map((project) =>
          projectIdentity(project, "gitlab.com"),
        );
      },
    },
    auth: {
      status: async (input, context) =>
        gitLabAuthStatus(
          findGlab,
          runGlab,
          remoteHost(input.remote.url),
          context,
        ),
    },
    git: {
      parseUrl: parseGitLabRepositoryUrl,
      clone: async (input, context) => {
        assertGitLabRepository(input.repository);
        const remoteUrl = `${input.repository.webUrl}.git`;
        await credentialedClone({
          cli: {
            clone: async (targetPath, timeoutMs) => {
              await runGlab(["repo", "clone", remoteUrl, targetPath], {
                signal: context.signal,
                timeoutMs,
              });
            },
            isAuthenticated: async () => {
              if ((await findGlab()) === null) return false;
              try {
                await runGlab(
                  ["auth", "status", "--hostname", input.repository.host],
                  { signal: context.signal, timeoutMs: remaining(context) },
                );
                return true;
              } catch {
                return false;
              }
            },
          },
          context,
          getToken,
          remoteUrl,
          runGit,
          targetPath: input.targetPath,
        });
        return { projectPath: input.targetPath };
      },
    },
    repositories: { parseUrl: parseGitLabRepositoryUrl },
};
}

function matchGitLab(
  context: ProbeContext,
): ProviderMatch | readonly ProviderMatch[] | null {
  const matches = context.remotes.flatMap((remote) => {
    const host = remoteHost(remote.url);
    if (!PUBLIC_HOSTS.has(host) && context.hostMappings[host] !== PROVIDER_ID) {
      return [];
    }
    const repository = parseGitLabRepositoryUrl(remote.url, host);
    if (!repository) return [];
    const source = matchSource(context, remote);
    return [{ providerId: PROVIDER_ID, remote, repository, ...source }];
  });
  return matches.length === 0
    ? null
    : matches.length === 1
      ? matches[0]
      : matches;
}

function matchSource(context: ProbeContext, remote: RemoteDescriptor) {
  if (
    context.explicitProviderId === PROVIDER_ID &&
    (context.explicitRemote === null || context.explicitRemote === remote.name)
  )
    return { score: 400, source: "explicit" as const };
  if (context.upstreamRemote === remote.name)
    return { score: 300, source: "upstream" as const };
  if (context.defaultRemote === remote.name)
    return { score: 200, source: "default-remote" as const };
  return { score: 100, source: "remote" as const };
}

async function gitLabReadiness(
  findGlab: () => Promise<string | null>,
  runGlab: ProviderCliRunner,
  match: ProviderMatch,
  context: ProviderOperationContext,
) {
  return gitLabAuthStatus(
    findGlab,
    runGlab,
    remoteHost(match.remote.url),
    context,
  );
}

async function gitLabAuthStatus(
  findGlab: () => Promise<string | null>,
  runGlab: ProviderCliRunner,
  host: string,
  context: ProviderOperationContext,
) {
  if ((await findGlab()) === null) {
    return {
      authentication: "unavailable" as const,
      diagnostics: [
        {
          code: "source-control/cli-missing",
          message: "GitLab CLI (glab) is not installed or not on PATH.",
          severity: "error" as const,
        },
      ],
    };
  }
  try {
    await runGlab(["auth", "status", "--hostname", host], {
      signal: context.signal,
      timeoutMs: remaining(context),
    });
    return { authentication: "authenticated" as const, diagnostics: [] };
  } catch {
    return {
      authentication: "unauthenticated" as const,
      diagnostics: [
        {
          code: "source-control/unauthenticated",
          message: `GitLab CLI is not authenticated for ${host}.`,
          severity: "warning" as const,
        },
      ],
    };
  }
}

export function parseGitLabRepositoryUrl(
  raw: string,
  allowedHost?: string,
): RepositoryIdentity | null {
  const location = remoteLocation(raw);
  if (!location) return null;
  if (
    allowedHost === undefined &&
    !PUBLIC_HOSTS.has(location.host) &&
    !location.host.includes("gitlab")
  )
    return null;
  if (allowedHost !== undefined && location.host !== allowedHost) return null;
  const segments = location.pathname.split("/").filter(Boolean);
  const marker = segments.indexOf("-");
  const repositorySegments = marker >= 0 ? segments.slice(0, marker) : segments;
  if (repositorySegments.length < 2) return null;
  const rawName = repositorySegments.at(-1)!;
  const name = rawName.endsWith(".git") ? rawName.slice(0, -4) : rawName;
  const namespace = repositorySegments.slice(0, -1);
  return {
    displayPath: [...namespace, name].join("/"),
    host: location.host,
    name,
    namespace,
    providerId: PROVIDER_ID,
    remoteId: null,
    webUrl: `https://${location.host}/${[...namespace, name].join("/")}`,
  };
}

function parseGitLabItemUrl(raw: string) {
  const repository = parseGitLabRepositoryUrl(raw);
  if (!repository) return null;
  const location = remoteLocation(raw);
  if (!location) return null;
  const segments = location.pathname.split("/").filter(Boolean);
  const marker = segments.indexOf("-");
  if (marker < 0 || segments.length < marker + 3) return null;
  const type = segments[marker + 1];
  const id = segments[marker + 2];
  if (!/^\d+$/.test(id)) return null;
  if (type === "issues") return { id, kind: "issue" as const, repository };
  if (type === "merge_requests")
    return { id, kind: "merge-request" as const, repository };
  return null;
}

async function gitLabJson<Output>(
  runGlab: ProviderCliRunner,
  host: string,
  endpoint: string,
  schema: (value: unknown) => Output | arkType.errors,
  context: ProviderOperationContext,
  extra: readonly string[] = [],
): Promise<Output> {
  let output: string;
  try {
    output = (
      await runGlab(["api", "--hostname", host, endpoint, ...extra], {
        signal: context.signal,
        timeoutMs: remaining(context),
      })
    ).stdout;
  } catch (cause) {
    throw DaemonError.sourceControlFetchFailed(
      PROVIDER_ID,
      cause,
      "GitLab request failed.",
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(output);
  } catch (cause) {
    throw DaemonError.sourceControlFetchFailed(
      PROVIDER_ID,
      cause,
      "GitLab CLI returned invalid JSON.",
    );
  }
  const parsed = schema(json);
  if (parsed instanceof arkType.errors) {
    throw DaemonError.sourceControlFetchFailed(
      PROVIDER_ID,
      new TypeError(`Unexpected GitLab payload: ${parsed.summary}`),
    );
  }
  return parsed;
}

function projectIdentity(project: typeof projectSchema.infer, host: string) {
  const segments = project.path_with_namespace.split("/");
  return {
    displayPath: project.path_with_namespace,
    host,
    name: segments.at(-1)!,
    namespace: segments.slice(0, -1),
    providerId: PROVIDER_ID,
    remoteId: String(project.id),
    webUrl: project.web_url,
  } satisfies RepositoryIdentity;
}

function mapActor(actor: typeof actorSchema.infer): SourceControlActor {
  return {
    avatarUrl: actor.avatar_url ?? null,
    displayName: actor.name ?? null,
    id: actor.id === null || actor.id === undefined ? null : String(actor.id),
    login: actor.username,
    webUrl: actor.web_url ?? null,
  };
}

function projectEndpoint(repository: RepositoryIdentity) {
  assertGitLabRepository(repository);
  return `/projects/${encodeURIComponent(repository.remoteId ?? repository.displayPath)}`;
}

function assertGitLabRepository(repository: RepositoryIdentity) {
  if (
    repository.providerId !== PROVIDER_ID ||
    repository.namespace.length < 1
  ) {
    throw new TypeError("A GitLab repository is required.");
  }
}

function remoteLocation(raw: string) {
  const trimmed = raw.trim();
  const scp = /^[\w.-]+@([^:]+):(.+)$/.exec(trimmed);
  if (scp) return { host: scp[1].toLowerCase(), pathname: scp[2] };
  try {
    const url = new URL(trimmed);
    return { host: url.hostname.toLowerCase(), pathname: url.pathname };
  } catch {
    return null;
  }
}

function remoteHost(remoteUrl: string) {
  return remoteLocation(remoteUrl)?.host ?? "gitlab.com";
}

function remaining(context: ProviderOperationContext) {
  return Math.max(1, context.deadline - Date.now());
}
