import type { ProbeContext } from "@angel-engine/daemon-api/source-control";
import { describe, expect, it, vi } from "vitest";

import { runProviderContractSuite } from "../../contract/provider-contract";
import type { LocalGitRunner } from "../../local-git/backend";
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

const actor = {
  avatar_url: null,
  id: 1,
  name: "Ada",
  username: "ada",
  web_url: "https://gitlab.com/ada",
};
const mergeRequest = {
  author: actor,
  created_at: "2026-08-13T00:00:00Z",
  description: null,
  detailed_merge_status: "mergeable",
  draft: false,
  iid: 42,
  merge_status: "can_be_merged",
  merged_at: null,
  source_branch: "feature",
  state: "opened",
  target_branch: "main",
  title: "Ship widgets",
  updated_at: "2026-08-13T01:00:00Z",
  web_url: `${repository.webUrl}/-/merge_requests/42`,
};
const issue = {
  assignees: [],
  author: actor,
  created_at: "2026-08-13T00:00:00Z",
  description: null,
  iid: 7,
  labels: [],
  state: "opened",
  title: "Widget issue",
  updated_at: "2026-08-13T01:00:00Z",
  web_url: `${repository.webUrl}/-/issues/7`,
};
const contractRunGlab = async (args: readonly string[]) => {
  const endpoint = args[3] ?? "";
  let payload: unknown = {};
  if (endpoint.startsWith("/groups?")) {
    payload = [
      { avatar_url: null, full_path: "acme/platform", id: 1, name: "Platform" },
    ];
  } else if (endpoint.includes("/projects?")) {
    payload = [
      {
        id: 1,
        name: "widgets",
        path_with_namespace: repository.displayPath,
        web_url: repository.webUrl,
      },
    ];
  } else if (endpoint.endsWith("/pipelines")) {
    payload = [
      {
        id: 9,
        ref: "feature",
        status: "success",
        web_url: "https://gitlab.com/pipelines/9",
      },
    ];
  } else if (endpoint.endsWith("/jobs")) {
    payload = [
      {
        allow_failure: false,
        id: 10,
        name: "test",
        status: "success",
        web_url: "https://gitlab.com/jobs/10",
      },
    ];
  } else if (endpoint.includes("/notes")) {
    payload = {
      author: actor,
      body: "Looks good",
      created_at: "2026-08-13T01:00:00Z",
      id: 11,
    };
  } else if (endpoint.includes("/merge_requests")) {
    payload = endpoint.includes("?") ? [mergeRequest] : mergeRequest;
  } else if (endpoint.includes("/issues")) {
    payload = endpoint.includes("?") ? [issue] : issue;
  }
  return { stderr: "", stdout: JSON.stringify(payload) };
};
const contractRunGit = async () => ({ stderr: "", stdout: "" });
const operationContext = () => ({
  deadline: Date.now() + 10_000,
  signal: new AbortController().signal,
});
const numbered = { id: "42", repository };
const listed = { limit: 10, query: null, repository };

runProviderContractSuite(
  () =>
    createGitLabPlugin({
      findGlab: async () => "/usr/bin/glab",
      runGit: contractRunGit,
      runGlab: contractRunGlab,
    }),
  {
    auth: {
      expectedAuthentication: "authenticated",
      run: (plugin) =>
        plugin.auth.status(
          { projectPath: "/contract", remote: probe.remotes[0] },
          operationContext(),
        ),
    },
    operations: [
      {
        capability: "discovery.listNamespaces",
        run: (plugin) =>
          plugin.discovery.listNamespaces!(
            { limit: 10, query: null },
            operationContext(),
          ),
      },
      {
        capability: "discovery.listRepositories",
        run: (plugin) =>
          plugin.discovery.listRepositories!(
            { limit: 10, namespace: repository.namespace, query: null },
            operationContext(),
          ),
      },
      {
        capability: "changeRequests.get",
        run: (plugin) =>
          plugin.changeRequests!.get!(numbered, operationContext()),
      },
      {
        capability: "changeRequests.getByUrl",
        run: (plugin) =>
          plugin.changeRequests!.getByUrl!(
            { url: mergeRequest.web_url },
            operationContext(),
          ),
      },
      {
        capability: "changeRequests.list",
        run: (plugin) =>
          plugin.changeRequests!.list!(listed, operationContext()),
      },
      {
        capability: "changeRequests.create",
        run: (plugin) =>
          plugin.changeRequests!.create!(
            {
              body: "",
              draft: false,
              repository,
              sourceBranch: "feature",
              targetBranch: "main",
              title: "Ship widgets",
            },
            operationContext(),
          ),
      },
      {
        capability: "changeRequests.comment",
        run: (plugin) =>
          plugin.changeRequests!.comment!(
            { body: "Looks good", ...numbered },
            operationContext(),
          ),
      },
      {
        capability: "changeRequests.status",
        run: (plugin) =>
          plugin.changeRequests!.status!(numbered, operationContext()),
      },
      {
        capability: "changeRequests.preflight",
        run: (plugin) =>
          plugin.changeRequests!.preflight!(
            { repository, sourceBranch: "feature", targetBranch: null },
            operationContext(),
          ),
      },
      {
        capability: "changeRequests.resolveHead",
        run: (plugin) =>
          plugin.changeRequests!.resolveHead!(numbered, operationContext()),
      },
      {
        capability: "workItems.get",
        run: (plugin) =>
          plugin.workItems!.get!({ id: "7", repository }, operationContext()),
      },
      {
        capability: "workItems.getByUrl",
        run: (plugin) =>
          plugin.workItems!.getByUrl!(
            { url: issue.web_url },
            operationContext(),
          ),
      },
      {
        capability: "workItems.list",
        run: (plugin) => plugin.workItems!.list!(listed, operationContext()),
      },
      {
        capability: "branches.publish",
        run: (plugin) =>
          plugin.git.publishBranch!(
            {
              forceWithLease: false,
              localBranch: "feature",
              projectPath: "/contract",
              remoteName: "origin",
              repository,
            },
            operationContext(),
          ),
      },
      {
        capability: "checks.list",
        run: (plugin) => plugin.checks!.list!(numbered, operationContext()),
      },
      {
        capability: "checks.snapshot",
        run: (plugin) => plugin.checks!.snapshot!(numbered, operationContext()),
      },
      {
        capability: "provider.clone",
        run: (plugin) =>
          plugin.git.clone!(
            { repository, targetPath: "/contract/widgets" },
            operationContext(),
          ),
      },
    ],
    probe,
    repository: {
      expected: repository,
      urls: [
        "https://gitlab.com/acme/platform/widgets.git",
        "ssh://git@gitlab.com/acme/platform/widgets.git",
        "git@gitlab.com:acme/platform/widgets.git",
      ],
    },
    selfHosted: {
      expected: {
        ...repository,
        displayPath: "acme/platform/widgets",
        host: "code.acme.internal",
        webUrl: "https://code.acme.internal/acme/platform/widgets",
      },
      probe: {
        ...probe,
        hostMappings: { "code.acme.internal": "gitlab" },
        remotes: [
          {
            fetchUrl: "git@code.acme.internal:acme/platform/widgets.git",
            name: "origin",
            pushUrl: null,
            url: "git@code.acme.internal:acme/platform/widgets.git",
          },
        ],
      },
      url: "git@code.acme.internal:acme/platform/widgets.git",
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
      ["auth", "status", "--hostname", "gitlab.com"],
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        timeoutMs: expect.any(Number),
      }),
    );
    expect(runGlab).toHaveBeenCalledWith(
      [
        "repo",
        "clone",
        "https://gitlab.com/acme/platform/widgets.git",
        "/managed/widgets",
      ],
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        timeoutMs: expect.any(Number),
      }),
    );
    expect(JSON.stringify(runGlab.mock.calls)).not.toMatch(/token|password/i);
  });

  it.each([
    "unauthenticated",
    "clone-failed",
  ] as const)("falls back safely when glab is %s", async (failure) => {
    const runGlab = vi.fn(async (args: readonly string[]) => {
      if (
        (failure === "unauthenticated" && args[0] === "auth") ||
        (failure === "clone-failed" && args[0] === "repo")
      ) {
        throw new Error("glab failed");
      }
      return { stderr: "", stdout: "" };
    });
    const runGit = vi.fn<LocalGitRunner>(async () => ({
      stderr: "",
      stdout: "",
    }));
    const plugin = createGitLabPlugin({
      findGlab: async () => "/usr/bin/glab",
      getToken: async () => "test-token",
      runGit,
      runGlab,
    });

    await plugin.git.clone?.(
      { repository, targetPath: "/managed/widgets" },
      {
        deadline: Date.now() + 10_000,
        signal: new AbortController().signal,
      },
    );

    expect(runGit).toHaveBeenCalledOnce();
    expect(runGit.mock.calls[0]?.[1]).not.toContain("test-token");
    if (failure === "unauthenticated") {
      expect(runGlab).not.toHaveBeenCalledWith(
        expect.arrayContaining(["clone"]),
        expect.anything(),
      );
    }
  });
});
