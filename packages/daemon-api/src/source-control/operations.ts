import { type as arkType } from "arktype";

import {
  changeRequestSchema,
  checkLogRefSchema,
  checkRunSchema,
  checkSummarySchema,
  mergeRequirementSchema,
  providerDiagnosticSchema,
  repositoryIdentitySchema,
  reviewCommentSchema,
  reviewThreadSchema,
  workItemSchema,
} from "./schemas";
import type {
  ChangeRequest,
  CheckLogRef,
  CheckRun,
  CheckSummary,
  MergeMethod,
  MergeRequirement,
  ProviderAuthenticationState,
  ProviderDiagnostic,
  RepositoryIdentity,
  ReviewComment,
  ReviewThread,
  SourceControlCapabilityId,
  WorkItem,
} from "./types";

export interface ProviderOperationContext {
  signal: AbortSignal;
  deadline: number;
}

export interface RemoteDescriptor {
  name: string;
  url: string;
  fetchUrl: string;
  pushUrl: string | null;
}

export interface ProbeContext {
  projectPath: string;
  remotes: readonly RemoteDescriptor[];
  upstreamRemote: string | null;
  defaultRemote: string | null;
  explicitProviderId: string | null;
  explicitRemote: string | null;
  hostMappings: Readonly<Record<string, string>>;
}

export interface ProviderMatch {
  providerId: string;
  remote: RemoteDescriptor;
  repository: RepositoryIdentity | null;
  score: number;
  source: "explicit" | "upstream" | "default-remote" | "remote";
}

export interface ProviderReadiness {
  authentication: ProviderAuthenticationState;
  diagnostics: readonly ProviderDiagnostic[];
}

export interface RepositoryOperationInput {
  repository: RepositoryIdentity;
}

export interface NumberedItemInput extends RepositoryOperationInput {
  id: string;
}

export interface ListOperationInput extends RepositoryOperationInput {
  query: string | null;
  limit: number;
}

export interface UrlOperationInput {
  url: string;
}

export interface AuthStatusInput {
  projectPath: string;
  remote: RemoteDescriptor;
}

export interface AuthStatusResult extends ProviderReadiness {}

export interface ListNamespacesInput {
  query: string | null;
  limit: number;
}

export interface RepositoryNamespace {
  id: string;
  name: string;
  path: readonly string[];
  avatarUrl: string | null;
}

export interface ListRepositoriesInput {
  namespace: readonly string[] | null;
  query: string | null;
  limit: number;
}

export interface CreateChangeRequestInput extends RepositoryOperationInput {
  title: string;
  body: string;
  sourceBranch: string;
  targetBranch: string;
  draft: boolean;
}

export interface ChangeRequestStatusResult {
  changeRequest: ChangeRequest;
  checks: CheckSummary | null;
}

export interface AddChangeRequestCommentInput extends NumberedItemInput {
  body: string;
}

export interface MergeChangeRequestInput extends NumberedItemInput {
  method: MergeMethod;
}

export interface ChangeRequestPreflightInput extends RepositoryOperationInput {
  sourceBranch: string;
  targetBranch: string | null;
}

export interface ChangeRequestPreflightResult {
  targetBranch: string;
  requirements: readonly MergeRequirement[];
}

export interface ChangeRequestHeadResult {
  changeRequest: ChangeRequest;
  remoteUrl: string;
  ref: string;
}

export interface FailureLogInput extends RepositoryOperationInput {
  logRef: CheckLogRef;
  tailLines: number;
}

export interface FailureLogResult {
  text: string;
  truncated: boolean;
}

export interface ChecksFixPromptInput extends NumberedItemInput {}

export interface ChecksFixPromptResult {
  changeRequest: ChangeRequest;
  checks: CheckSummary;
  prompt: string;
}

export interface ResolveReviewThreadInput extends RepositoryOperationInput {
  threadId: string;
}

export interface PublishBranchInput extends RepositoryOperationInput {
  projectPath: string;
  localBranch: string;
  remoteName: string;
  forceWithLease: boolean;
}

export interface PublishBranchResult {
  remoteName: string;
  remoteRef: string;
}

export interface CloneRepositoryInput extends RepositoryOperationInput {
  targetPath: string;
}

export interface CloneRepositoryResult {
  projectPath: string;
}

export interface SourceControlOperationMap {
  "provider.auth": { input: AuthStatusInput; output: AuthStatusResult };
  "discovery.listNamespaces": {
    input: ListNamespacesInput;
    output: readonly RepositoryNamespace[];
  };
  "discovery.listRepositories": {
    input: ListRepositoriesInput;
    output: readonly RepositoryIdentity[];
  };
  repositoryIdentity: {
    input: UrlOperationInput;
    output: RepositoryIdentity | null;
  };
  "changeRequests.create": {
    input: CreateChangeRequestInput;
    output: ChangeRequest;
  };
  "changeRequests.get": { input: NumberedItemInput; output: ChangeRequest };
  "changeRequests.getByUrl": {
    input: UrlOperationInput;
    output: ChangeRequest;
  };
  "changeRequests.list": {
    input: ListOperationInput;
    output: readonly ChangeRequest[];
  };
  "changeRequests.status": {
    input: NumberedItemInput;
    output: ChangeRequestStatusResult;
  };
  "changeRequests.comment": {
    input: AddChangeRequestCommentInput;
    output: ReviewComment;
  };
  "changeRequests.merge": {
    input: MergeChangeRequestInput;
    output: ChangeRequest;
  };
  "changeRequests.preflight": {
    input: ChangeRequestPreflightInput;
    output: ChangeRequestPreflightResult;
  };
  "changeRequests.resolveHead": {
    input: NumberedItemInput;
    output: ChangeRequestHeadResult;
  };
  "checks.list": { input: NumberedItemInput; output: readonly CheckRun[] };
  "checks.snapshot": { input: NumberedItemInput; output: CheckSummary };
  "checks.failureLog": { input: FailureLogInput; output: FailureLogResult };
  "checks.fixPrompt": {
    input: ChecksFixPromptInput;
    output: ChecksFixPromptResult;
  };
  "reviewThreads.list": {
    input: NumberedItemInput;
    output: readonly ReviewThread[];
  };
  "reviewThreads.resolve": {
    input: ResolveReviewThreadInput;
    output: ReviewThread;
  };
  "workItems.get": { input: NumberedItemInput; output: WorkItem };
  "workItems.getByUrl": { input: UrlOperationInput; output: WorkItem };
  "workItems.list": { input: ListOperationInput; output: readonly WorkItem[] };
  "branches.publish": {
    input: PublishBranchInput;
    output: PublishBranchResult;
  };
  "provider.clone": {
    input: CloneRepositoryInput;
    output: CloneRepositoryResult;
  };
}

export type ProviderOperation<Id extends SourceControlCapabilityId> = (
  input: SourceControlOperationMap[Id]["input"],
  context: ProviderOperationContext,
) => Promise<SourceControlOperationMap[Id]["output"]>;

const remoteDescriptorSchema = arkType({
  "+": "reject",
  name: "string > 0",
  url: "string > 0",
  fetchUrl: "string > 0",
  pushUrl: "string | null",
});
const numberedItemInputSchema = arkType({
  "+": "reject",
  repository: repositoryIdentitySchema,
  id: "string > 0",
});
const listInputSchema = arkType({
  "+": "reject",
  repository: repositoryIdentitySchema,
  query: "string | null",
  limit: "number.integer >= 1",
});
const urlInputSchema = arkType({ "+": "reject", url: "string > 0" });
const emptyDiagnosticsResultSchema = arkType({
  "+": "reject",
  authentication:
    "'authenticated' | 'unauthenticated' | 'unavailable' | 'unknown'",
  diagnostics: providerDiagnosticSchema.array(),
});

export const sourceControlOperationSchemas = {
  "provider.auth": {
    input: arkType({
      "+": "reject",
      projectPath: "string > 0",
      remote: remoteDescriptorSchema,
    }),
    output: emptyDiagnosticsResultSchema,
  },
  "discovery.listNamespaces": {
    input: arkType({
      "+": "reject",
      query: "string | null",
      limit: "number.integer >= 1",
    }),
    output: arkType({
      "+": "reject",
      id: "string > 0",
      name: "string > 0",
      path: "string[]",
      avatarUrl: "string | null",
    }).array(),
  },
  "discovery.listRepositories": {
    input: arkType({
      "+": "reject",
      namespace: "string[] | null",
      query: "string | null",
      limit: "number.integer >= 1",
    }),
    output: repositoryIdentitySchema.array(),
  },
  repositoryIdentity: {
    input: urlInputSchema,
    output: repositoryIdentitySchema.or("null"),
  },
  "changeRequests.create": {
    input: arkType({
      "+": "reject",
      repository: repositoryIdentitySchema,
      title: "string > 0",
      body: "string",
      sourceBranch: "string > 0",
      targetBranch: "string > 0",
      draft: "boolean",
    }),
    output: changeRequestSchema,
  },
  "changeRequests.get": {
    input: numberedItemInputSchema,
    output: changeRequestSchema,
  },
  "changeRequests.getByUrl": {
    input: urlInputSchema,
    output: changeRequestSchema,
  },
  "changeRequests.list": {
    input: listInputSchema,
    output: changeRequestSchema.array(),
  },
  "changeRequests.status": {
    input: numberedItemInputSchema,
    output: arkType({
      "+": "reject",
      changeRequest: changeRequestSchema,
      checks: checkSummarySchema.or("null"),
    }),
  },
  "changeRequests.comment": {
    input: arkType({
      "+": "reject",
      repository: repositoryIdentitySchema,
      id: "string > 0",
      body: "string > 0",
    }),
    output: reviewCommentSchema,
  },
  "changeRequests.merge": {
    input: arkType({
      "+": "reject",
      repository: repositoryIdentitySchema,
      id: "string > 0",
      method: "'merge' | 'rebase' | 'squash'",
    }),
    output: changeRequestSchema,
  },
  "changeRequests.preflight": {
    input: arkType({
      "+": "reject",
      repository: repositoryIdentitySchema,
      sourceBranch: "string > 0",
      targetBranch: "string | null",
    }),
    output: arkType({
      "+": "reject",
      targetBranch: "string > 0",
      requirements: mergeRequirementSchema.array(),
    }),
  },
  "changeRequests.resolveHead": {
    input: numberedItemInputSchema,
    output: arkType({
      "+": "reject",
      changeRequest: changeRequestSchema,
      remoteUrl: "string > 0",
      ref: "string > 0",
    }),
  },
  "checks.list": {
    input: numberedItemInputSchema,
    output: checkRunSchema.array(),
  },
  "checks.snapshot": {
    input: numberedItemInputSchema,
    output: checkSummarySchema,
  },
  "checks.failureLog": {
    input: arkType({
      "+": "reject",
      repository: repositoryIdentitySchema,
      logRef: checkLogRefSchema,
      tailLines: "number.integer >= 1",
    }),
    output: arkType({ "+": "reject", text: "string", truncated: "boolean" }),
  },
  "checks.fixPrompt": {
    input: numberedItemInputSchema,
    output: arkType({
      "+": "reject",
      changeRequest: changeRequestSchema,
      checks: checkSummarySchema,
      prompt: "string > 0",
    }),
  },
  "reviewThreads.list": {
    input: numberedItemInputSchema,
    output: reviewThreadSchema.array(),
  },
  "reviewThreads.resolve": {
    input: arkType({
      "+": "reject",
      repository: repositoryIdentitySchema,
      threadId: "string > 0",
    }),
    output: reviewThreadSchema,
  },
  "workItems.get": { input: numberedItemInputSchema, output: workItemSchema },
  "workItems.getByUrl": { input: urlInputSchema, output: workItemSchema },
  "workItems.list": { input: listInputSchema, output: workItemSchema.array() },
  "branches.publish": {
    input: arkType({
      "+": "reject",
      repository: repositoryIdentitySchema,
      projectPath: "string > 0",
      localBranch: "string > 0",
      remoteName: "string > 0",
      forceWithLease: "boolean",
    }),
    output: arkType({
      "+": "reject",
      remoteName: "string > 0",
      remoteRef: "string > 0",
    }),
  },
  "provider.clone": {
    input: arkType({
      "+": "reject",
      repository: repositoryIdentitySchema,
      targetPath: "string > 0",
    }),
    output: arkType({ "+": "reject", projectPath: "string > 0" }),
  },
} as const satisfies Record<
  SourceControlCapabilityId,
  {
    input: { assert(value: unknown): unknown };
    output: { assert(value: unknown): unknown };
  }
>;
