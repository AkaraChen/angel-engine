import type {
  CapabilityMatrix,
  ProbeContext,
  RepositoryIdentity,
  SourceControlCapabilityId,
  SourceControlProviderPlugin,
} from "@angel-engine/daemon-api/source-control";
import { describe, expect, it } from "vitest";

import {
  ProviderRegistryError,
  SourceControlRegistry,
} from "../registry/registry";

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
  probe?: ProbeContext;
  repository: RepositoryContractFixture;
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
  });
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
