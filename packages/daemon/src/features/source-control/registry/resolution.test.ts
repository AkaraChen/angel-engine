import type {
  ProbeContext,
  ProviderMatch,
} from "@angel-engine/daemon-api/source-control";
import { describe, expect, it } from "vitest";

import { resolveProvider } from "./resolution";

function context(overrides: Partial<ProbeContext> = {}): ProbeContext {
  return {
    defaultRemote: null,
    explicitProviderId: null,
    explicitRemote: null,
    hostMappings: {},
    projectPath: "/workspace/project",
    remotes: [],
    upstreamRemote: null,
    ...overrides,
  };
}

function match(providerId: string, remoteName: string): ProviderMatch {
  const url = `https://${providerId}.example/${remoteName}/repo.git`;
  return {
    providerId,
    remote: { fetchUrl: url, name: remoteName, pushUrl: url, url },
    repository: null,
    score: 100,
    source: "remote",
  };
}

describe("resolveProvider", () => {
  it("returns ambiguity for GitHub and GitLab remotes instead of choosing GitHub", () => {
    const result = resolveProvider(context(), [
      match("github", "origin"),
      match("gitlab", "mirror"),
    ]);

    expect(result).toMatchObject({ status: "ambiguous" });
  });

  it("applies explicit config, upstream, and the sole default remote in order", () => {
    const matches = [match("github", "origin"), match("gitlab", "mirror")];

    expect(
      resolveProvider(
        context({
          explicitProviderId: "github",
          explicitRemote: "origin",
          upstreamRemote: "mirror",
        }),
        matches,
      ),
    ).toMatchObject({ status: "resolved", match: { providerId: "github" } });
    expect(
      resolveProvider(context({ upstreamRemote: "mirror" }), matches),
    ).toMatchObject({ status: "resolved", match: { providerId: "gitlab" } });
    expect(
      resolveProvider(context({ defaultRemote: "origin" }), matches),
    ).toMatchObject({ status: "resolved", match: { providerId: "github" } });
  });

  it("does not depend on plugin or remote registration order", () => {
    const matches = [match("gitlab", "mirror"), match("github", "origin")];
    expect(resolveProvider(context(), matches)).toEqual(
      resolveProvider(context(), [...matches].reverse()),
    );
  });
});
