import type { SourceControlProviderPlugin } from "@angel-engine/daemon-api/source-control";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { executeGit } from "../local-git/backend";
import { writeSourceControlProjectConfig } from "./config-store";
import { SourceControlCoordinator } from "./coordinator";
import { SourceControlRegistry } from "./registry";

const roots: string[] = [];

async function repository() {
  const root = await mkdtemp(path.join(os.tmpdir(), "source-control-watch-"));
  roots.push(root);
  await executeGit(root, ["init", "--initial-branch=main"]);
  await executeGit(root, [
    "remote",
    "add",
    "origin",
    "https://github.com/acme/app.git",
  ]);
  return root;
}

function plugin(id: string, host: string): SourceControlProviderPlugin {
  return {
    auth: {
      status: async () => ({
        authentication: "authenticated",
        diagnostics: [],
      }),
    },
    discovery: {
      checkReadiness: async () => ({
        authentication: "authenticated",
        diagnostics: [],
      }),
      match: (context) => {
        const remote = context.remotes.find((candidate) =>
          candidate.url.includes(host),
        );
        return remote
          ? {
              providerId: id,
              remote,
              repository: null,
              score: 100,
              source: "remote",
            }
          : null;
      },
    },
    git: { parseChangeRequestUrl: () => null, parseUrl: () => null },
    manifest: {
      capabilities: ["provider.auth"],
      displayName: id,
      hosts: [host],
      id,
    },
  };
}

async function waitForGeneration(
  registry: SourceControlRegistry,
  projectPath: string,
  minimum: number,
) {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      clearInterval(poll);
      reject(new Error("Timed out waiting for source-control invalidation."));
    }, 3_000);
    const poll = setInterval(() => {
      if (registry.generation(projectPath) < minimum) return;
      clearInterval(poll);
      clearTimeout(timeout);
      resolve();
    }, 20);
  });
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe("SourceControlCoordinator", () => {
  it("invalidates and re-probes after remote and project config changes", async () => {
    const root = await repository();
    const registry = new SourceControlRegistry();
    registry.register(plugin("fake-github", "github.com"));
    registry.register(plugin("fake-gitlab", "gitlab.com"));
    const coordinator = new SourceControlCoordinator(registry);

    const initial = await coordinator.activate({ projectPath: root });
    expect(initial).toMatchObject({
      activation: { provider: { id: "fake-github" } },
      status: "active",
    });

    await executeGit(root, [
      "remote",
      "set-url",
      "origin",
      "https://gitlab.com/acme/app.git",
    ]);
    await waitForGeneration(registry, root, 1);
    const afterRemoteChange = await coordinator.activate({ projectPath: root });
    expect(afterRemoteChange).toMatchObject({
      activation: { provider: { id: "fake-gitlab" } },
      status: "active",
    });
    if (afterRemoteChange.status !== "active") {
      throw new Error("Expected an active provider after remote change.");
    }
    const remoteGeneration = afterRemoteChange.activation.generation;
    expect(remoteGeneration).toBeGreaterThan(0);

    await writeSourceControlProjectConfig(root, {
      provider: { providerId: "fake-gitlab", remote: "origin" },
    });
    await waitForGeneration(registry, root, remoteGeneration + 1);
    const afterConfigChange = await coordinator.activate({
      projectPath: root,
      providerConfig: { providerId: "fake-gitlab", remote: "origin" },
    });
    expect(afterConfigChange).toMatchObject({
      activation: { provider: { id: "fake-gitlab" } },
      status: "active",
    });
    if (afterConfigChange.status !== "active") {
      throw new Error("Expected an active provider after config change.");
    }
    expect(afterConfigChange.activation.generation).toBeGreaterThan(
      remoteGeneration,
    );
    coordinator.close();
  }, 15_000);
});
