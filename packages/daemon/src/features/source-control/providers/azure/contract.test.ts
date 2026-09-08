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




});
