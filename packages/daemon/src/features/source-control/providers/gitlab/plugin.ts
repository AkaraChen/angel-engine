import type {
  ChangeRequest,
  CheckRun,
  CheckSummary,
  NumberedItemInput,
  ProbeContext,
  ProviderMatch,
  ProviderOperationContext,
  RemoteDescriptor,
  RepositoryIdentity,
  SourceControlActor,
  SourceControlProviderPlugin,
  WorkItem,
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
const issueSchema = arkType({
  "+": "ignore",
  assignees: actorSchema.array(),
  author: actorSchema,
  "closed_at?": "string | null",
  created_at: "string > 0",
  description: "string | null",
  iid: positiveInteger,
  labels: "string[]",
  state: "'opened' | 'closed'",
  title: "string > 0",
  updated_at: "string > 0",
  web_url: "string > 0",
});
const mergeRequestSchema = arkType({
  "+": "ignore",
  "additions?": "number | null",
  author: actorSchema,
  created_at: "string > 0",
  description: "string | null",
  detailed_merge_status: "string",
  draft: "boolean",
  iid: positiveInteger,
  merge_status: "string",
  merged_at: "string | null",
  source_branch: "string > 0",
  state: "'opened' | 'closed' | 'merged'",
  target_branch: "string > 0",
  title: "string > 0",
  updated_at: "string > 0",
  web_url: "string > 0",
});
const noteSchema = arkType({
  "+": "ignore",
  author: actorSchema,
  body: "string",
  created_at: "string > 0",
  id: "number | string",
  "updated_at?": "string | null",
});
const pipelineSchema = arkType({
  "+": "ignore",
  id: "number | string",
  "ref?": "string | null",
  status: "string > 0",
  web_url: "string > 0",
});
const jobSchema = arkType({
  "+": "ignore",
  allow_failure: "boolean",
  "finished_at?": "string | null",
  id: "number | string",
  name: "string > 0",
  "stage?": "string | null",
  "started_at?": "string | null",
  status: "string > 0",
  web_url: "string > 0",
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
        "changeRequests.get",
        "changeRequests.getByUrl",
        "changeRequests.list",
        "changeRequests.create",
        "changeRequests.comment",
        "changeRequests.status",
        "changeRequests.preflight",
        "changeRequests.resolveHead",
        "workItems.get",
        "workItems.getByUrl",
        "workItems.list",
        "branches.publish",
        "checks.list",
        "checks.snapshot",
        "provider.clone",
      ],
      displayName: "GitLab",
      hosts: ["gitlab.com"],
      id: PROVIDER_ID,
      unsupportedCapabilities: {
        "changeRequests.merge": {
          kind: "out-of-scope",
          message:
            "Merging GitLab change requests is outside the first release.",
        },
        "checks.failureLog": {
          kind: "not-implemented",
          message: "GitLab job logs are not available in this release.",
        },
        "checks.fixPrompt": {
          kind: "not-implemented",
          message:
            "GitLab check fix prompts are not available in this release.",
        },
        "reviewThreads.list": {
          kind: "not-implemented",
          message: "GitLab review threads are not available in this release.",
        },
        "reviewThreads.resolve": {
          kind: "not-implemented",
          message: "GitLab review threads are not available in this release.",
        },
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
      parseChangeRequestUrl: (url) => {
        const parsed = parseGitLabItemUrl(url);
        return parsed?.kind === "merge-request"
          ? { id: parsed.id, repository: parsed.repository }
          : null;
      },
      clone: async (input, context) => {
        assertGitLabRepository(input.repository);
        const remoteUrl = `${input.repository.webUrl}.git`;
        await credentialedClone({
          cli: {
            clone: async (targetPath, timeoutMs) => {
              await runGlab(
                [
                  "repo",
                  "clone",
                  input.repository.displayPath,
                  targetPath,
                  "--hostname",
                  input.repository.host,
                ],
                { timeoutMs },
              );
            },
            isAvailable: async () => (await findGlab()) !== null,
          },
          context,
          getToken,
          remoteUrl,
          runGit,
          targetPath: input.targetPath,
        });
        return { projectPath: input.targetPath };
      },
      publishBranch: async (input, context) => {
        assertGitLabRepository(input.repository);
        const ref = `HEAD:refs/heads/${input.localBranch}`;
        await runGit(
          input.projectPath,
          [
            "push",
            ...(input.forceWithLease ? ["--force-with-lease"] : []),
            input.remoteName,
            ref,
          ],
          { signal: context.signal, timeout: remaining(context) },
        );
        return { remoteName: input.remoteName, remoteRef: input.localBranch };
      },
    },
    repositories: { parseUrl: parseGitLabRepositoryUrl },
    workItems: {
      get: async (input, context) =>
        mapIssue(
          await api(
            input.repository.host,
            `${projectEndpoint(input.repository)}/issues/${encodeURIComponent(input.id)}`,
            issueSchema,
            context,
          ),
          input.repository,
        ),
      getByUrl: async (input, context) => {
        const parsed = parseGitLabItemUrl(input.url);
        if (parsed?.kind !== "issue") {
          throw DaemonError.sourceControlUrlUnsupported(PROVIDER_ID);
        }
        return mapIssue(
          await api(
            parsed.repository.host,
            `${projectEndpoint(parsed.repository)}/issues/${parsed.id}`,
            issueSchema,
            context,
          ),
          parsed.repository,
        );
      },
      list: async (input, context) =>
        (
          await api(
            input.repository.host,
            `${projectEndpoint(input.repository)}/issues?scope=all&per_page=${input.limit}&search=${encodeURIComponent(input.query ?? "")}`,
            issueSchema.array(),
            context,
          )
        ).map((issue) => mapIssue(issue, input.repository)),
    },
    changeRequests: {
      get: (input, context) => getMergeRequest(api, input, context),
      getByUrl: async (input, context) => {
        const parsed = parseGitLabItemUrl(input.url);
        if (parsed?.kind !== "merge-request") {
          throw DaemonError.sourceControlUrlUnsupported(PROVIDER_ID);
        }
        return getMergeRequest(
          api,
          { id: parsed.id, repository: parsed.repository },
          context,
        );
      },
      list: async (input, context) =>
        (
          await api(
            input.repository.host,
            `${projectEndpoint(input.repository)}/merge_requests?scope=all&state=all&per_page=${input.limit}&search=${encodeURIComponent(input.query ?? "")}`,
            mergeRequestSchema.array(),
            context,
          )
        ).map((mergeRequest) =>
          mapMergeRequest(mergeRequest, input.repository),
        ),
      create: async (input, context) => {
        const payload = await api(
          input.repository.host,
          `${projectEndpoint(input.repository)}/merge_requests`,
          mergeRequestSchema,
          context,
          [
            "--method",
            "POST",
            "--field",
            `title=${input.title}`,
            "--field",
            `description=${input.body}`,
            "--field",
            `source_branch=${input.sourceBranch}`,
            "--field",
            `target_branch=${input.targetBranch}`,
            ...(input.draft ? ["--field", "draft=true"] : []),
          ],
        );
        return mapMergeRequest(payload, input.repository);
      },
      comment: async (input, context) => {
        const payload = await api(
          input.repository.host,
          `${projectEndpoint(input.repository)}/merge_requests/${encodeURIComponent(input.id)}/notes`,
          noteSchema,
          context,
          ["--method", "POST", "--field", `body=${input.body}`],
        );
        return {
          author: mapActor(payload.author),
          body: payload.body,
          createdAt: payload.created_at,
          id: String(payload.id),
          updatedAt: payload.updated_at ?? null,
          webUrl: null,
        };
      },
      status: async (input, context) => ({
        changeRequest: await getMergeRequest(api, input, context),
        checks: await snapshotChecks(api, input, context),
      }),
      preflight: async (input) => ({
        requirements: [],
        targetBranch: input.targetBranch ?? "main",
      }),
      resolveHead: async (input, context) => {
        const changeRequest = await getMergeRequest(api, input, context);
        return {
          changeRequest,
          ref: `refs/merge-requests/${input.id}/head`,
          remoteUrl: `${input.repository.webUrl}.git`,
        };
      },
    },
    checks: {
      list: (input, context) => listChecks(api, input, context),
      snapshot: (input, context) => snapshotChecks(api, input, context),
    },
    links: {
      matchUrl: (url) => (parseGitLabItemUrl(url) ? 100 : null),
      parseUrl: (url) => {
        const parsed = parseGitLabItemUrl(url);
        if (!parsed) return null;
        return {
          id: parsed.id,
          kind:
            parsed.kind === "merge-request" ? "change-request" : "work-item",
          repository: parsed.repository,
          url,
        };
      },
    },
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

function mapIssue(
  issue: typeof issueSchema.infer,
  repository: RepositoryIdentity,
): WorkItem {
  return {
    assignees: issue.assignees.map(mapActor),
    author: mapActor(issue.author),
    body: issue.description ?? "",
    closedAt: issue.closed_at ?? null,
    createdAt: issue.created_at,
    id: String(issue.iid),
    kind: "issue",
    labels: issue.labels,
    number: issue.iid,
    repository,
    state: issue.state === "opened" ? "open" : "closed",
    title: issue.title,
    updatedAt: issue.updated_at,
    webUrl: issue.web_url,
  };
}

function mapMergeRequest(
  mergeRequest: typeof mergeRequestSchema.infer,
  repository: RepositoryIdentity,
): ChangeRequest {
  const satisfied = mergeRequest.detailed_merge_status === "mergeable";
  const ref = (name: string) => ({ name, oid: null, repository });
  return {
    additions: mergeRequest.additions ?? null,
    allowedMergeMethods: [],
    author: mapActor(mergeRequest.author),
    body: mergeRequest.description ?? "",
    changedFiles: null,
    commitCount: null,
    createdAt: mergeRequest.created_at,
    defaultMergeMethod: null,
    deletions: null,
    draft: mergeRequest.draft,
    id: String(mergeRequest.iid),
    mergeRequirements: [
      {
        blocking: true,
        detailsUrl: mergeRequest.web_url,
        id: "gitlab:merge-status",
        kind: "other",
        label: "GitLab merge status",
        state: satisfied ? "satisfied" : "pending",
      },
    ],
    mergedAt: mergeRequest.merged_at,
    number: mergeRequest.iid,
    repository,
    reviewDecision: "none",
    source: ref(mergeRequest.source_branch),
    state: mergeRequest.state === "opened" ? "open" : mergeRequest.state,
    target: ref(mergeRequest.target_branch),
    title: mergeRequest.title,
    updatedAt: mergeRequest.updated_at,
    viewerCanMerge: null,
    webUrl: mergeRequest.web_url,
  };
}

async function getMergeRequest(
  api: <Output>(
    host: string,
    endpoint: string,
    schema: (value: unknown) => Output | arkType.errors,
    context: ProviderOperationContext,
    extra?: readonly string[],
  ) => Promise<Output>,
  input: NumberedItemInput,
  context: ProviderOperationContext,
) {
  return mapMergeRequest(
    await api(
      input.repository.host,
      `${projectEndpoint(input.repository)}/merge_requests/${encodeURIComponent(input.id)}`,
      mergeRequestSchema,
      context,
    ),
    input.repository,
  );
}

async function listChecks(
  api: <Output>(
    host: string,
    endpoint: string,
    schema: (value: unknown) => Output | arkType.errors,
    context: ProviderOperationContext,
    extra?: readonly string[],
  ) => Promise<Output>,
  input: NumberedItemInput,
  context: ProviderOperationContext,
): Promise<readonly CheckRun[]> {
  const pipelines = await api(
    input.repository.host,
    `${projectEndpoint(input.repository)}/merge_requests/${encodeURIComponent(input.id)}/pipelines`,
    pipelineSchema.array(),
    context,
  );
  const pipeline = pipelines[0];
  if (!pipeline) return [];
  const jobs = await api(
    input.repository.host,
    `${projectEndpoint(input.repository)}/pipelines/${pipeline.id}/jobs`,
    jobSchema.array(),
    context,
  );
  return jobs.map((job) => mapJob(job, pipeline));
}

async function snapshotChecks(
  api: <Output>(
    host: string,
    endpoint: string,
    schema: (value: unknown) => Output | arkType.errors,
    context: ProviderOperationContext,
    extra?: readonly string[],
  ) => Promise<Output>,
  input: NumberedItemInput,
  context: ProviderOperationContext,
): Promise<CheckSummary> {
  const checks = await listChecks(api, input, context);
  const failed = checks.filter((check) => check.conclusion === "failure");
  const failedBlocking = failed.filter((check) => check.blocking);
  return {
    checks,
    failed,
    failedBlocking,
    hasPending: checks.some((check) => check.status !== "completed"),
    headOid: null,
    requiredAllGreen: failedBlocking.length === 0,
  };
}

function mapJob(
  job: typeof jobSchema.infer,
  pipeline: typeof pipelineSchema.infer,
): CheckRun {
  const completed = [
    "success",
    "failed",
    "canceled",
    "skipped",
    "manual",
  ].includes(job.status);
  return {
    allowFailure: job.allow_failure,
    attempt: 1,
    blocking: !job.allow_failure,
    completedAt: job.finished_at ?? null,
    conclusion:
      job.status === "success"
        ? "success"
        : job.status === "failed"
          ? "failure"
          : job.status === "canceled"
            ? "canceled"
            : job.status === "skipped"
              ? "skipped"
              : null,
    detailsUrl: job.web_url,
    group: {
      attempt: 1,
      detailsUrl: pipeline.web_url,
      id: String(pipeline.id),
      kind: "pipeline",
      name: pipeline.ref ?? "Pipeline",
      parentGroupId: null,
      stage: job.stage ?? null,
    },
    id: String(job.id),
    logRef: { jobId: String(job.id), kind: "job" },
    manual: job.status === "manual",
    name: job.name,
    requiredness: job.allow_failure ? "optional" : "required",
    retryOf: null,
    startedAt: job.started_at ?? null,
    status: completed
      ? "completed"
      : job.status === "manual"
        ? "waiting-manual"
        : job.status === "pending" || job.status === "created"
          ? "queued"
          : "running",
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
