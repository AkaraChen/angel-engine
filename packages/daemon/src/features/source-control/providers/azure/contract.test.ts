import type { ProbeContext } from "@angel-engine/daemon-api/source-control";
import { describe, expect, it } from "vitest";

import { runProviderContractSuite } from "../../contract/provider-contract";
import { createAzureDevOpsPlugin, parseAzureRepositoryUrl } from "./plugin";

const repository = {
  displayPath: "acme/widgets/widget-api",
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

runProviderContractSuite(
  () => createAzureDevOpsPlugin({ findAz: async () => null }),
  {
    probe,
    repository: {
      expected: repository,
      urls: [repository.webUrl],
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
});
