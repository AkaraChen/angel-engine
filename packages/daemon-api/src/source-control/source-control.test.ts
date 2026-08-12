import { type } from "arktype";
import { describe, expect, it } from "vitest";

import { capabilityState, repositoryKey } from "./capabilities";
import { sourceControlProjectConfigSchema } from "./config";
import {
  changeRequestSchema,
  checkRunSchema,
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
    expect(capabilityState(activation.capabilities, "checks.snapshot")).toEqual(
      {
        supported: false,
        reason: {
          kind: "unknown-capability",
          message:
            "Capability checks.snapshot was not declared by the provider.",
        },
      },
    );
  });

  it("represents GitLab retry, manual, and allow-failure jobs", () => {
    const retriedJob = {
      id: "job-102",
      group: {
        id: "pipeline-7",
        kind: "pipeline",
        name: "merge request pipeline",
        stage: "deploy",
        parentGroupId: null,
        attempt: 1,
        detailsUrl: "https://gitlab.example.com/pipelines/7",
      },
      name: "deploy preview",
      status: "waiting-manual",
      conclusion: null,
      requiredness: "unknown",
      blocking: false,
      attempt: 2,
      retryOf: "job-91",
      allowFailure: true,
      manual: true,
      startedAt: null,
      completedAt: null,
      detailsUrl: "https://gitlab.example.com/jobs/102",
      logRef: { kind: "job", jobId: "102" },
      extensions: { gitlab: { pipelineId: 7 } },
    };

    expectValid(checkRunSchema, retriedJob);
  });

  it("keeps Azure policies as merge requirements, not check runs", () => {
    const repository = {
      providerId: "azure-devops",
      host: "dev.azure.com",
      namespace: ["acme", "widgets"],
      name: "web",
      remoteId: "repo-guid",
      displayPath: "acme/widgets/web",
      webUrl: "https://dev.azure.com/acme/widgets/_git/web",
    };
    const changeRequest = {
      id: "42",
      number: 42,
      repository,
      title: "Ship widget",
      body: "",
      author: null,
      state: "open",
      draft: false,
      source: { name: "feature/widget", oid: "abc", repository },
      target: { name: "main", oid: "def", repository },
      webUrl: "https://dev.azure.com/acme/widgets/_git/web/pullrequest/42",
      createdAt: null,
      updatedAt: null,
      mergedAt: null,
      additions: null,
      deletions: null,
      changedFiles: null,
      commitCount: null,
      reviewDecision: "review-required",
      mergeRequirements: [
        {
          id: "policy-17",
          kind: "linked-work-items",
          state: "unsatisfied",
          blocking: true,
          label: "Linked work items",
          detailsUrl: null,
          extensions: { azureDevOps: { configurationId: 17 } },
        },
      ],
      allowedMergeMethods: ["squash"],
      defaultMergeMethod: "squash",
      viewerCanMerge: true,
    };

    expectValid(changeRequestSchema, changeRequest);
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
