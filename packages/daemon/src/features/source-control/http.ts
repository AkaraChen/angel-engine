import type {
  ProviderHostMapping,
  ProviderActivation,
  RepositoryIdentity,
  SourceControlCapabilityId,
  SourceControlProviderPlugin,
} from "@angel-engine/daemon-api/source-control";
import type { Context, Hono } from "hono";
import type { Effect } from "effect";

import type { Db } from "../../platform/db";
import { DaemonError } from "../../platform/errors";
import { listProjects } from "../projects/repository";
import { createWorkspaceFromResolvedChangeRequest } from "./change-requests/workspace";
import { localGitBackend } from "./local-git/backend";
import { discoverPullRequestTemplates } from "./local-git/change-request-templates";
import {
  listProviderHostMappings,
  readSourceControlProjectConfig,
} from "./registry/config-store";
import { SourceControlCoordinator } from "./registry/coordinator";
import { ProviderRegistryError } from "./registry/registry";

type RunDb = <A>(effect: Effect.Effect<A, DaemonError, Db>) => Promise<A>;

export function registerSourceControlHttpApi(
  app: Hono,
  options: {
    coordinator: SourceControlCoordinator;
    loadHostMappings?: () => Promise<readonly ProviderHostMapping[]>;
    runDb: RunDb;
    onWorkspaceCreated?: (chatId: string) => void;
  },
) {
  const { coordinator, runDb } = options;

  async function activate(projectPath: string, signal: AbortSignal) {
    if (!projectPath.trim())
      throw DaemonError.invalidRequest("projectPath is required.");
    const [config, hostMappings] = await Promise.all([
      readSourceControlProjectConfig(projectPath),
      options.loadHostMappings?.() ?? runDb(listProviderHostMappings()),
    ]);
    const result = await coordinator.activate({
      hostMappings,
      projectPath,
      providerConfig: config.provider,
      signal,
    });
    if (result.status !== "active") {
      throw DaemonError.invalidRequest(
        result.status === "ambiguous"
          ? "Source-control provider activation is ambiguous."
          : "No source-control provider is available for this project.",
      );
    }
    return result.activation;
  }

  async function invoke<A>(input: {
    activation: ProviderActivation;
    capability: SourceControlCapabilityId;
    operation: string;
    signal: AbortSignal;
    run(
      plugin: SourceControlProviderPlugin,
      context: { signal: AbortSignal; deadline: number },
    ): Promise<A>;
  }) {
    try {
      return await coordinator.registry.invoke(input);
    } catch (cause) {
      if (
        cause instanceof ProviderRegistryError &&
        cause.code === "source-control/capability-unsupported"
      ) {
        throw DaemonError.sourceControlCapabilityUnsupported(
          "This source-control provider does not support the requested operation.",
          input.activation.provider.id,
        );
      }
      throw cause;
    }
  }

  function repository(activation: ProviderActivation): RepositoryIdentity {
    if (activation.repository) return activation.repository;
    throw DaemonError.sourceControlUrlUnsupported(
      activation.provider.id,
      "The activated remote does not identify a repository.",
    );
  }

  const projectPathFromQuery = (value: string | undefined) => {
    if (!value?.trim())
      throw DaemonError.invalidRequest("projectPath is required.");
    return value;
  };
  const positiveLimit = (value: string | undefined) => {
    if (value === undefined) return 50;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1)
      throw DaemonError.invalidRequest("limit is invalid.");
    return parsed;
  };
  const idFromPath = (value: string) => {
    if (!value.trim()) throw DaemonError.invalidRequest("id is required.");
    return value;
  };
  const body = async (context: Context) =>
    (await context.req.json()) as Record<string, unknown>;
  const projectPathFromBody = (value: unknown) => {
    if (typeof value !== "string" || !value.trim())
      throw DaemonError.invalidRequest("projectPath is required.");
    return value;
  };

  app.post("/api/source-control/links/resolve", async (context) => {
    const input = await body(context);
    const projectPath = projectPathFromBody(input.projectPath);
    if (typeof input.url !== "string" || !input.url.trim())
      throw DaemonError.invalidRequest("url is required.");
    const activation = await activate(projectPath, context.req.raw.signal);
    const parsed = coordinator.registry.parseLink(input.url);
    if (
      parsed.status !== "resolved" ||
      parsed.providerId !== activation.provider.id
    ) {
      throw DaemonError.sourceControlUrlUnsupported(
        activation.provider.id,
        "The URL is not supported by the activated provider.",
      );
    }
    const descriptor = parsed.descriptor;
    const capability =
      descriptor.kind === "change-request"
        ? "changeRequests.getByUrl"
        : "workItems.getByUrl";
    return context.json(
      await invoke<unknown>({
        activation,
        capability,
        operation: `http.${capability}`,
        signal: context.req.raw.signal,
        run: (plugin, providerContext) => {
          const operation =
            descriptor.kind === "change-request"
              ? plugin.changeRequests?.getByUrl
              : plugin.workItems?.getByUrl;
          if (!operation)
            throw DaemonError.sourceControlCapabilityUnsupported(
              undefined,
              activation.provider.id,
            );
          return operation({ url: descriptor.url }, providerContext);
        },
      }),
    );
  });

  app.get("/api/source-control/namespaces", async (context) => {
    const activation = await activate(
      projectPathFromQuery(context.req.query("projectPath")),
      context.req.raw.signal,
    );
    return context.json(
      await invoke({
        activation,
        capability: "discovery.listNamespaces",
        operation: "http.discovery.listNamespaces",
        signal: context.req.raw.signal,
        run: (plugin, providerContext) =>
          plugin.discovery.listNamespaces!(
            {
              query: context.req.query("query") ?? null,
              limit: positiveLimit(context.req.query("limit")),
            },
            providerContext,
          ),
      }),
    );
  });

  app.get("/api/source-control/repositories", async (context) => {
    const activation = await activate(
      projectPathFromQuery(context.req.query("projectPath")),
      context.req.raw.signal,
    );
    const namespace =
      context.req.query("namespace")?.split("/").filter(Boolean) ?? null;
    return context.json(
      await invoke({
        activation,
        capability: "discovery.listRepositories",
        operation: "http.discovery.listRepositories",
        signal: context.req.raw.signal,
        run: (plugin, providerContext) =>
          plugin.discovery.listRepositories!(
            {
              namespace,
              query: context.req.query("query") ?? null,
              limit: positiveLimit(context.req.query("limit")),
            },
            providerContext,
          ),
      }),
    );
  });

  app.get("/api/source-control/work-items", async (context) => {
    const activation = await activate(
      projectPathFromQuery(context.req.query("projectPath")),
      context.req.raw.signal,
    );
    return context.json(
      await invoke({
        activation,
        capability: "workItems.list",
        operation: "http.workItems.list",
        signal: context.req.raw.signal,
        run: (plugin, providerContext) =>
          plugin.workItems!.list!(
            {
              repository: repository(activation),
              query: context.req.query("query") ?? null,
              limit: positiveLimit(context.req.query("limit")),
            },
            providerContext,
          ),
      }),
    );
  });

  app.get("/api/source-control/change-requests", async (context) => {
    const activation = await activate(
      projectPathFromQuery(context.req.query("projectPath")),
      context.req.raw.signal,
    );
    return context.json(
      await invoke({
        activation,
        capability: "changeRequests.list",
        operation: "http.changeRequests.list",
        signal: context.req.raw.signal,
        run: (plugin, providerContext) =>
          plugin.changeRequests!.list!(
            {
              repository: repository(activation),
              query: context.req.query("query") ?? null,
              limit: positiveLimit(context.req.query("limit")),
            },
            providerContext,
          ),
      }),
    );
  });

  app.get("/api/source-control/change-requests/current", async (context) => {
    const projectPath = projectPathFromQuery(context.req.query("projectPath"));
    const activation = await activate(projectPath, context.req.raw.signal);
    const branch = await localGitBackend.currentBranch(projectPath);
    const result = await invoke({
      activation,
      capability: "changeRequests.list",
      operation: "http.changeRequests.current",
      signal: context.req.raw.signal,
      run: (plugin, providerContext) =>
        plugin.changeRequests!.list!(
          {
            repository: repository(activation),
            query: branch || null,
            limit: 20,
          },
          providerContext,
        ),
    });
    const current = result.find((item) => item.source.name === branch);
    if (!current) return context.json(null);
    return context.json(
      await invoke({
        activation,
        capability: "changeRequests.status",
        operation: "http.changeRequests.currentStatus",
        signal: context.req.raw.signal,
        run: (plugin, providerContext) =>
          plugin.changeRequests!.status!(
            { repository: repository(activation), id: current.id },
            providerContext,
          ),
      }),
    );
  });

  app.get("/api/source-control/change-requests/preflight", async (context) => {
    const projectPath = projectPathFromQuery(context.req.query("projectPath"));
    const activation = await activate(projectPath, context.req.raw.signal);
    const sourceBranch =
      context.req.query("sourceBranch") ||
      (await localGitBackend.currentBranch(projectPath));
    const providerPreflight = await invoke({
      activation,
      capability: "changeRequests.preflight",
      operation: "http.changeRequests.preflight",
      signal: context.req.raw.signal,
      run: (plugin, providerContext) =>
        plugin.changeRequests!.preflight!(
          {
            repository: repository(activation),
            sourceBranch,
            targetBranch: context.req.query("targetBranch") ?? null,
          },
          providerContext,
        ),
    });
    const targetBranch = providerPreflight.targetBranch;
    const remoteName = activation.remote.name;
    const localTarget = await localGitBackend.resolveRef(
      projectPath,
      targetBranch,
    );
    const remoteTarget = await localGitBackend.resolveRef(
      projectPath,
      `${remoteName}/${targetBranch}`,
    );
    const targetRef =
      localTarget !== null
        ? targetBranch
        : remoteTarget !== null
          ? `${remoteName}/${targetBranch}`
          : null;
    if (targetRef === null) {
      throw DaemonError.gitFailed(
        new Error(`Target branch ${targetBranch} was not found.`),
      );
    }
    const [
      aheadCount,
      remoteBranches,
      existingChangeRequests,
      localHead,
      remoteHead,
    ] = await Promise.all([
      localGitBackend.aheadCount(projectPath, targetRef, sourceBranch),
      localGitBackend.remoteBranches(projectPath, remoteName).catch(() => []),
      invoke({
        activation,
        capability: "changeRequests.list",
        operation: "http.changeRequests.preflightExisting",
        signal: context.req.raw.signal,
        run: (plugin, providerContext) =>
          plugin.changeRequests!.list!(
            {
              repository: repository(activation),
              query: `head:${sourceBranch} is:open`,
              limit: 20,
            },
            providerContext,
          ),
      }),
      localGitBackend.resolveRef(projectPath, sourceBranch),
      localGitBackend.resolveRef(projectPath, `${remoteName}/${sourceBranch}`),
    ]);
    const availableTargetBranches = Array.from(
      new Set([
        targetBranch,
        ...remoteBranches
          .map((branch) => branch.replace(`${remoteName}/`, ""))
          .filter(
            (branch) =>
              branch.length > 0 &&
              branch !== "HEAD" &&
              branch !== remoteName &&
              branch !== sourceBranch,
          ),
      ]),
    );
    return context.json({
      ...providerPreflight,
      aheadCount,
      availableTargetBranches,
      existing:
        existingChangeRequests.find(
          (changeRequest) => changeRequest.source.name === sourceBranch,
        ) ?? null,
      needsPush: localHead !== remoteHead,
      sourceBranch,
    });
  });

  app.get("/api/source-control/change-requests/template", async (context) => {
    const projectPath = projectPathFromQuery(context.req.query("projectPath"));
    const activation = await activate(projectPath, context.req.raw.signal);
    await invoke({
      activation,
      capability: "repositoryIdentity",
      operation: "http.changeRequests.template",
      signal: context.req.raw.signal,
      run: async (plugin) =>
        plugin.repositories?.parseUrl(activation.remote.url) ??
        plugin.git.parseUrl(activation.remote.url),
    });
    return context.json(
      await options.runDb(
        discoverPullRequestTemplates({
          cwd: projectPath,
          providerId: activation.provider.id,
        }),
      ),
    );
  });

  app.get("/api/source-control/change-requests/:id", async (context) => {
    const activation = await activate(
      projectPathFromQuery(context.req.query("projectPath")),
      context.req.raw.signal,
    );
    return context.json(
      await invoke({
        activation,
        capability: "changeRequests.get",
        operation: "http.changeRequests.get",
        signal: context.req.raw.signal,
        run: (plugin, providerContext) =>
          plugin.changeRequests!.get!(
            {
              repository: repository(activation),
              id: idFromPath(context.req.param("id")),
            },
            providerContext,
          ),
      }),
    );
  });

  app.post("/api/source-control/change-requests", async (context) => {
    const input = await body(context);
    const projectPath = projectPathFromBody(input.projectPath);
    const activation = await activate(projectPath, context.req.raw.signal);
    if (
      typeof input.title !== "string" ||
      typeof input.sourceBranch !== "string" ||
      typeof input.targetBranch !== "string"
    )
      throw DaemonError.invalidRequest("Change request input is invalid.");
    if (input.publish === true) {
      await invoke({
        activation,
        capability: "branches.publish",
        operation: "http.branches.publish",
        signal: context.req.raw.signal,
        run: (plugin, providerContext) =>
          plugin.git.publishBranch!(
            {
              forceWithLease: false,
              localBranch: input.sourceBranch as string,
              projectPath,
              remoteName: activation.remote.name,
              repository: repository(activation),
            },
            providerContext,
          ),
      });
    }
    return context.json(
      await invoke({
        activation,
        capability: "changeRequests.create",
        operation: "http.changeRequests.create",
        signal: context.req.raw.signal,
        run: (plugin, providerContext) =>
          plugin.changeRequests!.create!(
            {
              repository: repository(activation),
              title: input.title as string,
              body: typeof input.body === "string" ? input.body : "",
              sourceBranch: input.sourceBranch as string,
              targetBranch: input.targetBranch as string,
              draft: input.draft === true,
            },
            providerContext,
          ),
      }),
    );
  });

  app.post("/api/source-control/branches/publish", async (context) => {
    const input = await body(context);
    const projectPath = projectPathFromBody(input.projectPath);
    if (typeof input.localBranch !== "string" || !input.localBranch.trim()) {
      throw DaemonError.invalidRequest("localBranch is required.");
    }
    const activation = await activate(projectPath, context.req.raw.signal);
    return context.json(
      await invoke({
        activation,
        capability: "branches.publish",
        operation: "http.branches.publish",
        signal: context.req.raw.signal,
        run: (plugin, providerContext) =>
          plugin.git.publishBranch!(
            {
              forceWithLease: false,
              localBranch: input.localBranch as string,
              projectPath,
              remoteName: activation.remote.name,
              repository: repository(activation),
            },
            providerContext,
          ),
      }),
    );
  });

  app.post(
    "/api/source-control/change-requests/:id/comments",
    async (context) => {
      const input = await body(context);
      const activation = await activate(
        projectPathFromBody(input.projectPath),
        context.req.raw.signal,
      );
      if (typeof input.body !== "string" || !input.body.trim())
        throw DaemonError.invalidRequest("Comment body is required.");
      return context.json(
        await invoke({
          activation,
          capability: "changeRequests.comment",
          operation: "http.changeRequests.comment",
          signal: context.req.raw.signal,
          run: (plugin, providerContext) =>
            plugin.changeRequests!.comment!(
              {
                repository: repository(activation),
                id: idFromPath(context.req.param("id")),
                body: input.body as string,
              },
              providerContext,
            ),
        }),
      );
    },
  );

  app.post("/api/source-control/change-requests/:id/merge", async (context) => {
    const input = await body(context);
    const activation = await activate(
      projectPathFromBody(input.projectPath),
      context.req.raw.signal,
    );
    const method = input.method;
    if (method !== "merge" && method !== "rebase" && method !== "squash")
      throw DaemonError.invalidRequest("Merge method is invalid.");
    return context.json(
      await invoke({
        activation,
        capability: "changeRequests.merge",
        operation: "http.changeRequests.merge",
        signal: context.req.raw.signal,
        run: (plugin, providerContext) =>
          plugin.changeRequests!.merge!(
            {
              repository: repository(activation),
              id: idFromPath(context.req.param("id")),
              deleteSourceBranch: input.deleteSourceBranch === true,
              method,
            },
            providerContext,
          ),
      }),
    );
  });

  app.post(
    "/api/source-control/change-requests/:id/workspace",
    async (context) => {
      const input = await body(context);
      const projectPath = projectPathFromBody(input.projectPath);
      const activation = await activate(projectPath, context.req.raw.signal);
      const resolved = await invoke({
        activation,
        capability: "changeRequests.resolveHead",
        operation: "http.changeRequests.resolveHead",
        signal: context.req.raw.signal,
        run: (plugin, providerContext) =>
          plugin.changeRequests!.resolveHead!(
            {
              repository: repository(activation),
              id: idFromPath(context.req.param("id")),
            },
            providerContext,
          ),
      });
      const projects = await runDb(listProjects());
      const project = projects.find(
        (candidate) => candidate.path === projectPath,
      );
      if (!project) throw DaemonError.projectNotFound();
      const number =
        resolved.changeRequest.number ?? Number(resolved.changeRequest.id);
      if (!Number.isInteger(number) || number <= 0) {
        throw DaemonError.invalidRequest(
          "The change request does not have a numeric workspace reference.",
        );
      }
      const result = await runDb(
        createWorkspaceFromResolvedChangeRequest(
          {
            number,
            projectId: project.id,
            runtime:
              typeof input.runtime === "string" ? input.runtime : undefined,
            setupApproval:
              typeof input.setupApproval === "string"
                ? input.setupApproval
                : undefined,
            title: typeof input.title === "string" ? input.title : undefined,
          },
          resolved,
          context.req.raw.signal,
        ),
      );
      options.onWorkspaceCreated?.(result.chatId);
      return context.json(result);
    },
  );

  for (const [path, capability, operation] of [
    ["/api/source-control/checks", "checks.list", "list"],
    ["/api/source-control/checks/summary", "checks.snapshot", "snapshot"],
    ["/api/source-control/reviews/threads", "reviewThreads.list", "reviews"],
  ] as const) {
    app.get(path, async (context) => {
      const activation = await activate(
        projectPathFromQuery(context.req.query("projectPath")),
        context.req.raw.signal,
      );
      const id = idFromPath(context.req.query("id") ?? "");
      return context.json(
        await invoke<unknown>({
          activation,
          capability,
          operation: `http.${capability}`,
          signal: context.req.raw.signal,
          run: (plugin, providerContext) =>
            operation === "list"
              ? plugin.checks!.list!(
                  { repository: repository(activation), id },
                  providerContext,
                )
              : operation === "snapshot"
                ? plugin.checks!.snapshot!(
                    { repository: repository(activation), id },
                    providerContext,
                  )
                : plugin.reviews!.listThreads!(
                    { repository: repository(activation), id },
                    providerContext,
                  ),
        }),
      );
    });
  }

  app.post("/api/source-control/checks/fix-prompt", async (context) => {
    const input = await body(context);
    const activation = await activate(
      projectPathFromBody(input.projectPath),
      context.req.raw.signal,
    );
    return context.json(
      await invoke({
        activation,
        capability: "checks.fixPrompt",
        operation: "http.checks.fixPrompt",
        signal: context.req.raw.signal,
        run: (plugin, providerContext) =>
          plugin.checks!.fixPrompt!(
            {
              repository: repository(activation),
              id: idFromPath(typeof input.id === "string" ? input.id : ""),
            },
            providerContext,
          ),
      }),
    );
  });

  app.post(
    "/api/source-control/reviews/threads/:id/resolve",
    async (context) => {
      const input = await body(context);
      const activation = await activate(
        projectPathFromBody(input.projectPath),
        context.req.raw.signal,
      );
      return context.json(
        await invoke({
          activation,
          capability: "reviewThreads.resolve",
          operation: "http.reviewThreads.resolve",
          signal: context.req.raw.signal,
          run: (plugin, providerContext) =>
            plugin.reviews!.resolveThread!(
              {
                repository: repository(activation),
                threadId: idFromPath(context.req.param("id")),
              },
              providerContext,
            ),
        }),
      );
    },
  );
}
