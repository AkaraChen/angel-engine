import {
  capabilityState,
  type CapabilityMatrix,
  type ProjectProviderConfig,
  type ProviderActivation,
  type ProviderHostMapping,
  type ProviderMatch,
  type SourceControlCapabilityId,
  type SourceControlProviderPlugin,
} from "@angel-engine/daemon-api/source-control";

import { collectProbeContext } from "./probe";
import {
  invokeProvider,
  ProviderInvocationError,
  type ProviderInvocationOptions,
} from "./invoke";
import { resolveProvider, type ProviderResolution } from "./resolution";
import {
  errorText,
  redactSourceControlText,
  redactSourceControlValue,
} from "./redaction";

export type ActivationResult =
  | { status: "active"; activation: ProviderActivation }
  | { status: "ambiguous"; candidates: readonly ProviderMatch[] }
  | {
      status: "unresolved";
      reason: "no-match" | "configured-provider-missing";
    };

export class ProviderRegistryError extends Error {
  readonly code:
    | "source-control/capability-unsupported"
    | "source-control/stale-activation"
    | "source-control/provider-unloaded";

  constructor(code: ProviderRegistryError["code"], message: string) {
    super(message);
    this.name = "ProviderRegistryError";
    this.code = code;
  }
}

function secretsFromUrl(remoteUrl: string) {
  try {
    const url = new URL(remoteUrl);
    return [url.username, url.password].filter(Boolean);
  } catch {
    return [];
  }
}

function capabilityMatrix(
  plugin: SourceControlProviderPlugin,
  authenticated: boolean,
): CapabilityMatrix {
  return {
    entries: Object.fromEntries(
      plugin.manifest.capabilities.map((capability) => [
        capability,
        authenticated || capability === "provider.auth"
          ? { supported: true as const }
          : {
              supported: false as const,
              reason: {
                kind: "unauthenticated" as const,
                message: `${plugin.manifest.displayName} is not authenticated.`,
              },
            },
      ]),
    ),
  };
}

export interface SourceControlRegistryOptions {
  invocationTimeoutMs?: number;
  log?: (message: string) => void;
}

export class SourceControlRegistry {
  readonly #plugins = new Map<string, SourceControlProviderPlugin>();
  readonly #generations = new Map<string, number>();
  readonly #invocationTimeoutMs: number;
  readonly #log?: (message: string) => void;

  constructor(options: SourceControlRegistryOptions = {}) {
    this.#invocationTimeoutMs = options.invocationTimeoutMs ?? 30_000;
    this.#log = options.log;
  }

  register(plugin: SourceControlProviderPlugin) {
    if (this.#plugins.has(plugin.manifest.id)) {
      throw new Error(`Provider ${plugin.manifest.id} is already registered.`);
    }
    this.#plugins.set(plugin.manifest.id, plugin);
  }

  unregister(providerId: string) {
    this.#plugins.delete(providerId);
    for (const projectPath of this.#generations.keys()) {
      this.invalidate(projectPath);
    }
  }

  invalidate(projectPath: string) {
    this.#generations.set(projectPath, this.generation(projectPath) + 1);
  }

  generation(projectPath: string) {
    return this.#generations.get(projectPath) ?? 0;
  }

  async activate(options: {
    projectPath: string;
    providerConfig?: ProjectProviderConfig;
    hostMappings?: readonly ProviderHostMapping[];
    signal?: AbortSignal;
  }): Promise<ActivationResult> {
    const context = await collectProbeContext(options);
    const matches: ProviderMatch[] = [];
    for (const plugin of this.#plugins.values()) {
      try {
        const match = plugin.discovery.match(context);
        if (match !== null) matches.push(match);
      } catch (cause) {
        const secrets = context.remotes.flatMap((remote) =>
          secretsFromUrl(remote.url),
        );
        this.#log?.(
          `${plugin.manifest.id}.discovery.match: ${redactSourceControlText(
            errorText(cause),
            secrets,
          )}`,
        );
      }
    }

    const resolution: ProviderResolution = resolveProvider(context, matches);
    if (resolution.status !== "resolved") return resolution;
    const match = resolution.match;
    const plugin = this.#plugins.get(match.providerId);
    if (!plugin) {
      return { status: "unresolved", reason: "no-match" };
    }
    const secrets = secretsFromUrl(match.remote.url);
    const readiness = await invokeProvider({
      log: this.#log,
      operation: "discovery.checkReadiness",
      providerId: plugin.manifest.id,
      run: (operationContext) =>
        plugin.discovery.checkReadiness(match, operationContext),
      secrets,
      signal: options.signal,
      timeoutMs: this.#invocationTimeoutMs,
    });
    const authenticated = readiness.authentication === "authenticated";
    return {
      status: "active",
      activation: {
        authentication: readiness.authentication,
        capabilities: capabilityMatrix(plugin, authenticated),
        diagnostics: redactSourceControlValue(readiness.diagnostics, secrets),
        generation: this.generation(options.projectPath),
        projectPath: options.projectPath,
        provider: plugin.manifest,
        remote: { name: match.remote.name, url: match.remote.url },
        repository: match.repository,
        unavailableReason: authenticated
          ? null
          : {
              kind: "unauthenticated",
              message: `${plugin.manifest.displayName} is not authenticated.`,
            },
      },
    };
  }

  async invoke<A>(options: {
    activation: ProviderActivation;
    capability: SourceControlCapabilityId;
    operation: string;
    run(
      plugin: SourceControlProviderPlugin,
      context: Parameters<ProviderInvocationOptions<A>["run"]>[0],
    ): Promise<A>;
    signal?: AbortSignal;
  }): Promise<A> {
    const { activation } = options;
    if (activation.generation !== this.generation(activation.projectPath)) {
      throw new ProviderRegistryError(
        "source-control/stale-activation",
        "The provider activation is stale and must be probed again.",
      );
    }
    const plugin = this.#plugins.get(activation.provider.id);
    if (!plugin) {
      throw new ProviderRegistryError(
        "source-control/provider-unloaded",
        `Provider ${activation.provider.id} is not registered.`,
      );
    }
    const state = capabilityState(activation.capabilities, options.capability);
    if (!state.supported) {
      throw new ProviderRegistryError(
        "source-control/capability-unsupported",
        state.reason.message,
      );
    }
    return invokeProvider({
      log: this.#log,
      operation: options.operation,
      providerId: plugin.manifest.id,
      run: (context) => options.run(plugin, context),
      secrets: secretsFromUrl(activation.remote.url),
      signal: options.signal,
      timeoutMs: this.#invocationTimeoutMs,
    });
  }
}

export { ProviderInvocationError };
