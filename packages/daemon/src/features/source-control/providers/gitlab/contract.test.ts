import type { ProbeContext } from "@angel-engine/daemon-api/source-control";
import { describe, expect, it, vi } from "vitest";

import { runProviderContractSuite } from "../../contract/provider-contract";
import { createGitLabPlugin, parseGitLabRepositoryUrl } from "./plugin";

const repository = {
  displayPath: "acme/platform/widgets",
  host: "gitlab.com",
  name: "widgets",
  namespace: ["acme", "platform"],
  providerId: "gitlab",
  remoteId: null,
  webUrl: "https://gitlab.com/acme/platform/widgets",
} as const;
const probe: ProbeContext = {
  defaultRemote: "origin",
  explicitProviderId: null,
  explicitRemote: null,
  hostMappings: {},
  projectPath: "/contract",
  remotes: [
    {
      fetchUrl: "https://gitlab.com/acme/platform/widgets.git",
      name: "origin",
      pushUrl: null,
      url: "https://gitlab.com/acme/platform/widgets.git",
    },
  ],
  upstreamRemote: null,
};

runProviderContractSuite(
  () => createGitLabPlugin({ findGlab: async () => null }),
  {
    probe,
    repository: {
      expected: repository,
      urls: [
        "https://gitlab.com/acme/platform/widgets.git",
        "ssh://git@gitlab.com/acme/platform/widgets.git",
        "git@gitlab.com:acme/platform/widgets.git",
      ],
    },
  },
);

describe("GitLab provider boundaries", () => {
  it("parses a mapped self-managed host and arbitrary namespace depth", () => {
    expect(
      parseGitLabRepositoryUrl(
        "git@code.acme.internal:one/two/three/widgets.git",
        "code.acme.internal",
      ),
    ).toMatchObject({
      host: "code.acme.internal",
      name: "widgets",
      namespace: ["one", "two", "three"],
    });
  });

  it("keeps merge and review threads outside the first release", () => {
    const plugin = createGitLabPlugin();
    expect(plugin.changeRequests?.merge).toBeUndefined();
    expect(plugin.reviews).toBeUndefined();
    expect(plugin.manifest.unsupportedCapabilities).toMatchObject({
      "changeRequests.merge": { kind: "out-of-scope" },
      "reviewThreads.list": { kind: "not-implemented" },
      "reviewThreads.resolve": { kind: "not-implemented" },
    });
  });

  it("clones with glab without putting credentials in arguments", async () => {
    const runGlab = vi.fn(async () => ({ stderr: "", stdout: "" }));
    const plugin = createGitLabPlugin({
      findGlab: async () => "/usr/bin/glab",
      runGlab,
    });
    await plugin.git.clone?.(
      { repository, targetPath: "/managed/widgets" },
      { deadline: Date.now() + 10_000, signal: new AbortController().signal },
    );
    expect(runGlab).toHaveBeenCalledWith(
      [
        "repo",
        "clone",
        "acme/platform/widgets",
        "/managed/widgets",
        "--hostname",
        "gitlab.com",
      ],
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
    expect(JSON.stringify(runGlab.mock.calls)).not.toMatch(/token|password/i);
  });
});
