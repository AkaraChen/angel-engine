import { type } from "arktype";
import { describe, expect, it } from "vitest";

import { capabilityState, repositoryKey } from "./capabilities";
import { sourceControlProjectConfigSchema } from "./config";
import {
  providerActivationSchema,
  repositoryIdentitySchema,
} from "./schemas";

function expectValid(
  schema: { assert(value: unknown): unknown },
  value: unknown,
) {
  expect(() => schema.assert(JSON.parse(JSON.stringify(value)))).not.toThrow();
}

describe("source-control contracts", () => {
  it("preserves arbitrarily deep repository namespaces", () => {
    const identity = {
      providerId: "gitlab",
      host: "gitlab.example.com",
      namespace: ["group", "subgroup", "team", "service"],
      name: "api",
      remoteId: "412",
      displayPath: "group/subgroup/team/service/api",
      webUrl: "https://gitlab.example.com/group/subgroup/team/service/api",
      extensions: {
        gitlab: { pathWithNamespace: "group/subgroup/team/service/api" },
      },
    };

    expectValid(repositoryIdentitySchema, identity);
    expect(repositoryKey(identity)).toBe(
      "gitlab.example.com/group/subgroup/team/service/api",
    );
  });

  it("keeps missing capabilities fail-closed after serialization", () => {
    const activation = {
      generation: 0,
      provider: {
        id: "azure-devops",
        displayName: "Azure DevOps",
        hosts: ["dev.azure.com"],
        capabilities: ["provider.auth", "repositoryIdentity"],
        unsupportedCapabilities: {
          "provider.clone": {
            kind: "requires-configuration",
            message: "Configure credentials before cloning.",
          },
        },
      },
      projectPath: "/workspace/web",
      remote: {
        name: "origin",
        url: "https://dev.azure.com/acme/widgets/_git/web",
      },
      repository: {
        providerId: "azure-devops",
        host: "dev.azure.com",
        namespace: ["acme", "widgets"],
        name: "web",
        remoteId: "d69fe21c",
        displayPath: "acme/widgets/web",
        webUrl: "https://dev.azure.com/acme/widgets/_git/web",
        extensions: {
          azureDevOps: {
            organization: "acme",
            project: "widgets",
            projectId: "a20f2b9f",
          },
        },
      },
      authentication: "authenticated",
      capabilities: {
        entries: { "provider.auth": { supported: true } },
      },
      unavailableReason: null,
      diagnostics: [],
    } as const;

    expectValid(providerActivationSchema, activation);
    expect(capabilityState(activation.capabilities, "provider.clone")).toEqual(
      {
        supported: false,
        reason: {
          kind: "unknown-capability",
          message:
            "Capability provider.clone was not declared by the provider.",
        },
      },
    );
  });



  it("rejects provider-specific fields at neutral model top level", () => {
    const result = repositoryIdentitySchema({
      providerId: "github",
      host: "github.com",
      namespace: ["akarachen"],
      name: "angel-engine",
      remoteId: null,
      displayPath: "akarachen/angel-engine",
      webUrl: null,
      owner: "akarachen",
    });

    expect(result).toBeInstanceOf(type.errors);
  });

  it("rejects credentials in project provider configuration", () => {
    const result = sourceControlProjectConfigSchema({
      provider: {
        providerId: "github",
        remote: "origin",
        token: "must-not-be-stored-here",
      },
    });

    expect(result).toBeInstanceOf(type.errors);
  });
});
