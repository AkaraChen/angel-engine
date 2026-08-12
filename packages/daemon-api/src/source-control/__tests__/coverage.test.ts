import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { GitHubCheckItem } from "../../github";
import { checkRunSchema, mergeRequirementSchema } from "../schemas";
import type { CheckRun, MergeRequirement } from "../types";
import {
  azurePolicyFixtures,
  gitLabJobFixtures,
  legacyGitHubCheckFixture,
} from "./fixtures";
import { sourceControlOperationSchemas } from "../operations";
import type { SourceControlCapabilityId } from "../types";

const inventoryNamesByCapability = {
  "provider.auth": ["provider.auth"],
  "discovery.listNamespaces": ["discovery.listNamespaces"],
  "discovery.listRepositories": ["discovery.listRepositories"],
  repositoryIdentity: ["repositoryIdentity"],
  "changeRequests.create": ["changeRequests.create"],
  "changeRequests.get": ["changeRequests.get"],
  "changeRequests.getByUrl": ["changeRequests.getByUrl"],
  "changeRequests.list": ["changeRequests.list"],
  "changeRequests.status": ["changeRequests.status"],
  "changeRequests.comment": ["changeRequests.comments.add"],
  "changeRequests.merge": ["changeRequests.merge"],
  "changeRequests.preflight": ["changeRequests.preflight"],
  "changeRequests.resolveHead": ["changeRequests.resolveHead"],
  "checks.list": ["checks.list"],
  "checks.snapshot": ["checks.snapshot"],
  "checks.failureLog": ["checks.failureLog"],
  "checks.fixPrompt": ["checks.buildFixPrompt"],
  "reviewThreads.list": ["changeRequests.reviewThreads.list"],
  "reviewThreads.resolve": ["changeRequests.reviewThreads.resolve"],
  "workItems.get": ["workItems.resolve"],
  "workItems.getByUrl": ["workItems.resolve"],
  "workItems.list": ["workItems.list"],
  "branches.publish": ["branches.publish"],
  "provider.clone": ["provider.clone"],
} as const satisfies Record<SourceControlCapabilityId, readonly string[]>;

describe("source-control operation coverage", () => {
  const inventory = readFileSync(
    resolve(process.cwd(), "../../docs/source-control-plugin-inventory.md"),
    "utf8",
  );

  it("defines exactly one schema pair for every capability id", () => {
    expect(Object.keys(sourceControlOperationSchemas).sort()).toEqual(
      Object.keys(inventoryNamesByCapability).sort(),
    );
  });

  it("maps every capability id to at least one inventory operation", () => {
    for (const [capability, names] of Object.entries(
      inventoryNamesByCapability,
    )) {
      expect(
        names.some((name) => inventory.includes(`\`${name}\``)),
        `inventory mapping for ${capability}`,
      ).toBe(true);
    }
  });

  it("gives every migration-matrix row an operation and destination", () => {
    const matrix = inventory.slice(
      inventory.indexOf("## 4. Migration matrix"),
      inventory.indexOf("## 5. LocalGitBackend boundary decisions"),
    );
    const rows = matrix.split("\n").filter((line) => line.startsWith("| `"));

    expect(rows.length).toBeGreaterThan(80);
    for (const row of rows) {
      expect(row).toMatch(
        /^\| `.+?\|\s+.+?\|\s+(?:migrated|local-git|exception)\s+\|/,
      );
    }
  });
});

const legacyExportCoverage = {
  GitHubItemKind: "WorkItemKind + ChangeRequestState",
  GitHubResolveUrlInput:
    "Stage 3 resolve input; URL remains an adapter boundary",
  GitHubResolvedItem: "WorkItem | ChangeRequest + extensions.github",
  GitHubListItemsInput:
    "Stage 3 list input; cwd/query/limit stay adapter-local",
  GitHubListItem: "WorkItem | ChangeRequest summary",
  GitHubListItemsResult: "WorkItem[] | ChangeRequest[]",
  GitHubCheckBucket: "CheckRunStatus + CheckRunConclusion",
  GitHubPrChecksInput: "RepositoryIdentity + Stage 3 operation context",
  GitHubPrCheck: "CheckRun",
  GitHubPrRef: "ChangeRequest",
  GitHubPullRequestTemplate: "Stage 3 template capability payload",
  GitHubPullRequestTemplateInput: "Stage 3 template operation context",
  GitHubPullRequestTemplateResult: "Stage 3 template capability payload",
  GitHubListPullRequestsInput: "Stage 3 changeRequests.list input",
  GitHubPullRequestListItem: "ChangeRequest",
  GitHubListPullRequestsResult: "ChangeRequest[]",
  GitHubViewPullRequestInput: "RepositoryIdentity + change request id",
  GitHubPullRequestComment: "ReviewComment + extensions.github",
  GitHubPullRequestDetail: "ChangeRequest + ReviewComment[]",
  GitHubCreatePullRequestInput: "Stage 3 changeRequests.create input",
  GitHubCreatePullRequestResult: "ChangeRequest identity and webUrl",
  GitHubAddPullRequestCommentInput: "Stage 3 changeRequests.comment input",
  GitHubAddPullRequestCommentResult: "ReviewComment",
  GitHubCreateWorkspaceFromPullRequestInput:
    "Stage 3 workspace operation input",
  GitHubCreateWorkspaceFromPullRequestResult:
    "ChangeRequest + local workspace result",
  GitHubPrChecksSummary: "CheckSummary",
  GitHubPrChecksResult: "CheckSummary + ChangeRequest",
  GitHubPrChecksFixPromptInput: "Stage 3 checks failure-log operation input",
  GitHubPrChecksFixPromptResult: "CheckSummary + ChangeRequest + prompt",
  GitHubMergeMethod: "MergeMethod",
  GitHubPullRequestStatusInput: "RepositoryIdentity + change request id",
  GitHubPullRequestCheck: "CheckRun",
  GitHubPullRequestReviewThread: "ReviewThread + ReviewComment",
  GitHubPullRequestStatus: "ChangeRequest + CheckSummary + MergeRequirement[]",
  GitHubMergeInput: "MergeMethod + Stage 3 changeRequests.merge input",
  GitHubMergeResult: "ChangeRequestState + webUrl",
  GitHubResolveThreadInput: "ReviewThread id + Stage 3 operation context",
  GitHubResolveThreadResult: "ReviewThreadState",
  githubResolveUrlInputSchema: "Stage 3 provider operation schema",
  githubPrChecksFixPromptInputSchema: "Stage 3 provider operation schema",
  githubPullRequestTemplateInputSchema: "Stage 3 provider operation schema",
  githubListPullRequestsInputSchema: "Stage 3 provider operation schema",
  githubViewPullRequestInputSchema: "Stage 3 provider operation schema",
  githubCreatePullRequestInputSchema: "Stage 3 provider operation schema",
  githubAddPullRequestCommentInputSchema: "Stage 3 provider operation schema",
  githubCreateWorkspaceFromPullRequestInputSchema:
    "Stage 3 provider operation schema",
  GitHubRepositoryOwner: "RepositoryIdentity.namespace + extensions.github",
  GitHubRepositoryOwnerKind: "extensions.github.ownerKind",
  GitHubRepositoryOwnersResult: "RepositoryIdentity.namespace discovery result",
  GitHubListRepositoriesInput: "Stage 3 discovery input",
  GitHubRepository: "RepositoryIdentity + extensions.github",
  GitHubListRepositoriesResult: "RepositoryIdentity[]",
  githubMergeInputSchema: "Stage 3 provider operation schema",
  githubResolveThreadInputSchema: "Stage 3 provider operation schema",
  GitHubPrContextInput: "RepositoryIdentity + change request id",
  GitHubChecksInput: "RepositoryIdentity + change request id",
  GitHubReviewThreadsInput: "RepositoryIdentity + change request id",
  GitHubCheckItem: "CheckRun",
  GitHubChecksSnapshot: "CheckSummary",
  GitHubReviewThreadComment: "ReviewComment",
  GitHubReviewThread: "ReviewThread",
  GitHubReviewThreadsResult: "ReviewThread[]",
  GitHubFailureLogInput: "CheckLogRef + Stage 3 operation context",
  GitHubFailureLogResult: "Stage 3 checks.failureLog payload",
  githubPrContextInputSchema: "Stage 3 provider operation schema",
  githubFailureLogInputSchema: "Stage 3 provider operation schema",
  PullRequestCreateInput: "Retained LocalGitBackend create input",
  PullRequestRecord: "ChangeRequest + local persistence fields",
  PullRequestPreflight: "ChangeRequest + MergeRequirement[] + local git state",
  PullRequestCreateResult: "ChangeRequest + SourceControlErrorDetails",
  pullRequestCreateInputSchema: "Retained LocalGitBackend input schema",
} as const;

function mapLegacyGitHubCheck(item: GitHubCheckItem): CheckRun {
  return {
    id: item.checkRunId ?? `${item.name}:${item.detailsUrl ?? "status"}`,
    group:
      item.workflowRunId === null
        ? null
        : {
            id: item.workflowRunId,
            kind: "workflow-run",
            name: item.workflowName ?? item.name,
            stage: null,
            parentGroupId: null,
            attempt: item.attempt,
            detailsUrl: item.detailsUrl,
          },
    name: item.name,
    status: item.isPending ? "running" : "completed",
    conclusion:
      item.conclusion === "FAILURE"
        ? "failure"
        : item.conclusion === "SUCCESS"
          ? "success"
          : null,
    requiredness: item.isRequired ? "required" : "optional",
    blocking: item.isRequired && item.conclusion === "FAILURE",
    attempt: item.attempt,
    retryOf: null,
    allowFailure: !item.isRequired,
    manual: false,
    startedAt: null,
    completedAt: null,
    detailsUrl: item.detailsUrl,
    logRef:
      item.workflowRunId === null
        ? null
        : { kind: "workflow-run", runId: item.workflowRunId, jobId: null },
    extensions: { github: { checkRunId: item.checkRunId } },
  };
}

function mapGitLabJob(job: (typeof gitLabJobFixtures)[number]): CheckRun {
  return {
    id: String(job.id),
    group: {
      id: String(job.pipelineId),
      kind: "pipeline",
      name: `pipeline ${job.pipelineId}`,
      stage: job.stage,
      parentGroupId: null,
      attempt: 1,
      detailsUrl: null,
    },
    name: job.name,
    status: job.manual ? "waiting-manual" : "completed",
    conclusion: job.status === "failed" ? "failure" : null,
    requiredness: "unknown",
    blocking: !job.allowFailure && job.status === "failed",
    attempt: job.retried ? 2 : 1,
    retryOf: job.retryOf === null ? null : String(job.retryOf),
    allowFailure: job.allowFailure,
    manual: job.manual,
    startedAt: null,
    completedAt: null,
    detailsUrl: null,
    logRef: { kind: "job", jobId: String(job.id) },
    extensions: { gitlab: { pipelineId: job.pipelineId } },
  };
}

function mapAzurePolicy(
  policy: (typeof azurePolicyFixtures)[number],
): MergeRequirement {
  const kinds = {
    Build: "checks",
    "Minimum number of reviewers": "review-approval",
    "Comment requirements": "unresolved-discussions",
    "Work item linking": "linked-work-items",
    "Required merge strategy": "merge-strategy",
  } as const;
  const states = {
    approved: "satisfied",
    rejected: "unsatisfied",
    running: "pending",
    notApplicable: "not-applicable",
    queued: "pending",
  } as const;

  return {
    id: policy.evaluationId,
    kind: kinds[policy.type],
    state: states[policy.status],
    blocking: policy.isBlocking,
    label: policy.displayName,
    detailsUrl: null,
    extensions: {
      azureDevOps: { configurationId: policy.configurationId },
    },
  };
}

describe("legacy GitHub export coverage", () => {
  it("covers every one of the 71 exports and no stale names", () => {
    const githubSource = readFileSync(
      new URL("../../github.ts", import.meta.url),
      "utf8",
    );
    const actualExports = Array.from(
      githubSource.matchAll(
        /^export (?:type|interface|const) ([A-Za-z0-9_]+)/gm,
      ),
      (match) => match[1],
    ).sort();
    const coveredExports = Object.keys(legacyExportCoverage).sort();

    expect(coveredExports).toHaveLength(71);
    expect(coveredExports).toEqual(actualExports);
  });

  it("documents every covered export", () => {
    const document = readFileSync(
      resolve(process.cwd(), "../../docs/source-control-domain-model.md"),
      "utf8",
    ).replaceAll("\\|", "|");
    for (const [legacyExport, destination] of Object.entries(
      legacyExportCoverage,
    )) {
      expect(document).toContain(
        `| \`${legacyExport}\` | \`${destination}\` |`,
      );
    }
  });
});

describe("provider fixture mappings", () => {
  it("maps the legacy GitHub check without losing its provider fields", () => {
    const mapped = mapLegacyGitHubCheck(legacyGitHubCheckFixture);
    expect(() => checkRunSchema.assert(mapped)).not.toThrow();
    expect(mapped.extensions).toEqual({ github: { checkRunId: "501" } });
    expect(mapped.logRef).toEqual({
      kind: "workflow-run",
      runId: "90",
      jobId: null,
    });
  });

  it("preserves GitLab retry, manual, and allow-failure semantics", () => {
    const mapped = gitLabJobFixtures.map(mapGitLabJob);
    for (const check of mapped) {
      expect(() => checkRunSchema.assert(check)).not.toThrow();
    }
    expect(mapped[1]).toMatchObject({
      id: "102",
      retryOf: "91",
      attempt: 2,
      status: "waiting-manual",
      manual: true,
      allowFailure: true,
      blocking: false,
      requiredness: "unknown",
    });
  });

  it("maps all Azure policy classes to merge requirements", () => {
    const mapped = azurePolicyFixtures.map(mapAzurePolicy);
    for (const requirement of mapped) {
      expect(() => mergeRequirementSchema.assert(requirement)).not.toThrow();
    }
    expect(mapped.map(({ kind }) => kind)).toEqual([
      "checks",
      "review-approval",
      "unresolved-discussions",
      "linked-work-items",
      "merge-strategy",
    ]);
  });
});
