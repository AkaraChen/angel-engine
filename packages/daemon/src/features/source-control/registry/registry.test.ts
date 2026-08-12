import type {
  ProviderActivation,
  ProviderAuthenticationState,
  ProviderMatch,
  SourceControlProviderPlugin,
} from "@angel-engine/daemon-api/source-control";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { executeGit } from "../local-git/backend";
import { ProviderInvocationError, SourceControlRegistry } from "./registry";

const roots: string[] = [];

function requireSingleMatch(
  match: ProviderMatch | readonly ProviderMatch[] | null,
): ProviderMatch {
  if (match === null || Array.isArray(match)) {
    throw new Error("Expected one provider match.");
  }
  return match as ProviderMatch;
}

async function repository(remoteUrl = "https://github.com/acme/app.git") {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "source-control-registry-"),
  );
  roots.push(root);
  await executeGit(root, ["init", "--initial-branch=main"]);
  await executeGit(root, ["remote", "add", "origin", remoteUrl]);
  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

function fakePlugin(options: {
  id: string;
  host: string;
  authentication?: ProviderAuthenticationState;
}): SourceControlProviderPlugin {
  const authentication = options.authentication ?? "authenticated";
  return {
    auth: {
      status: async () => ({ authentication, diagnostics: [] }),
    },
    discovery: {
      checkReadiness: async () => ({ authentication, diagnostics: [] }),
      match: (context) => {
        const remote = context.remotes.find((candidate) => {
          const mappedProvider = (() => {
            try {
              return context.hostMappings[new URL(candidate.url).hostname];
            } catch {
              return undefined;
            }
          })();
          return (
            candidate.url.includes(options.host) ||
            mappedProvider === options.id
          );
        });
        if (!remote) return null;
        return {
          providerId: options.id,
          remote,
          repository: null,
          score: 100,
          source: "remote",
        };
      },
    },
    git: {
      parseChangeRequestUrl: () => null,
      parseUrl: () => null,
    },
    manifest: {
      capabilities: ["provider.auth", "checks.list"],
      displayName: options.id,
      hosts: [options.host],
      id: options.id,
    },
  };
}

function activation(
  provider: SourceControlProviderPlugin,
  projectPath: string,
): ProviderActivation {
  return {
    authentication: "authenticated",
    capabilities: {
      entries: {
        "checks.list": { supported: true },
        "provider.auth": { supported: true },
      },
    },
    diagnostics: [],
    generation: 0,
    projectPath,
    provider: provider.manifest,
    remote: {
      name: "origin",
      url: `https://${provider.manifest.hosts[0]}/repo.git`,
    },
    repository: null,
    unavailableReason: null,
  };
}

describe("SourceControlRegistry", () => {
  it("dispatches link parsing by provider score", () => {
    const provider = fakePlugin({ host: "code.example", id: "forge" });
    const identity = {
      displayPath: "acme/app",
      host: "code.example",
      name: "app",
      namespace: ["acme"],
      providerId: "forge",
      remoteId: null,
      webUrl: "https://code.example/acme/app",
    };
    provider.links = {
      matchUrl: (url) => (url.includes("code.example") ? 200 : null),
      parseUrl: (url) => ({
        id: "42",
        kind: "work-item",
        repository: identity,
        url,
      }),
    };
    const registry = new SourceControlRegistry();
    registry.register(provider);

    expect(
      registry.parseLink("https://code.example/acme/app/issues/42"),
    ).toEqual({
      descriptor: {
        id: "42",
        kind: "work-item",
        repository: identity,
        url: "https://code.example/acme/app/issues/42",
      },
      providerId: "forge",
      status: "resolved",
    });
  });

  it("does not guess when multiple providers match the same repository URL", () => {
    const registry = new SourceControlRegistry();
    for (const id of ["forge-a", "forge-b"]) {
      const provider = fakePlugin({ host: "code.example", id });
      provider.repositories = {
        parseUrl: () => ({
          displayPath: "acme/app",
          host: "code.example",
          name: "app",
          namespace: ["acme"],
          providerId: id,
          remoteId: null,
          webUrl: "https://code.example/acme/app",
        }),
      };
      registry.register(provider);
    }

    expect(
      registry.parseRepositoryUrl("https://code.example/acme/app.git"),
    ).toEqual({
      providerIds: ["forge-a", "forge-b"],
      status: "ambiguous",
    });
  });

  it("reports multiple matching remotes as ambiguous", async () => {
    const root = await repository();
    await executeGit(root, [
      "remote",
      "add",
      "mirror",
      "https://github.com/acme/app.git",
    ]);
    const provider = fakePlugin({ host: "github.com", id: "fake-github" });
    provider.discovery.match = (probe) =>
      probe.remotes.map((candidate) => ({
        providerId: provider.manifest.id,
        remote: candidate,
        repository: null,
        score: 100,
        source: "remote",
      }));
    const registry = new SourceControlRegistry();
    registry.register(provider);

    await expect(
      registry.activate({ projectPath: root }),
    ).resolves.toMatchObject({
      candidates: [
        { remote: { name: "mirror" } },
        { remote: { name: "origin" } },
      ],
      status: "ambiguous",
    });
  });

  it("zero-config activates a single matching provider", async () => {
    const root = await repository();
    const registry = new SourceControlRegistry();
    registry.register(fakePlugin({ host: "github.com", id: "fake-github" }));

    const result = await registry.activate({ projectPath: root });

    expect(result).toMatchObject({
      activation: {
        generation: 0,
        provider: { id: "fake-github" },
        remote: { name: "origin" },
      },
      status: "active",
    });
  });

  it("caches readiness until its TTL or project generation changes", async () => {
    const root = await repository();
    const provider = fakePlugin({ host: "github.com", id: "fake-github" });
    const checkReadiness = vi.fn(async () => ({
      authentication: "authenticated" as const,
      diagnostics: [],
    }));
    provider.discovery.checkReadiness = checkReadiness;
    const registry = new SourceControlRegistry({ readinessTtlMs: 60_000 });
    registry.register(provider);

    await registry.activate({ projectPath: root });
    await registry.activate({ projectPath: root });
    expect(checkReadiness).toHaveBeenCalledOnce();

    registry.invalidate(root);
    await registry.activate({ projectPath: root });
    expect(checkReadiness).toHaveBeenCalledTimes(2);
  });

  it("represents unauthenticated operations as unsupported", async () => {
    const root = await repository();
    const registry = new SourceControlRegistry();
    registry.register(
      fakePlugin({
        authentication: "unauthenticated",
        host: "github.com",
        id: "fake-github",
      }),
    );

    const result = await registry.activate({ projectPath: root });

    expect(result).toMatchObject({
      activation: {
        capabilities: {
          entries: {
            "checks.list": {
              reason: { kind: "unauthenticated" },
              supported: false,
            },
          },
        },
      },
      status: "active",
    });
  });

  it("uses an explicit host mapping for a self-hosted remote", async () => {
    const root = await repository("https://code.acme.internal/team/app.git");
    const registry = new SourceControlRegistry();
    registry.register(fakePlugin({ host: "gitlab.com", id: "fake-gitlab" }));

    const result = await registry.activate({
      hostMappings: [{ host: "code.acme.internal", providerId: "fake-gitlab" }],
      projectPath: root,
    });

    expect(result).toMatchObject({
      activation: { provider: { id: "fake-gitlab" } },
      status: "active",
    });
  });

  it("isolates a timed-out plugin while local Git and another plugin remain usable", async () => {
    const root = await repository();
    const slow = fakePlugin({ host: "slow.example", id: "slow" });
    const healthy = fakePlugin({ host: "healthy.example", id: "healthy" });
    const registry = new SourceControlRegistry({ invocationTimeoutMs: 10 });
    registry.register(slow);
    registry.register(healthy);

    await expect(
      registry.invoke({
        activation: activation(slow, root),
        capability: "checks.list",
        operation: "checks.list",
        run: () => new Promise(() => undefined),
      }),
    ).rejects.toMatchObject({
      code: "source-control/timeout",
    });
    await expect(
      executeGit(root, ["status", "--porcelain"]),
    ).resolves.toBeDefined();
    await expect(
      registry.invoke({
        activation: activation(healthy, root),
        capability: "checks.list",
        operation: "checks.list",
        run: async () => "healthy",
      }),
    ).resolves.toBe("healthy");
  });

  it.each([
    ["Error", async () => Promise.reject(new Error("boom"))],
    ["string", async () => Promise.reject("boom")],
  ])("normalizes a thrown %s into a typed provider failure", async (_label, run) => {
    const root = await repository();
    const plugin = fakePlugin({ host: "github.com", id: "fake-github" });
    const registry = new SourceControlRegistry();
    registry.register(plugin);

    await expect(
      registry.invoke({
        activation: activation(plugin, root),
        capability: "checks.list",
        operation: "checks.list",
        run,
      }),
    ).rejects.toMatchObject({
      code: "source-control/failed",
      providerId: "fake-github",
    });
  });

  it("redacts URL credentials and explicit secrets from logs and errors", async () => {
    const token = "super-secret-token";
    const logs: string[] = [];
    const root = await repository(
      `https://user:${token}@github.com/acme/app.git`,
    );
    const plugin = fakePlugin({ host: "github.com", id: "fake-github" });
    const match = plugin.discovery.match.bind(plugin.discovery);
    plugin.discovery.match = (context) => {
      const candidate = requireSingleMatch(match(context));
      return {
        ...candidate,
        repository: {
          displayPath: "acme/app",
          host: "github.com",
          name: "app",
          namespace: ["acme"],
          providerId: plugin.manifest.id,
          remoteId: null,
          webUrl: `https://user:${token}@github.com/acme/app`,
        },
      };
    };
    const registry = new SourceControlRegistry({
      log: (message) => logs.push(message),
    });
    registry.register(plugin);
    const result = await registry.activate({ projectPath: root });
    if (result.status !== "active") throw new Error("Expected activation.");

    expect(result.activation.remote.url).toBe(
      "https://github.com/acme/app.git",
    );
    expect(result.activation.repository?.webUrl).toBe(
      "https://github.com/acme/app",
    );
    expect(JSON.stringify(result)).not.toContain(token);

    const failure = await registry
      .invoke({
        activation: result.activation,
        capability: "checks.list",
        operation: "checks.list",
        run: async () => Promise.reject(new Error(`token=${token}`)),
      })
      .catch((cause: ProviderInvocationError) => cause);

    expect(failure.message).not.toContain(token);
    expect(logs.join("\n")).not.toContain(token);
    expect(failure.message).toContain("[REDACTED]");
  });

  it("removes URL credentials from ambiguous provider candidates", async () => {
    const githubToken = "github-secret-token";
    const gitlabToken = "gitlab-secret-token";
    const root = await repository(
      `https://user:${githubToken}@github.com/acme/app.git`,
    );
    await executeGit(root, [
      "remote",
      "add",
      "mirror",
      `https://user:${gitlabToken}@gitlab.com/acme/app.git`,
    ]);
    const registry = new SourceControlRegistry();
    registry.register(fakePlugin({ host: "github.com", id: "fake-github" }));
    registry.register(fakePlugin({ host: "gitlab.com", id: "fake-gitlab" }));

    const result = await registry.activate({ projectPath: root });

    expect(result.status).toBe("ambiguous");
    expect(JSON.stringify(result)).not.toContain(githubToken);
    expect(JSON.stringify(result)).not.toContain(gitlabToken);
    if (result.status !== "ambiguous") throw new Error("Expected ambiguity.");
    expect(result.candidates.map((candidate) => candidate.remote)).toEqual([
      {
        fetchUrl: "https://github.com/acme/app.git",
        name: "origin",
        pushUrl: "https://github.com/acme/app.git",
        url: "https://github.com/acme/app.git",
      },
      {
        fetchUrl: "https://gitlab.com/acme/app.git",
        name: "mirror",
        pushUrl: "https://gitlab.com/acme/app.git",
        url: "https://gitlab.com/acme/app.git",
      },
    ]);
  });

  it("propagates caller cancellation as a typed provider error", async () => {
    const root = await repository();
    const plugin = fakePlugin({ host: "github.com", id: "fake-github" });
    const registry = new SourceControlRegistry({ invocationTimeoutMs: 60_000 });
    registry.register(plugin);
    const controller = new AbortController();
    const invocation = registry.invoke({
      activation: activation(plugin, root),
      capability: "checks.list",
      operation: "checks.list",
      run: () => new Promise(() => undefined),
      signal: controller.signal,
    });

    controller.abort(new Error("cancelled by test"));

    await expect(invocation).rejects.toMatchObject({
      code: "source-control/cancelled",
    });
  });

  it("rejects an activation after invalidation increments its generation", async () => {
    const root = await repository();
    const plugin = fakePlugin({ host: "github.com", id: "fake-github" });
    const registry = new SourceControlRegistry();
    registry.register(plugin);
    const current = activation(plugin, root);
    registry.invalidate(root);

    await expect(
      registry.invoke({
        activation: current,
        capability: "checks.list",
        operation: "checks.list",
        run: async () => "unreachable",
      }),
    ).rejects.toMatchObject({
      code: "source-control/stale-activation",
    });
  });
});
