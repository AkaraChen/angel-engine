import type {
  ProviderActivation,
  ProviderAuthenticationState,
  SourceControlProviderPlugin,
} from "@angel-engine/daemon-api/source-control";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { executeGit } from "../local-git/backend";
import { ProviderInvocationError, SourceControlRegistry } from "./registry";

const roots: string[] = [];

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
    const registry = new SourceControlRegistry({
      log: (message) => logs.push(message),
    });
    registry.register(plugin);
    const result = await registry.activate({ projectPath: root });
    if (result.status !== "active") throw new Error("Expected activation.");

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
