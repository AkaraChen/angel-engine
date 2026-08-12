import type {
  AuthStatusResult,
  ProbeContext,
  ProviderMatch,
  ProviderOperationContext,
  ProviderReadiness,
  RemoteDescriptor,
  SourceControlProviderPlugin,
} from "@angel-engine/daemon-api/source-control";

import {
  extractProcessOutput,
  findGhPath,
  type GhRunner,
  runGhCli,
} from "./internal/gh-cli";
import { listGitHubWorkItems } from "./internal/list";
import {
  listGitHubNamespaces,
  listGitHubRepositoryIdentities,
} from "./internal/repos";
import {
  getGitHubWorkItem,
  getGitHubWorkItemByUrl,
  parseGitHubRepositoryUrl,
} from "./internal/resolve";

const PROVIDER_ID = "github";
const PUBLIC_HOSTS = new Set(["github.com", "www.github.com"]);

interface GitHubPluginDependencies {
  findGh?: () => Promise<string | null>;
  runGh?: GhRunner;
}

function remoteHost(remoteUrl: string): string | null {
  const scp = /^[\w.-]+@([\w.-]+):/.exec(remoteUrl.trim());
  if (scp) return scp[1].toLowerCase();
  try {
    return new URL(remoteUrl).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

function matchSource(
  context: ProbeContext,
  remote: RemoteDescriptor,
): Pick<ProviderMatch, "score" | "source"> {
  if (
    context.explicitProviderId === PROVIDER_ID &&
    (context.explicitRemote === null || context.explicitRemote === remote.name)
  ) {
    return { score: 400, source: "explicit" };
  }
  if (context.upstreamRemote === remote.name) {
    return { score: 300, source: "upstream" };
  }
  if (context.defaultRemote === remote.name) {
    return { score: 200, source: "default-remote" };
  }
  return { score: 100, source: "remote" };
}

function matchGitHub(context: ProbeContext): ProviderMatch | null {
  const candidates = context.remotes
    .filter((remote) => {
      const host = remoteHost(remote.url);
      if (host === null) return false;
      return (
        PUBLIC_HOSTS.has(host) || context.hostMappings[host] === PROVIDER_ID
      );
    })
    .map((remote) => ({ remote, ...matchSource(context, remote) }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.remote.name.localeCompare(right.remote.name),
    );
  const selected = candidates[0];
  if (!selected) return null;
  return {
    providerId: PROVIDER_ID,
    remote: selected.remote,
    repository: null,
    score: selected.score,
    source: selected.source,
  };
}

function diagnostic(
  code: string,
  message: string,
  severity: "warning" | "error",
): ProviderReadiness {
  return {
    authentication:
      code === "source-control/cli-missing" ? "unavailable" : "unauthenticated",
    diagnostics: [{ code, message, severity }],
  };
}

function causeMessage(cause: unknown) {
  return (
    extractProcessOutput(cause, "stderr") ??
    (cause instanceof Error ? cause.message : String(cause))
  ).trim();
}

async function authenticationStatus(
  input: { projectPath?: string; remote: RemoteDescriptor },
  context: ProviderOperationContext,
  dependencies: Required<GitHubPluginDependencies>,
): Promise<AuthStatusResult> {
  let ghPath: string | null;
  try {
    ghPath = await dependencies.findGh();
  } catch (cause) {
    return {
      authentication: "unknown",
      diagnostics: [
        {
          code: "source-control/readiness-failed",
          message: causeMessage(cause) || "Failed to locate GitHub CLI.",
          severity: "error",
        },
      ],
    };
  }
  if (ghPath === null) {
    return diagnostic(
      "source-control/cli-missing",
      "GitHub CLI (gh) is not installed or not on PATH.",
      "error",
    );
  }

  const host = remoteHost(input.remote.url) ?? "github.com";
  try {
    await dependencies.runGh(["auth", "status", "--hostname", host], {
      cwd: input.projectPath,
      timeoutMs: Math.max(1, context.deadline - Date.now()),
    });
    return { authentication: "authenticated", diagnostics: [] };
  } catch (cause) {
    const detail = causeMessage(cause);
    return diagnostic(
      "source-control/unauthenticated",
      detail || `GitHub CLI is not authenticated for ${host}.`,
      "warning",
    );
  }
}

export function createGitHubPlugin(
  dependencies: GitHubPluginDependencies = {},
): SourceControlProviderPlugin {
  const resolvedDependencies: Required<GitHubPluginDependencies> = {
    findGh: dependencies.findGh ?? findGhPath,
    runGh: dependencies.runGh ?? runGhCli,
  };
  return {
    manifest: {
      id: PROVIDER_ID,
      displayName: "GitHub",
      hosts: ["github.com"],
      capabilities: [
        "provider.auth",
        "discovery.listNamespaces",
        "discovery.listRepositories",
        "repositoryIdentity",
        "workItems.get",
        "workItems.getByUrl",
        "workItems.list",
      ],
    },
    discovery: {
      match: matchGitHub,
      checkReadiness: (match, context) =>
        authenticationStatus(
          { remote: match.remote },
          context,
          resolvedDependencies,
        ),
      listNamespaces: (input, context) =>
        listGitHubNamespaces(input, context, resolvedDependencies),
      listRepositories: (input, context) =>
        listGitHubRepositoryIdentities(input, context, resolvedDependencies),
    },
    auth: {
      status: (input, context) =>
        authenticationStatus(input, context, resolvedDependencies),
    },
    git: {
      parseUrl: parseGitHubRepositoryUrl,
      parseChangeRequestUrl: () => null,
    },
    repositories: {
      parseUrl: parseGitHubRepositoryUrl,
    },
    workItems: {
      get: (input, context) =>
        getGitHubWorkItem(input, context, resolvedDependencies),
      getByUrl: (input, context) =>
        getGitHubWorkItemByUrl(input, context, resolvedDependencies),
      list: (input, context) =>
        listGitHubWorkItems(input, context, resolvedDependencies),
    },
  };
}
