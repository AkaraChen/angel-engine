import type {
  ProviderMatch,
  SourceControlProviderPlugin,
  WorkItemCapability,
  WorkItem,
} from "@angel-engine/daemon-api/source-control";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";

import { daemonErrorPayload, DaemonError } from "../../platform/errors";
import { executeGit } from "./local-git/backend";
import { SourceControlCoordinator } from "./registry/coordinator";
import { SourceControlRegistry } from "./registry/registry";
import { registerSourceControlHttpApi } from "./http";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { force: true, recursive: true })),
  );
});

const repository = {
  displayPath: "group/project",
  host: "gitlab.test",
  name: "project",
  namespace: ["group"],
  providerId: "gitlab",
  remoteId: null,
  webUrl: "https://gitlab.test/group/project",
} as const;

function provider(
  options: { list?: WorkItemCapability } = {},
): SourceControlProviderPlugin {
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
      match: (context): ProviderMatch | null => {
        const remote = context.remotes.find((candidate) =>
          candidate.url.includes("gitlab.test"),
        );
        return remote
          ? {
              providerId: "gitlab",
              remote,
              repository,
              score: 100,
              source: "remote",
            }
          : null;
      },
    },
    git: { parseChangeRequestUrl: () => null, parseUrl: () => repository },
    manifest: {
      capabilities: [
        "provider.auth",
        ...(options.list ? ["workItems.list" as const] : []),
      ],
      displayName: "GitLab",
      hosts: ["gitlab.test"],
      id: "gitlab",
    },
    repositories: { parseUrl: () => repository },
    workItems: options.list,
  };
}

async function fixture(plugin: SourceControlProviderPlugin) {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "angel-source-control-http-"),
  );
  roots.push(root);
  await executeGit(root, ["init"]);
  await executeGit(root, ["remote", "add", "origin", repository.webUrl]);
  const registry = new SourceControlRegistry();
  registry.register(plugin);
  const app = new Hono();
  app.onError((error, context) =>
    error instanceof DaemonError
      ? context.json(daemonErrorPayload(error), error.status)
      : context.json({ error: String(error) }, 500),
  );
  registerSourceControlHttpApi(app, {
    coordinator: new SourceControlCoordinator(registry),
    loadHostMappings: async () => [],
    runDb: async () => {
      throw new Error("Database must not be used by this contract test.");
    },
  });
  return { app, root };
}

describe("source-control HTTP contract", () => {
  it("requires projectPath explicitly on every business endpoint", async () => {
    const { app } = await fixture(provider());
    const requests = [
      ["GET", "/api/source-control/namespaces"],
      ["GET", "/api/source-control/repositories"],
      ["GET", "/api/source-control/work-items"],
      ["GET", "/api/source-control/change-requests"],
      ["GET", "/api/source-control/change-requests/current"],
      ["GET", "/api/source-control/change-requests/42"],
      ["GET", "/api/source-control/change-requests/preflight"],
      ["GET", "/api/source-control/change-requests/template"],
      ["GET", "/api/source-control/checks?id=42"],
      ["GET", "/api/source-control/checks/summary?id=42"],
      ["GET", "/api/source-control/reviews/threads?id=42"],
      ["POST", "/api/source-control/links/resolve"],
      ["POST", "/api/source-control/change-requests"],
      ["POST", "/api/source-control/change-requests/42/comments"],
      ["POST", "/api/source-control/change-requests/42/merge"],
      ["POST", "/api/source-control/change-requests/42/workspace"],
      ["POST", "/api/source-control/checks/fix-prompt"],
      ["POST", "/api/source-control/reviews/threads/thread-1/resolve"],
    ] as const;
    for (const [method, url] of requests) {
      const response = await app.request(url, {
        body: method === "POST" ? "{}" : undefined,
        headers:
          method === "POST"
            ? { "content-type": "application/json" }
            : undefined,
        method,
      });
      expect(response.status, `${method} ${url}`).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        code: "invalid-request",
      });
    }
  });

  it("activates the project and dispatches through the selected provider", async () => {
    const item: WorkItem = {
      assignees: [],
      author: null,
      body: "",
      closedAt: null,
      createdAt: null,
      id: "42",
      kind: "issue",
      labels: [],
      number: 42,
      repository,
      state: "open",
      title: "Generic item",
      updatedAt: null,
      webUrl: `${repository.webUrl}/issues/42`,
    };
    const list = vi.fn(async () => [item]);
    const { app, root } = await fixture(provider({ list: { list } }));
    const response = await app.request(
      `/api/source-control/work-items?projectPath=${encodeURIComponent(root)}`,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([item]);
    expect(list).toHaveBeenCalledWith(
      { limit: 50, query: null, repository },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("returns a generic unsupported reason without falling back to GitHub", async () => {
    const { app, root } = await fixture(provider());
    const response = await app.request(
      `/api/source-control/work-items?projectPath=${encodeURIComponent(root)}`,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "source-control/capability-unsupported",
      error:
        "This source-control provider does not support the requested operation.",
      sourceControl: {
        operation: "capability",
        providerId: "gitlab",
        retryable: false,
      },
    });
  });
});
