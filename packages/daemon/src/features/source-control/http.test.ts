import type {
  ChangeRequestCapability,
  GitWorkflowCapability,
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
  options: {
    changeRequests?: ChangeRequestCapability;
    git?: Pick<GitWorkflowCapability, "publishBranch">;
    list?: WorkItemCapability;
  } = {},
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
    changeRequests: options.changeRequests,
    git: {
      parseChangeRequestUrl: () => null,
      parseUrl: () => repository,
      ...options.git,
    },
    manifest: {
      capabilities: [
        "provider.auth",
        ...(options.list ? ["workItems.list" as const] : []),
        ...(options.changeRequests?.preflight
          ? ["changeRequests.preflight" as const]
          : []),
        ...(options.changeRequests?.list
          ? ["changeRequests.list" as const]
          : []),
        ...(options.changeRequests?.create
          ? ["changeRequests.create" as const]
          : []),
        ...(options.changeRequests?.merge
          ? ["changeRequests.merge" as const]
          : []),
        ...(options.git?.publishBranch ? ["branches.publish" as const] : []),
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

  it("composes create preflight from provider and local Git state", async () => {
    const existing = {
      additions: null,
      allowedMergeMethods: ["squash" as const],
      author: null,
      body: "",
      changedFiles: null,
      checksUrl: null,
      closedAt: null,
      commitCount: null,
      createdAt: null,
      defaultMergeMethod: "squash" as const,
      deletions: null,
      draft: false,
      id: "7",
      mergeRequirements: [],
      mergedAt: null,
      number: 7,
      repository,
      reviewDecision: "approved" as const,
      source: { name: "feature", oid: null, repository },
      state: "open" as const,
      target: { name: "main", oid: null, repository },
      title: "Feature",
      updatedAt: null,
      viewerCanMerge: true,
      webUrl: `${repository.webUrl}/merge_requests/7`,
    };
    const preflight = vi.fn(async () => ({
      requirements: [],
      targetBranch: "main",
    }));
    const list = vi.fn(async () => [existing]);
    const { app, root } = await fixture(
      provider({ changeRequests: { list, preflight } }),
    );
    await executeGit(root, ["config", "user.email", "test@example.com"]);
    await executeGit(root, ["config", "user.name", "Test"]);
    await fs.writeFile(path.join(root, "base.txt"), "base");
    await executeGit(root, ["add", "."]);
    await executeGit(root, ["commit", "-m", "base"]);
    await executeGit(root, ["branch", "-M", "main"]);
    await executeGit(root, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
    await executeGit(root, ["checkout", "-b", "feature"]);
    await fs.writeFile(path.join(root, "feature.txt"), "feature");
    await executeGit(root, ["add", "."]);
    await executeGit(root, ["commit", "-m", "feature"]);

    const response = await app.request(
      `/api/source-control/change-requests/preflight?projectPath=${encodeURIComponent(root)}`,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      aheadCount: 1,
      availableTargetBranches: ["main"],
      existing: { id: "7" },
      needsPush: true,
      sourceBranch: "feature",
      targetBranch: "main",
    });
  });

  it("publishes before creating and forwards generic merge options", async () => {
    const created = {
      additions: null,
      allowedMergeMethods: ["squash" as const],
      author: null,
      body: "Body",
      changedFiles: null,
      checksUrl: null,
      closedAt: null,
      commitCount: null,
      createdAt: null,
      defaultMergeMethod: "squash" as const,
      deletions: null,
      draft: false,
      id: "8",
      mergeRequirements: [],
      mergedAt: null,
      number: 8,
      repository,
      reviewDecision: "none" as const,
      source: { name: "feature", oid: null, repository },
      state: "open" as const,
      target: { name: "main", oid: null, repository },
      title: "Feature",
      updatedAt: null,
      viewerCanMerge: true,
      webUrl: `${repository.webUrl}/merge_requests/8`,
    };
    const publishBranch = vi.fn(async () => ({
      remoteName: "origin",
      remoteRef: "feature",
    }));
    const create = vi.fn(async () => created);
    const merge = vi.fn(async (input) => ({
      ...created,
      id: input.id,
      state: "merged" as const,
    }));
    const { app, root } = await fixture(
      provider({
        changeRequests: { create, merge },
        git: { publishBranch },
      }),
    );

    const createResponse = await app.request(
      "/api/source-control/change-requests",
      {
        body: JSON.stringify({
          body: "Body",
          draft: false,
          projectPath: root,
          publish: true,
          sourceBranch: "feature",
          targetBranch: "main",
          title: "Feature",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );
    expect(createResponse.status).toBe(200);
    expect(publishBranch).toHaveBeenCalledBefore(create);

    const mergeResponse = await app.request(
      "/api/source-control/change-requests/8/merge",
      {
        body: JSON.stringify({
          deleteSourceBranch: true,
          method: "squash",
          projectPath: root,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );
    expect(mergeResponse.status).toBe(200);
    expect(merge).toHaveBeenCalledWith(
      expect.objectContaining({
        deleteSourceBranch: true,
        id: "8",
        method: "squash",
      }),
      expect.anything(),
    );
  });
});
