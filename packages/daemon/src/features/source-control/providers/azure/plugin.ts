import type {
  ChangeRequest,
  MergeRequirement,
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
import {
  createProviderCliRunner,
  findProviderCli,
  type ProviderCliRunner,
} from "../provider-cli";

const PROVIDER_ID = "azure-devops";
const PUBLIC_HOSTS = new Set([
  "dev.azure.com",
  "ssh.dev.azure.com",
  "vs-ssh.visualstudio.com",
]);
const actorSchema = arkType({
  "+": "ignore",
  "displayName?": "string | null",
  "id?": "string | null",
  "imageUrl?": "string | null",
  "uniqueName?": "string | null",
});
const repositorySchema = arkType({
  "+": "ignore",
  id: "string > 0",
  name: "string > 0",
  "project?": arkType({ "+": "ignore", id: "string > 0", name: "string > 0" }),
  "remoteUrl?": "string | null",
  "webUrl?": "string | null",
});
const projectSchema = arkType({
  "+": "ignore",
  id: "string > 0",
  name: "string > 0",
});
const projectListSchema = arkType({
  "+": "ignore",
  value: projectSchema.array(),
});
const policySchema = arkType({
  "+": "ignore",
  isBlocking: "boolean",
  "id?": "number | string",
  "isEnabled?": "boolean",
  "type?": arkType({
    "+": "ignore",
    "displayName?": "string | null",
    "id?": "string | null",
  }),
  "url?": "string | null",
});
const pullRequestSchema = arkType({
  "+": "ignore",
  "closedDate?": "string | null",
  creationDate: "string > 0",
  createdBy: actorSchema,
  description: "string | null",
  pullRequestId: "number.integer >= 1",
  repository: repositorySchema,
  sourceRefName: "string > 0",
  status: "string > 0",
  targetRefName: "string > 0",
  title: "string > 0",
  "url?": "string | null",
});

interface AzureDependencies {
  findAz?: () => Promise<string | null>;
  runAz?: ProviderCliRunner;
}

export function createAzureDevOpsPlugin(
  dependencies: AzureDependencies = {},
): SourceControlProviderPlugin {
  const findAz = dependencies.findAz ?? (() => findProviderCli("az"));
  const runAz = dependencies.runAz ?? createProviderCliRunner("az");
  const json = <Output>(
    args: readonly string[],
    schema: (value: unknown) => Output | arkType.errors,
    context: ProviderOperationContext,
  ) => azureJson(runAz, args, schema, context);
  return {
    manifest: {
      capabilities: [
        "provider.auth",
        "discovery.listNamespaces",
        "discovery.listRepositories",
        "repositoryIdentity",
        "changeRequests.list",
        "changeRequests.get",
      ],
      displayName: "Azure DevOps",
      hosts: ["dev.azure.com"],
      id: PROVIDER_ID,
      unsupportedCapabilities: Object.fromEntries(
        [
          "changeRequests.create",
          "changeRequests.getByUrl",
          "changeRequests.status",
          "changeRequests.comment",
          "changeRequests.merge",
          "changeRequests.preflight",
          "changeRequests.resolveHead",
          "checks.list",
          "checks.snapshot",
          "checks.failureLog",
          "checks.fixPrompt",
          "reviewThreads.list",
          "reviewThreads.resolve",
          "workItems.get",
          "workItems.getByUrl",
          "workItems.list",
          "branches.publish",
          "provider.clone",
        ].map((capability) => [
          capability,
          {
            kind: "out-of-scope" as const,
            message:
              "This capability is outside the Azure DevOps minimum adapter.",
          },
        ]),
      ),
    },
    discovery: {
      match: matchAzure,
      checkReadiness: async (match, context) =>
        azureAuthStatus(findAz, runAz, context, match.remote.url),
      listNamespaces: async (input, context) => {
        const projects = await json(
          ["devops", "project", "list", "--top", String(input.limit)],
          projectListSchema,
          context,
        );
        const query = input.query?.toLowerCase() ?? "";
        return projects.value
          .filter((project) => project.name.toLowerCase().includes(query))
          .map((project) => ({
            avatarUrl: null,
            id: project.id,
            name: project.name,
            path: [project.name],
          }));
      },
      listRepositories: async (input, context) => {
        if (
          !input.namespace ||
          input.namespace.length < 1 ||
          input.namespace.length > 2
        ) {
          throw DaemonError.invalidRequest(
            "Azure repository discovery requires a project or organization/project namespace.",
          );
        }
        const project = input.namespace.at(-1)!;
        const organization =
          input.namespace.length === 2 ? input.namespace[0] : null;
        const repositories = await json(
          [
            "repos",
            "list",
            "--project",
            project,
            ...(organization
              ? ["--organization", organizationUrl(organization)]
              : []),
          ],
          repositorySchema.array(),
          context,
        );
        const query = input.query?.toLowerCase() ?? "";
        return repositories
          .filter((repository) => repository.name.toLowerCase().includes(query))
          .slice(0, input.limit)
          .map((repository) =>
            azureRepositoryIdentity(repository, organization, project),
          );
      },
    },
    auth: {
      status: async (input, context) =>
        azureAuthStatus(findAz, runAz, context, input.remote.url),
    },
    git: {
      parseUrl: parseAzureRepositoryUrl,
      parseChangeRequestUrl: (url) => {
        const parsed = parseAzurePullRequestUrl(url);
        return parsed ? { id: parsed.id, repository: parsed.repository } : null;
      },
    },
    repositories: { parseUrl: parseAzureRepositoryUrl },
    changeRequests: {
      list: async (input, context) => {
        assertAzureRepository(input.repository);
        const orgUrl = azureOrganizationUrl(input.repository);
        const output = await json(
          [
            "repos",
            "pr",
            "list",
            "--repository",
            input.repository.remoteId ?? input.repository.name,
            "--project",
            input.repository.namespace[1],
            "--organization",
            orgUrl,
            "--status",
            "all",
            "--top",
            String(input.limit),
          ],
          pullRequestSchema.array(),
          context,
        );
        const query = input.query?.toLowerCase() ?? "";
        return output
          .filter((pullRequest) =>
            pullRequest.title.toLowerCase().includes(query),
          )
          .map((pullRequest) =>
            mapPullRequest(pullRequest, input.repository, []),
          );
      },
      get: async (input, context) => {
        assertAzureRepository(input.repository);
        const orgUrl = azureOrganizationUrl(input.repository);
        const [pullRequest, policies] = await Promise.all([
          json(
            ["repos", "pr", "show", "--id", input.id, "--organization", orgUrl],
            pullRequestSchema,
            context,
          ),
          json(
            [
              "repos",
              "policy",
              "list",
              "--repository-id",
              input.repository.remoteId ?? input.repository.name,
              "--project",
              input.repository.namespace[1],
              "--organization",
              orgUrl,
            ],
            policySchema.array(),
            context,
          ),
        ]);
        return mapPullRequest(
          pullRequest,
          input.repository,
          policies.map(mapPolicy),
        );
      },
    },
  };
}

function matchAzure(
  context: ProbeContext,
): ProviderMatch | readonly ProviderMatch[] | null {
  const matches = context.remotes.flatMap((remote) => {
    const host = remoteHost(remote.url);
    if (!PUBLIC_HOSTS.has(host) && context.hostMappings[host] !== PROVIDER_ID) {
      return [];
    }
    const repository = parseAzureRepositoryUrl(remote.url, host);
    if (!repository) return [];
    return [
      {
        providerId: PROVIDER_ID,
        remote,
        repository,
        ...matchSource(context, remote),
      },
    ];
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

async function azureAuthStatus(
  findAz: () => Promise<string | null>,
  runAz: ProviderCliRunner,
  context: ProviderOperationContext,
  remoteUrl?: string,
) {
  const host = remoteUrl ? remoteHost(remoteUrl) : "dev.azure.com";
  if (!PUBLIC_HOSTS.has(host) && !host.endsWith(".visualstudio.com")) {
    return {
      authentication: "unavailable" as const,
      diagnostics: [
        {
          code: "source-control/requires-configuration",
          message:
            "Azure DevOps Server is not supported by Azure CLI. Configure a supported Server integration before using hosted operations.",
          severity: "error" as const,
        },
      ],
    };
  }
  if ((await findAz()) === null) {
    return {
      authentication: "unavailable" as const,
      diagnostics: [
        {
          code: "source-control/cli-missing",
          message: "Azure CLI (az) is not installed or not on PATH.",
          severity: "error" as const,
        },
      ],
    };
  }
  try {
    await runAz(["account", "show", "--output", "json"], {
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
          message:
            "Azure CLI is not authenticated. Run `az login` and try again.",
          severity: "warning" as const,
        },
      ],
    };
  }
}

export function parseAzureRepositoryUrl(
  raw: string,
  allowedHost?: string,
): RepositoryIdentity | null {
  const location = remoteLocation(raw);
  if (!location) return null;
  if (
    allowedHost === undefined &&
    !PUBLIC_HOSTS.has(location.host) &&
    !location.host.endsWith(".visualstudio.com")
  )
    return null;
  if (allowedHost && location.host !== allowedHost) return null;
  const segments = location.pathname.split("/").filter(Boolean);
  if (
    location.host === "ssh.dev.azure.com" ||
    location.host === "vs-ssh.visualstudio.com"
  ) {
    const v3 = segments.indexOf("v3");
    const identity = segments.slice(v3 + 1);
    if (v3 < 0 || identity.length !== 3) return null;
    return azureIdentity(
      location.host,
      identity[0],
      identity[1],
      identity[2],
      `https://dev.azure.com/${identity[0]}`,
    );
  }
  const marker = segments.indexOf("_git");
  if (marker < 0 || !segments[marker + 1]) return null;
  const organization = location.host.endsWith(".visualstudio.com")
    ? location.host.split(".")[0]
    : segments[Math.max(0, marker - 2)];
  const project = segments[marker - 1];
  if (!organization || !project) return null;
  return azureIdentity(
    location.host,
    organization,
    project,
    segments[marker + 1],
    location.host.endsWith(".visualstudio.com")
      ? `https://${location.host}`
      : `https://${location.host}/${segments.slice(0, marker - 1).join("/")}`,
    `https://${location.host}/${segments.slice(0, marker + 2).join("/")}`,
  );
}

function parseAzurePullRequestUrl(raw: string) {
  const repository = parseAzureRepositoryUrl(raw);
  if (!repository) return null;
  const match = /\/pullrequest\/(\d+)(?:\/|$)/.exec(raw);
  return match ? { id: match[1], repository } : null;
}

function azureIdentity(
  host: string,
  organization: string,
  project: string,
  name: string,
  orgUrl: string,
  webUrl?: string,
): RepositoryIdentity {
  const canonicalHost = PUBLIC_HOSTS.has(host) ? "dev.azure.com" : host;
  return {
    displayPath: `${organization}/${project}/${name}`,
    extensions: { azure: { orgUrl } },
    host: canonicalHost,
    name,
    namespace: [organization, project],
    providerId: PROVIDER_ID,
    remoteId: null,
    webUrl:
      webUrl ??
      `https://${canonicalHost}/${organization}/${project}/_git/${name}`,
  };
}

function azureRepositoryIdentity(
  repository: typeof repositorySchema.infer,
  organization: string | null,
  project: string,
): RepositoryIdentity {
  const parsed =
    organization === null && repository.webUrl
      ? parseAzureRepositoryUrl(repository.webUrl)
      : null;
  if (parsed) {
    return {
      ...parsed,
      extensions: {
        azure: {
          ...(parsed.extensions?.azure as object),
          projectId: repository.project?.id ?? null,
        },
      },
      remoteId: repository.id,
    };
  }
  const orgUrl = organizationUrl(organization ?? "default");
  const resolvedOrganization = organization ?? organizationFromUrl(orgUrl);
  return {
    displayPath: `${resolvedOrganization}/${project}/${repository.name}`,
    extensions: {
      azure: { orgUrl, projectId: repository.project?.id ?? null },
    },
    host: "dev.azure.com",
    name: repository.name,
    namespace: [resolvedOrganization, project],
    providerId: PROVIDER_ID,
    remoteId: repository.id,
    webUrl: repository.webUrl ?? repository.remoteUrl ?? null,
  };
}

function mapPullRequest(
  pullRequest: typeof pullRequestSchema.infer,
  repository: RepositoryIdentity,
  requirements: readonly MergeRequirement[],
): ChangeRequest {
  const source = pullRequest.sourceRefName.replace(/^refs\/heads\//, "");
  const target = pullRequest.targetRefName.replace(/^refs\/heads\//, "");
  const state = pullRequest.status.toLowerCase();
  return {
    additions: null,
    allowedMergeMethods: [],
    author: mapActor(pullRequest.createdBy),
    body: pullRequest.description ?? "",
    changedFiles: null,
    commitCount: null,
    createdAt: pullRequest.creationDate,
    defaultMergeMethod: null,
    deletions: null,
    draft: false,
    id: String(pullRequest.pullRequestId),
    mergeRequirements: requirements,
    mergedAt: state === "completed" ? (pullRequest.closedDate ?? null) : null,
    number: pullRequest.pullRequestId,
    repository,
    reviewDecision: "none",
    source: { name: source, oid: null, repository },
    state:
      state === "active" ? "open" : state === "completed" ? "merged" : "closed",
    target: { name: target, oid: null, repository },
    title: pullRequest.title,
    updatedAt: pullRequest.closedDate ?? pullRequest.creationDate,
    viewerCanMerge: null,
    webUrl: `${repository.webUrl}/pullrequest/${pullRequest.pullRequestId}`,
  };
}

function mapActor(actor: typeof actorSchema.infer): SourceControlActor {
  return {
    avatarUrl: actor.imageUrl ?? null,
    displayName: actor.displayName ?? null,
    id: actor.id ?? null,
    login: actor.uniqueName ?? actor.displayName ?? "unknown",
    webUrl: null,
  };
}

function mapPolicy(policy: typeof policySchema.infer): MergeRequirement {
  const label = policy.type?.displayName ?? "Azure branch policy";
  const normalized = label.toLowerCase();
  const kind = normalized.includes("reviewer")
    ? "review-approval"
    : normalized.includes("comment")
      ? "unresolved-discussions"
      : normalized.includes("work item")
        ? "linked-work-items"
        : normalized.includes("build")
          ? "checks"
          : "other";
  return {
    blocking: policy.isBlocking,
    detailsUrl: policy.url ?? null,
    id: String(policy.id ?? policy.type?.id ?? label),
    kind,
    label,
    state: policy.isEnabled === false ? "not-applicable" : "pending",
  };
}

async function azureJson<Output>(
  runAz: ProviderCliRunner,
  args: readonly string[],
  schema: (value: unknown) => Output | arkType.errors,
  context: ProviderOperationContext,
): Promise<Output> {
  let output: string;
  try {
    output = (
      await runAz([...args, "--output", "json", "--only-show-errors"], {
        signal: context.signal,
        timeoutMs: remaining(context),
      })
    ).stdout;
  } catch (cause) {
    throw DaemonError.sourceControlFetchFailed(
      PROVIDER_ID,
      cause,
      "Azure DevOps request failed.",
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(output);
  } catch (cause) {
    throw DaemonError.sourceControlFetchFailed(
      PROVIDER_ID,
      cause,
      "Azure CLI returned invalid JSON.",
    );
  }
  const parsed = schema(json);
  if (parsed instanceof arkType.errors) {
    throw DaemonError.sourceControlFetchFailed(
      PROVIDER_ID,
      new TypeError(`Unexpected Azure CLI payload: ${parsed.summary}`),
    );
  }
  return parsed;
}

function assertAzureRepository(repository: RepositoryIdentity) {
  if (
    repository.providerId !== PROVIDER_ID ||
    repository.namespace.length !== 2
  ) {
    throw new TypeError(
      "An Azure DevOps organization/project/repository identity is required.",
    );
  }
}

function organizationUrl(organization: string) {
  return organization.startsWith("http")
    ? organization
    : `https://dev.azure.com/${organization}`;
}

function organizationFromUrl(orgUrl: string) {
  try {
    return (
      new URL(orgUrl).pathname.split("/").filter(Boolean).at(-1) ?? "default"
    );
  } catch {
    return "default";
  }
}

function azureOrganizationUrl(repository: RepositoryIdentity) {
  const extension = repository.extensions?.azure;
  const orgUrl =
    extension && typeof extension === "object" && "orgUrl" in extension
      ? extension.orgUrl
      : null;
  if (typeof orgUrl !== "string") {
    throw DaemonError.sourceControlCapabilityUnsupported(
      "The Azure DevOps organization URL is missing from this repository identity.",
      PROVIDER_ID,
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(orgUrl);
  } catch {
    throw DaemonError.sourceControlCapabilityUnsupported(
      "The Azure DevOps organization URL is invalid.",
      PROVIDER_ID,
    );
  }
  if (
    parsed.protocol !== "https:" ||
    (parsed.hostname !== "dev.azure.com" &&
      !parsed.hostname.endsWith(".visualstudio.com"))
  ) {
    throw DaemonError.sourceControlCapabilityUnsupported(
      "Azure DevOps Server hosted operations require a Server-compatible integration; Azure CLI supports Azure DevOps Services only.",
      PROVIDER_ID,
    );
  }
  return parsed.toString().replace(/\/$/, "");
}

function remoteLocation(raw: string) {
  const scp = /^[\w.-]+@([^:]+):(.+)$/.exec(raw.trim());
  if (scp) return { host: scp[1].toLowerCase(), pathname: scp[2] };
  try {
    const url = new URL(raw.trim());
    return { host: url.hostname.toLowerCase(), pathname: url.pathname };
  } catch {
    return null;
  }
}

function remoteHost(remoteUrl: string) {
  return remoteLocation(remoteUrl)?.host ?? "dev.azure.com";
}

function remaining(context: ProviderOperationContext) {
  return Math.max(1, context.deadline - Date.now());
}
