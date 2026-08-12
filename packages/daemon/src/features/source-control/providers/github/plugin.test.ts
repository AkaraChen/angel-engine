import type {
  ProbeContext,
  RemoteDescriptor,
} from "@angel-engine/daemon-api/source-control";
import { describe, expect, it, vi } from "vitest";

import { createGitHubPlugin } from "./plugin";

const remote = (url: string, name = "origin"): RemoteDescriptor => ({
  fetchUrl: url,
  name,
  pushUrl: null,
  url,
});

const context = (
  remotes: readonly RemoteDescriptor[],
  overrides: Partial<ProbeContext> = {},
): ProbeContext => ({
  defaultRemote: remotes.length === 1 ? remotes[0].name : null,
  explicitProviderId: null,
  explicitRemote: null,
  hostMappings: {},
  projectPath: "/project",
  remotes,
  upstreamRemote: null,
  ...overrides,
});

const operationContext = () => ({
  deadline: Date.now() + 30_000,
  signal: new AbortController().signal,
});

describe("GitHub source-control provider", () => {
  it.each([
    "https://github.com/acme/widgets.git",
    "ssh://git@github.com/acme/widgets.git",
    "git@github.com:acme/widgets.git",
  ])("matches GitHub remote %s", (url) => {
    const match = createGitHubPlugin().discovery.match(context([remote(url)]));

    expect(match).toMatchObject({
      providerId: "github",
      remote: { name: "origin", url },
      source: "default-remote",
    });
  });

  it("matches a GitHub Enterprise host only through explicit mapping", () => {
    const enterprise = remote("ssh://git@code.acme.internal/team/app.git");
    const plugin = createGitHubPlugin();

    expect(plugin.discovery.match(context([enterprise]))).toBeNull();
    expect(
      plugin.discovery.match(
        context([enterprise], {
          hostMappings: { "code.acme.internal": "github" },
        }),
      ),
    ).toMatchObject({ providerId: "github" });
  });

  it("reports authenticated readiness through gh auth status", async () => {
    const runGh = vi.fn(async () => ({ stderr: "", stdout: "" }));
    const plugin = createGitHubPlugin({
      findGh: async () => "/usr/bin/gh",
      runGh,
    });
    const match = plugin.discovery.match(
      context([remote("https://github.com/acme/widgets.git")]),
    );
    if (match === null) throw new Error("Expected GitHub match.");

    await expect(
      plugin.discovery.checkReadiness(match, operationContext()),
    ).resolves.toEqual({ authentication: "authenticated", diagnostics: [] });
    expect(runGh).toHaveBeenCalledWith(
      ["auth", "status", "--hostname", "github.com"],
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
  });

  it("reports missing and unauthenticated gh without throwing", async () => {
    const match = createGitHubPlugin().discovery.match(
      context([remote("https://github.com/acme/widgets.git")]),
    );
    if (match === null) throw new Error("Expected GitHub match.");

    const missing = createGitHubPlugin({ findGh: async () => null });
    await expect(
      missing.discovery.checkReadiness(match, operationContext()),
    ).resolves.toMatchObject({
      authentication: "unavailable",
      diagnostics: [{ code: "source-control/cli-missing" }],
    });

    const unauthenticated = createGitHubPlugin({
      findGh: async () => "/usr/bin/gh",
      runGh: async () => {
        throw Object.assign(new Error("command failed"), {
          stderr: "not logged into GitHub",
        });
      },
    });
    await expect(
      unauthenticated.discovery.checkReadiness(match, operationContext()),
    ).resolves.toMatchObject({
      authentication: "unauthenticated",
      diagnostics: [{ code: "source-control/unauthenticated" }],
    });
  });
});
