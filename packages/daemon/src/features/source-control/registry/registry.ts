import {
  capabilityState,
  type CapabilityMatrix,
  type ProjectProviderConfig,
  type ProviderActivation,
  type ProviderHostMapping,
  type ProviderMatch,
  type ProviderReadiness,
  type ProviderLinkDescriptor,
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
  sanitizeSourceControlValue,
} from "./redaction";

export type ActivationResult =
  | { status: "active"; activation: ProviderActivation }
  | { status: "ambiguous"; candidates: readonly ProviderMatch[] }
  | {
      status: "unresolved";
      reason: "no-match" | "configured-provider-missing";
    };

export type LinkResolutionResult =
  | {
      status: "resolved";
      providerId: string;
      descriptor: ProviderLinkDescriptor;
    }
  | { status: "ambiguous"; providerIds: readonly string[] }
  | { status: "unresolved" };

export type RepositoryUrlResolution =
  | {
      status: "resolved";
      cloneSupported: boolean;
      providerId: string;
      repository: NonNullable<ProviderMatch["repository"]>;
    }
  | { status: "ambiguous"; providerIds: readonly string[] }
  | { status: "unresolved" };

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

function outboundSecretsFromUrl(remoteUrl: string) {
  try {
    const url = new URL(remoteUrl);
    return url.password ? [url.password] : [url.username].filter(Boolean);
  } catch {
    return [];
  }
}

function secretsFromMatch(match: ProviderMatch) {
  const urls = [
    match.remote.url,
    match.remote.fetchUrl,
    match.remote.pushUrl,
    match.repository?.webUrl,
  ];
  return [...new Set(urls.flatMap((url) => (url ? secretsFromUrl(url) : [])))];
}

function outboundSecretsFromMatch(match: ProviderMatch) {
  const urls = [
    match.remote.url,
    match.remote.fetchUrl,
    match.remote.pushUrl,
    match.repository?.webUrl,
  ];
  return [
    ...new Set(urls.flatMap((url) => (url ? outboundSecretsFromUrl(url) : []))),
  ];
}

function activationKey(activation: ProviderActivation) {
  return `${activation.projectPath}\0${activation.generation}\0${activation.provider.id}\0${activation.remote.name}\0${activation.remote.url}`;
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
  readinessTtlMs?: number;
}

export class SourceControlRegistry {
  readonly #activationSecrets = new Map<string, readonly string[]>();
  readonly #plugins = new Map<string, SourceControlProviderPlugin>();
  readonly #generations = new Map<string, number>();
  readonly #invocationTimeoutMs: number;
  readonly #log?: (message: string) => void;
  readonly #readinessCache = new Map<
    string,
    { expiresAt: number; value: ProviderReadiness }
  >();
  readonly #readinessTtlMs: number;

  constructor(options: SourceControlRegistryOptions = {}) {
    this.#invocationTimeoutMs = options.invocationTimeoutMs ?? 30_000;
    this.#log = options.log;
    this.#readinessTtlMs = options.readinessTtlMs ?? 30_000;
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

  parseLink(url: string): LinkResolutionResult {
    const matches = [...this.#plugins.values()]
      .flatMap((plugin) => {
        const score = plugin.links?.matchUrl(url) ?? null;
        const descriptor = score === null ? null : plugin.links?.parseUrl(url);
        return score === null || descriptor == null
          ? []
          : [{ descriptor, plugin, score }];
      })
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.plugin.manifest.id.localeCompare(right.plugin.manifest.id),
      );
    const first = matches[0];
    if (!first) return { status: "unresolved" };
    const tied = matches.filter((match) => match.score === first.score);
    if (tied.length > 1) {
      return {
        status: "ambiguous",
        providerIds: tied.map((match) => match.plugin.manifest.id),
      };
    }
    return {
      status: "resolved",
      descriptor: first.descriptor,
      providerId: first.plugin.manifest.id,
    };
  }

  parseRepositoryUrl(url: string): RepositoryUrlResolution {
    const matches = [...this.#plugins.values()].flatMap((plugin) => {
      const repository = plugin.repositories?.parseUrl(url) ?? null;
      return repository === null ? [] : [{ plugin, repository }];
    });
    if (matches.length === 0) return { status: "unresolved" };
    if (matches.length > 1) {
      return {
        status: "ambiguous",
        providerIds: matches
          .map((match) => match.plugin.manifest.id)
          .sort((left, right) => left.localeCompare(right)),
      };
    }
    return {
      cloneSupported:
        matches[0].plugin.manifest.capabilities.includes("provider.clone") &&
        matches[0].plugin.git.clone !== undefined,
      status: "resolved",
      providerId: matches[0].plugin.manifest.id,
      repository: matches[0].repository,
    };
  }

  async resolveLink(url: string, signal?: AbortSignal) {
    const resolution = this.parseLink(url);
    if (resolution.status !== "resolved") return resolution;
    const plugin = this.#plugins.get(resolution.providerId);
    if (!plugin) return { status: "unresolved" as const };
    const capability =
      resolution.descriptor.kind === "change-request"
        ? "changeRequests.getByUrl"
        : "workItems.getByUrl";
    if (!plugin.manifest.capabilities.includes(capability)) {
      throw new ProviderRegistryError(
        "source-control/capability-unsupported",
        `${plugin.manifest.displayName} cannot resolve this link.`,
      );
    }
    const common = {
      log: this.#log,
      providerId: plugin.manifest.id,
      secrets: secretsFromUrl(url),
      signal,
      timeoutMs: this.#invocationTimeoutMs,
    };
    const item =
      resolution.descriptor.kind === "change-request"
        ? await invokeProvider({
            ...common,
            operation: capability,
            run: (context) => {
              const operation = plugin.changeRequests?.getByUrl;
              if (!operation) {
                throw new ProviderRegistryError(
                  "source-control/capability-unsupported",
                  `${plugin.manifest.displayName} cannot resolve change-request links.`,
                );
              }
              return operation({ url }, context);
            },
          })
        : await invokeProvider({
            ...common,
            operation: capability,
            run: (context) => {
              const operation = plugin.workItems?.getByUrl;
              if (!operation) {
                throw new ProviderRegistryError(
                  "source-control/capability-unsupported",
                  `${plugin.manifest.displayName} cannot resolve work-item links.`,
                );
              }
              return operation({ url }, context);
            },
          });
    return { ...resolution, item };
  }

  async cloneRepository(options: {
    repository: NonNullable<ProviderMatch["repository"]>;
    signal?: AbortSignal;
    targetPath: string;
  }) {
    const plugin = this.#plugins.get(options.repository.providerId);
    const operation = plugin?.git.clone;
    if (
      !plugin ||
      !plugin.manifest.capabilities.includes("provider.clone") ||
      !operation
    ) {
      throw new ProviderRegistryError(
        "source-control/capability-unsupported",
        "The selected provider does not support authenticated cloning.",
      );
    }
    return invokeProvider({
      log: this.#log,
      operation: "provider.clone",
      providerId: plugin.manifest.id,
      run: (context) =>
        operation(
          { repository: options.repository, targetPath: options.targetPath },
          context,
        ),
      signal: options.signal,
      timeoutMs: this.#invocationTimeoutMs,
    });
  }

  invalidate(projectPath: string) {
    this.#generations.set(projectPath, this.generation(projectPath) + 1);
    for (const [key] of this.#activationSecrets) {
      if (key.startsWith(`${projectPath}\0`))
        this.#activationSecrets.delete(key);
    }
    for (const key of this.#readinessCache.keys()) {
      if (key.startsWith(`${projectPath}\0`)) this.#readinessCache.delete(key);
    }
  }

  invalidateAll() {
    for (const projectPath of this.#generations.keys()) {
      this.invalidate(projectPath);
    }
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
    if (!this.#generations.has(options.projectPath)) {
      this.#generations.set(options.projectPath, 0);
    }
    const context = await collectProbeContext(options);
    const matches: ProviderMatch[] = [];
    for (const plugin of this.#plugins.values()) {
      try {
        const match = plugin.discovery.match(context);
        if (match !== null) {
          matches.push(
            ...(Array.isArray(match) ? match : [match as ProviderMatch]),
          );
        }
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
    if (resolution.status === "ambiguous") {
      const secrets = resolution.candidates.flatMap(outboundSecretsFromMatch);
      return sanitizeSourceControlValue(resolution, secrets);
    }
    if (resolution.status === "unresolved") return resolution;
    const match = resolution.match;
    const plugin = this.#plugins.get(match.providerId);
    if (!plugin) {
      return { status: "unresolved", reason: "no-match" };
    }
    const secrets = secretsFromMatch(match);
    const readinessKey = `${options.projectPath}\0${this.generation(
      options.projectPath,
    )}\0${plugin.manifest.id}\0${match.remote.name}\0${match.remote.url}`;
    const cachedReadiness = this.#readinessCache.get(readinessKey);
    const readiness =
      cachedReadiness && cachedReadiness.expiresAt > Date.now()
        ? cachedReadiness.value
        : await invokeProvider({
            log: this.#log,
            operation: "discovery.checkReadiness",
            providerId: plugin.manifest.id,
            run: (operationContext) =>
              plugin.discovery.checkReadiness(match, operationContext),
            secrets,
            signal: options.signal,
            timeoutMs: this.#invocationTimeoutMs,
          });
    if (!cachedReadiness || cachedReadiness.expiresAt <= Date.now()) {
      this.#readinessCache.set(readinessKey, {
        expiresAt: Date.now() + this.#readinessTtlMs,
        value: readiness,
      });
    }
    const authenticated = readiness.authentication === "authenticated";
    const outboundSecrets = outboundSecretsFromMatch(match);
    const result = sanitizeSourceControlValue<ActivationResult>(
      {
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
      },
      outboundSecrets,
    );
    if (result.status === "active") {
      this.#activationSecrets.set(activationKey(result.activation), secrets);
    }
    return result;
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
      secrets:
        this.#activationSecrets.get(activationKey(activation)) ??
        secretsFromUrl(activation.remote.url),
      signal: options.signal,
      timeoutMs: this.#invocationTimeoutMs,
    });
  }
}

export { ProviderInvocationError };
