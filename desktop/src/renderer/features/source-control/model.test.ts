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
      displayName: "GitHub",
      hosts: ["github.com"],
      id: "github",
    },
    remote: {
      name: "origin",
      url: "https://github.com/angel/engine",
    },
    repository: {
      displayPath: "angel/engine",
      host: "github.com",
      name: "engine",
      namespace: ["angel"],
      providerId: "github",
      remoteId: null,
      webUrl: "https://github.com/angel/engine",
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
    const github = activation();
    const nextGeneration = activation({ generation: 2 });
    const otherRepository = activation({
      repository: {
        ...github.repository!,
        displayPath: "angel/desktop",
        name: "desktop",
        webUrl: "https://github.com/angel/desktop",
      },
    });
    const gitlab = activation({
      provider: { ...github.provider, displayName: "GitLab", id: "gitlab" },
      repository: {
        ...github.repository!,
        providerId: "gitlab",
      },
    });
    const identities = [github, nextGeneration, otherRepository, gitlab].map(
      sourceControlProviderIdentity,
    );
    const keys = identities.map((identity) =>
      queryKeys.sourceControl.checks(identity, "42"),
    );

    expect(new Set(identities).size).toBe(4);
    expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(4);
    expect(identities[0]).toBe("github:github.com/angel/engine:1");
  });
});
