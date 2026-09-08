import type {
  ProviderHostMapping,
  ProviderActivation,
  SourceControlCapabilityId,
  SourceControlProviderPlugin,
} from "@angel-engine/daemon-api/source-control";
import type { Hono } from "hono";
import type { Effect } from "effect";

import type { Db } from "../../platform/db";
import { DaemonError } from "../../platform/errors";
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

}
