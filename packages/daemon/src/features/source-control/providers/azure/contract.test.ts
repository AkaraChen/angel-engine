import type { ProbeContext } from "@angel-engine/daemon-api/source-control";
import { describe, expect, it, vi } from "vitest";

import { runProviderContractSuite } from "../../contract/provider-contract";
import { createAzureDevOpsPlugin, parseAzureRepositoryUrl } from "./plugin";

const repository = {
  displayPath: "acme/widgets/widget-api",
  extensions: { azure: { orgUrl: "https://dev.azure.com/acme" } },
  host: "dev.azure.com",
  name: "widget-api",
  namespace: ["acme", "widgets"],
  providerId: "azure-devops",
  remoteId: null,
  webUrl: "https://dev.azure.com/acme/widgets/_git/widget-api",
} as const;
const probe: ProbeContext = {
  defaultRemote: "origin",
  explicitProviderId: null,
  explicitRemote: null,
  hostMappings: {},
  projectPath: "/contract",
  remotes: [
    {
      fetchUrl: repository.webUrl,
      name: "origin",
      pushUrl: null,
      url: repository.webUrl,
    },
  ],
  upstreamRemote: null,
};

const contractPullRequest = {
  creationDate: "2026-08-13T00:00:00Z",
  createdBy: { displayName: "Ada", id: "user-1", uniqueName: "ada" },
  description: null,
  pullRequestId: 42,
  repository: { id: "repo-1", name: "widget-api" },
  sourceRefName: "refs/heads/feature",
  status: "active",
  targetRefName: "refs/heads/main",
  title: "Ship widgets",
};
const contractRunAz = async (args: readonly string[]) => {
  let payload: unknown = {};
  if (args.includes("project") && args.includes("list")) {
    payload = { value: [{ id: "project-1", name: "widgets" }] };
  } else if (args[0] === "repos" && args[1] === "list") {
    payload = [
      {
        id: "repo-1",
        name: "widget-api",
        project: { id: "project-1", name: "widgets" },
        webUrl: repository.webUrl,
      },
    ];
  } else if (args.includes("policy")) {
    payload = [
      {
        id: 1,
        isBlocking: true,
        isEnabled: true,
        type: { displayName: "Build validation", id: "build" },
      },
    ];
  } else if (args.includes("pr") && args.includes("list")) {
    payload = [contractPullRequest];
  } else if (args.includes("pr") && args.includes("show")) {
    payload = contractPullRequest;
  }
  return { stderr: "", stdout: JSON.stringify(payload) };
};
const operationContext = () => ({
  deadline: Date.now() + 10_000,
  signal: new AbortController().signal,
});

runProviderContractSuite(
  () =>
    createAzureDevOpsPlugin({
      findAz: async () => "/usr/bin/az",
      runAz: contractRunAz,
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
            { limit: 10, namespace: ["acme", "widgets"], query: null },
            operationContext(),
          ),
      },
      {
        capability: "changeRequests.list",
        run: (plugin) =>
          plugin.changeRequests!.list!(
            { limit: 10, query: null, repository },
            operationContext(),
          ),
      },
      {
        capability: "changeRequests.get",
        run: (plugin) =>
          plugin.changeRequests!.get!(
            { id: "42", repository },
            operationContext(),
          ),
      },
    ],
    probe,
    repository: {
      expected: repository,
      urls: [repository.webUrl],
    },
    selfHosted: {
      expected: {
        displayPath: "DefaultCollection/Widgets/widget-api",
        extensions: {
          azure: {
            orgUrl: "https://ado.acme.internal/tfs/DefaultCollection",
          },
        },
        host: "ado.acme.internal",
        name: "widget-api",
        namespace: ["DefaultCollection", "Widgets"],
        providerId: "azure-devops",
        remoteId: null,
        webUrl:
          "https://ado.acme.internal/tfs/DefaultCollection/Widgets/_git/widget-api",
      },
      probe: {
        ...probe,
        hostMappings: { "ado.acme.internal": "azure-devops" },
        remotes: [
          {
            fetchUrl:
              "https://ado.acme.internal/tfs/DefaultCollection/Widgets/_git/widget-api",
            name: "origin",
            pushUrl: null,
            url: "https://ado.acme.internal/tfs/DefaultCollection/Widgets/_git/widget-api",
          },
        ],
      },
      url: "https://ado.acme.internal/tfs/DefaultCollection/Widgets/_git/widget-api",
    },
  },
);

describe("Azure DevOps minimum adapter", () => {
  it("normalizes the organization/project/repository identity", () => {
    expect(
      parseAzureRepositoryUrl(
        "ssh://git@ssh.dev.azure.com/v3/acme/widgets/widget-api",
      ),
    ).toEqual(repository);
    expect(repository.namespace).toHaveLength(2);
  });

  it("declares only discovery, auth, identity and PR list/get", () => {
    expect(createAzureDevOpsPlugin().manifest.capabilities).toEqual([
      "provider.auth",
      "discovery.listNamespaces",
      "discovery.listRepositories",
      "repositoryIdentity",
      "changeRequests.list",
      "changeRequests.get",
    ]);
  });

  it("maps real Azure policy payloads with blocking and optional semantics", async () => {
    const policies = [
      {
        id: 1,
        isBlocking: true,
        isEnabled: true,
        type: { displayName: "Build validation", id: "build" },
      },
      {
        id: 2,
        isBlocking: false,
        isEnabled: true,
        type: { displayName: "Optional reviewers", id: "reviewers" },
      },
    ];
    const runAz = vi.fn(async (args: readonly string[]) => ({
      stderr: "",
      stdout: JSON.stringify(
        args.includes("policy") ? policies : contractPullRequest,
      ),
    }));
    const plugin = createAzureDevOpsPlugin({ runAz });

    const result = await plugin.changeRequests?.get?.(
      { id: "42", repository },
      { deadline: Date.now() + 10_000, signal: new AbortController().signal },
    );

    expect(result?.mergeRequirements).toEqual([
      expect.objectContaining({ blocking: true, kind: "checks" }),
      expect.objectContaining({ blocking: false, kind: "review-approval" }),
    ]);
    expect(runAz).toHaveBeenCalledWith(
      expect.arrayContaining(["--organization", "https://dev.azure.com/acme"]),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("preserves a mapped Azure DevOps Server org URL and fails hosted operations closed", async () => {
    const serverUrl =
      "https://ado.acme.internal/tfs/DefaultCollection/Widgets/_git/widget-api";
    const serverRepository = parseAzureRepositoryUrl(
      serverUrl,
      "ado.acme.internal",
    );
    expect(serverRepository).toMatchObject({
      extensions: {
        azure: {
          orgUrl: "https://ado.acme.internal/tfs/DefaultCollection",
        },
      },
      host: "ado.acme.internal",
      namespace: ["DefaultCollection", "Widgets"],
      webUrl: serverUrl,
    });

    const runAz = vi.fn(async () => ({ stderr: "", stdout: "[]" }));
    const plugin = createAzureDevOpsPlugin({
      findAz: async () => "/usr/bin/az",
      runAz,
    });
    const remote = {
      fetchUrl: serverUrl,
      name: "origin",
      pushUrl: null,
      url: serverUrl,
    };
    const match = plugin.discovery.match({
      ...probe,
      hostMappings: { "ado.acme.internal": "azure-devops" },
      remotes: [remote],
    });
    expect(match).toMatchObject({ repository: serverRepository });
    await expect(
      plugin.discovery.checkReadiness(
        Array.isArray(match) ? match[0] : match!,
        {
          deadline: Date.now() + 10_000,
          signal: new AbortController().signal,
        },
      ),
    ).resolves.toMatchObject({
      authentication: "unavailable",
      diagnostics: [{ code: "source-control/requires-configuration" }],
    });
    await expect(
      plugin.changeRequests?.list?.(
        { limit: 10, query: null, repository: serverRepository! },
        {
          deadline: Date.now() + 10_000,
          signal: new AbortController().signal,
        },
      ),
    ).rejects.toMatchObject({ code: "source-control/capability-unsupported" });
    await expect(
      plugin.changeRequests?.get?.(
        { id: "42", repository: serverRepository! },
        {
          deadline: Date.now() + 10_000,
          signal: new AbortController().signal,
        },
      ),
    ).rejects.toMatchObject({ code: "source-control/capability-unsupported" });
    expect(runAz).not.toHaveBeenCalled();
  });
});
