import type {
  CapabilityMatrix,
  ProbeContext,
  ProviderMatch,
  RepositoryIdentity,
  SourceControlCapabilityId,
  SourceControlProviderPlugin,
} from "@angel-engine/daemon-api/source-control";
import { describe, expect, it } from "vitest";

import {
  ProviderRegistryError,
  SourceControlRegistry,
} from "../registry/registry";
import { invokeProvider } from "../registry/invoke";

const ALL_CAPABILITIES: readonly SourceControlCapabilityId[] = [
  "provider.auth",
  "discovery.listNamespaces",
  "discovery.listRepositories",
  "repositoryIdentity",
  "changeRequests.create",
  "changeRequests.get",
  "changeRequests.getByUrl",
  "changeRequests.list",
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
];

export interface RepositoryContractFixture {
  expected: RepositoryIdentity;
  urls: readonly string[];
}

export interface ProviderContractFixtures {
  auth?: {
    expectedAuthentication: "authenticated" | "unauthenticated" | "unavailable";
    run(plugin: SourceControlProviderPlugin): Promise<unknown>;
  };
  operations?: readonly {
    capability: SourceControlCapabilityId;
    run(plugin: SourceControlProviderPlugin): Promise<unknown>;
  }[];
  probe?: ProbeContext;
  repository: RepositoryContractFixture;
  selfHosted?: {
    expected: RepositoryIdentity;
    probe: ProbeContext;
    url: string;
  };
}

/** Shared compliance suite for built-in and third-party source-control plugins. */
export function runProviderContractSuite(
  createPlugin: () => SourceControlProviderPlugin,
  fixtures: ProviderContractFixtures,
) {
  const plugin = createPlugin();
  describe(`${plugin.manifest.displayName} provider contract`, () => {
    it("keeps capability declarations and optional implementations coherent", () => {
      const declared = new Set(plugin.manifest.capabilities);
      const implemented = implementedCapabilities(plugin);
      expect([...declared].sort()).toEqual([...implemented].sort());
      expect(
        plugin.manifest.capabilities.filter(
          (capability, index, values) => values.indexOf(capability) !== index,
        ),
      ).toEqual([]);
      expect(
        Object.keys(plugin.manifest.unsupportedCapabilities ?? {}).filter(
          (capability) => declared.has(capability as SourceControlCapabilityId),
        ),
      ).toEqual([]);
      const exercised = new Set<SourceControlCapabilityId>([
        "provider.auth",
        "repositoryIdentity",
        ...(fixtures.operations?.map((fixture) => fixture.capability) ?? []),
      ]);
      expect([...exercised].sort()).toEqual([...declared].sort());
    });

    it("runs readiness and authentication fixtures", async () => {
      if (!fixtures.probe || !fixtures.auth) return;
      const match = firstMatch(plugin.discovery.match(fixtures.probe));
      expect(match).not.toBeNull();
      await expect(
        plugin.discovery.checkReadiness(match!, operationContext()),
      ).resolves.toMatchObject({
        authentication: fixtures.auth.expectedAuthentication,
      });
      await expect(fixtures.auth.run(plugin)).resolves.toMatchObject({
        authentication: fixtures.auth.expectedAuthentication,
      });
    });

    it.each(
      fixtures.operations ?? [],
    )("executes declared $capability fixture", async (fixture) => {
      await expect(fixture.run(plugin)).resolves.not.toBeUndefined();
    });

    it.each(
      fixtures.repository.urls,
    )("normalizes repository identity for %s", (url) => {
      expect(plugin.repositories?.parseUrl(url)).toEqual(
        fixtures.repository.expected,
      );
      expect(plugin.git.parseUrl(url)).toEqual(fixtures.repository.expected);
    });

    it("fails closed for an undeclared capability", async () => {
      const undeclared = ALL_CAPABILITIES.find(
        (capability) => !plugin.manifest.capabilities.includes(capability),
      );
      if (!undeclared) return;
      const registry = new SourceControlRegistry();
      registry.register(plugin);
      const capabilities: CapabilityMatrix = {
        entries: Object.fromEntries(
          plugin.manifest.capabilities.map((capability) => [
            capability,
            { supported: true as const },
          ]),
        ),
      };
      await expect(
        registry.invoke({
          activation: {
            authentication: "authenticated",
            capabilities,
            diagnostics: [],
            generation: 0,
            projectPath: "/contract",
            provider: plugin.manifest,
            remote: { name: "origin", url: fixtures.repository.urls[0] },
            repository: fixtures.repository.expected,
            unavailableReason: null,
          },
          capability: undeclared,
          operation: undeclared,
          run: async () => undefined,
        }),
      ).rejects.toMatchObject({
        code: "source-control/capability-unsupported",
      } satisfies Partial<ProviderRegistryError>);
    });

    if (fixtures.probe) {
      it("keeps discovery matching pure", () => {
        expect(() => plugin.discovery.match(fixtures.probe!)).not.toThrow();
      });
    }

    if (fixtures.selfHosted) {
      it("preserves mapped self-hosted identity", () => {
        expect(plugin.git.parseUrl(fixtures.selfHosted!.url)).toBeNull();
        const match = firstMatch(
          plugin.discovery.match(fixtures.selfHosted!.probe),
        );
        expect(match?.repository).toEqual(fixtures.selfHosted!.expected);
      });
    }

    it("enforces cancellation and deadlines when an operation ignores its signal", async () => {
      const controller = new AbortController();
      const cancellation = invokeProvider({
        operation: "contract.cancel",
        providerId: plugin.manifest.id,
        run: () => new Promise<never>(() => undefined),
        signal: controller.signal,
        timeoutMs: 1_000,
      });
      controller.abort(new Error("cancel contract"));
      await expect(cancellation).rejects.toMatchObject({
        code: "source-control/cancelled",
      });
      await expect(
        invokeProvider({
          operation: "contract.timeout",
          providerId: plugin.manifest.id,
          run: () => new Promise<never>(() => undefined),
          timeoutMs: 1,
        }),
      ).rejects.toMatchObject({ code: "source-control/timeout" });
    });

    it("redacts credentials from invocation errors and logs", async () => {
      const secret = `${plugin.manifest.id}-contract-secret`;
      const logs: string[] = [];
      let errorMessage = "";
      try {
        await invokeProvider({
          log: (message) => logs.push(message),
          operation: "contract.redaction",
          providerId: plugin.manifest.id,
          run: async () => {
            throw new Error(`request failed for ${secret}`);
          },
          secrets: [secret],
          timeoutMs: 1_000,
        });
      } catch (cause) {
        errorMessage = cause instanceof Error ? cause.message : String(cause);
      }
      expect(errorMessage).not.toContain(secret);
      expect(logs.join("\n")).not.toContain(secret);
    });
  });
}

function operationContext() {
  return {
    deadline: Date.now() + 10_000,
    signal: new AbortController().signal,
  };
}

function firstMatch(
  match: ProviderMatch | readonly ProviderMatch[] | null,
): ProviderMatch | null {
  return Array.isArray(match)
    ? (match[0] ?? null)
    : (match as ProviderMatch | null);
}

function implementedCapabilities(
  plugin: SourceControlProviderPlugin,
): Set<SourceControlCapabilityId> {
  const implemented = new Set<SourceControlCapabilityId>([
    "provider.auth",
    "repositoryIdentity",
  ]);
  const optional: readonly [
    SourceControlCapabilityId,
    ((...args: never[]) => unknown) | undefined,
  ][] = [
    ["discovery.listNamespaces", plugin.discovery.listNamespaces],
    ["discovery.listRepositories", plugin.discovery.listRepositories],
    ["changeRequests.create", plugin.changeRequests?.create],
    ["changeRequests.get", plugin.changeRequests?.get],
    ["changeRequests.getByUrl", plugin.changeRequests?.getByUrl],
    ["changeRequests.list", plugin.changeRequests?.list],
    ["changeRequests.status", plugin.changeRequests?.status],
    ["changeRequests.comment", plugin.changeRequests?.comment],
    ["changeRequests.merge", plugin.changeRequests?.merge],
    ["changeRequests.preflight", plugin.changeRequests?.preflight],
    ["changeRequests.resolveHead", plugin.changeRequests?.resolveHead],
    ["checks.list", plugin.checks?.list],
    ["checks.snapshot", plugin.checks?.snapshot],
    ["checks.failureLog", plugin.checks?.failureLog],
    ["checks.fixPrompt", plugin.checks?.fixPrompt],
    ["reviewThreads.list", plugin.reviews?.listThreads],
    ["reviewThreads.resolve", plugin.reviews?.resolveThread],
    ["workItems.get", plugin.workItems?.get],
    ["workItems.getByUrl", plugin.workItems?.getByUrl],
    ["workItems.list", plugin.workItems?.list],
    ["branches.publish", plugin.git.publishBranch],
    ["provider.clone", plugin.git.clone],
  ];
  for (const [capability, operation] of optional) {
    if (operation) implemented.add(capability);
  }
  return implemented;
}
