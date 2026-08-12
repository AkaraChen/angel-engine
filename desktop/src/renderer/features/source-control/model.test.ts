import type { ProviderActivation } from "@angel-engine/daemon-api/source-control";
import { describe, expect, it } from "vitest";

import { queryKeys } from "@/platform/query-keys";
import { capabilityState, sourceControlProviderIdentity } from "./model";

function activation(
  overrides: Partial<ProviderActivation> = {},
): ProviderActivation {
  return {
    authentication: "authenticated",
    capabilities: { entries: {} },
    diagnostics: [],
    generation: 1,
    projectPath: "/work/angel",
    provider: {
      capabilities: [],
      displayName: "Forge",
      hosts: ["forge.com"],
      id: "forge",
    },
    remote: {
      name: "origin",
      url: "https://forge.com/angel/engine",
    },
    repository: {
      displayPath: "angel/engine",
      host: "forge.com",
      name: "engine",
      namespace: ["angel"],
      providerId: "forge",
      remoteId: null,
      webUrl: "https://forge.com/angel/engine",
    },
    unavailableReason: null,
    ...overrides,
  };
}

describe("source-control renderer foundation", () => {
  it("treats a missing capability as unsupported", () => {
    expect(capabilityState({ entries: {} }, "checks.snapshot")).toMatchObject({
      supported: false,
      reason: { kind: "unknown-capability" },
    });
  });

  it("changes resource keys with provider, repository, and generation identity", () => {
    const forge = activation();
    const nextGeneration = activation({ generation: 2 });
    const otherRepository = activation({
      repository: {
        ...forge.repository!,
        displayPath: "angel/desktop",
        name: "desktop",
        webUrl: "https://forge.com/angel/desktop",
      },
    });
    const gitlab = activation({
      provider: { ...forge.provider, displayName: "GitLab", id: "gitlab" },
      repository: {
        ...forge.repository!,
        providerId: "gitlab",
      },
    });
    const identities = [forge, nextGeneration, otherRepository, gitlab].map(
      sourceControlProviderIdentity,
    );
    const keys = identities.map((identity) =>
      queryKeys.sourceControl.checks(identity, "42"),
    );

    expect(new Set(identities).size).toBe(4);
    expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(4);
    expect(identities[0]).toBe("forge:forge.com/angel/engine:1");
  });
});
