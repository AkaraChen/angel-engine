import { type as arkType } from "arktype";

const extensionsSchema = arkType({ "[string]": "unknown" });

export const repositoryIdentitySchema = arkType({
  "+": "reject",
  providerId: "string > 0",
  host: "string > 0",
  namespace: "string[]",
  name: "string > 0",
  remoteId: "string | null",
  displayPath: "string > 0",
  webUrl: "string | null",
  "extensions?": extensionsSchema,
});

export const sourceControlActorSchema = arkType({
  "+": "reject",
  id: "string | null",
  login: "string > 0",
  displayName: "string | null",
  avatarUrl: "string | null",
  webUrl: "string | null",
  "extensions?": extensionsSchema,
});

export const mergeRequirementSchema = arkType({
  "+": "reject",
  id: "string > 0",
  kind: "'checks' | 'review-approval' | 'unresolved-discussions' | 'linked-work-items' | 'branch-up-to-date' | 'conflict' | 'draft' | 'merge-strategy' | 'other'",
  state: "'satisfied' | 'unsatisfied' | 'pending' | 'not-applicable'",
  blocking: "boolean",
  label: "string > 0",
  detailsUrl: "string | null",
  "extensions?": extensionsSchema,
});

export const changeRequestRefSchema = arkType({
  "+": "reject",
  name: "string > 0",
  oid: "string | null",
  repository: repositoryIdentitySchema,
});

export const changeRequestSchema = arkType({
  "+": "reject",
  id: "string > 0",
  number: "number | null",
  repository: repositoryIdentitySchema,
  title: "string > 0",
  body: "string",
  author: sourceControlActorSchema.or("null"),
  state: "'open' | 'closed' | 'merged'",
  draft: "boolean",
  source: changeRequestRefSchema,
  target: changeRequestRefSchema,
  webUrl: "string > 0",
  createdAt: "string | null",
  updatedAt: "string | null",
  mergedAt: "string | null",
  additions: "number | null",
  deletions: "number | null",
  changedFiles: "number | null",
  commitCount: "number | null",
  reviewDecision:
    "'approved' | 'changes-requested' | 'review-required' | 'none'",
  mergeRequirements: mergeRequirementSchema.array(),
  allowedMergeMethods: "('merge' | 'rebase' | 'squash')[]",
  defaultMergeMethod: "'merge' | 'rebase' | 'squash' | null",
  viewerCanMerge: "boolean | null",
  "extensions?": extensionsSchema,
});

export const workItemSchema = arkType({
  "+": "reject",
  id: "string > 0",
  number: "number | null",
  repository: repositoryIdentitySchema,
  kind: "'issue' | 'task' | 'bug' | 'feature' | 'other'",
  title: "string > 0",
  body: "string",
  state: "'open' | 'closed'",
  author: sourceControlActorSchema.or("null"),
  assignees: sourceControlActorSchema.array(),
  labels: "string[]",
  webUrl: "string > 0",
  createdAt: "string | null",
  updatedAt: "string | null",
  closedAt: "string | null",
  "extensions?": extensionsSchema,
});

export const checkGroupSchema = arkType({
  "+": "reject",
  id: "string > 0",
  kind: "'workflow-run' | 'pipeline' | 'policy-set'",
  name: "string > 0",
  stage: "string | null",
  parentGroupId: "string | null",
  attempt: "number.integer >= 1",
  detailsUrl: "string | null",
  "extensions?": extensionsSchema,
});

const workflowRunLogRefSchema = arkType({
  "+": "reject",
  kind: "'workflow-run'",
  runId: "string > 0",
  jobId: "string | null",
});
const jobLogRefSchema = arkType({
  "+": "reject",
  kind: "'job'",
  jobId: "string > 0",
});
export const checkLogRefSchema = workflowRunLogRefSchema.or(jobLogRefSchema);

export const checkRunSchema = arkType({
  "+": "reject",
  id: "string > 0",
  group: checkGroupSchema.or("null"),
  name: "string > 0",
  status:
    "'queued' | 'running' | 'completed' | 'skipped' | 'canceled' | 'waiting-manual'",
  conclusion:
    "'success' | 'failure' | 'neutral' | 'canceled' | 'timed-out' | 'action-required' | 'skipped' | null",
  requiredness: "'required' | 'optional' | 'unknown'",
  blocking: "boolean",
  attempt: "number.integer >= 1",
  retryOf: "string | null",
  allowFailure: "boolean",
  manual: "boolean",
  startedAt: "string | null",
  completedAt: "string | null",
  detailsUrl: "string | null",
  logRef: checkLogRefSchema.or("null"),
  "extensions?": extensionsSchema,
});

export const checkSummarySchema = arkType({
  "+": "reject",
  checks: checkRunSchema.array(),
  headOid: "string | null",
  hasPending: "boolean",
  requiredAllGreen: "boolean",
  failedBlocking: checkRunSchema.array(),
  failed: checkRunSchema.array(),
});

export const reviewLocationSchema = arkType({
  "+": "reject",
  path: "string > 0",
  side: "'left' | 'right'",
  startLine: "number | null",
  endLine: "number | null",
});

export const reviewCommentSchema = arkType({
  "+": "reject",
  id: "string > 0",
  author: sourceControlActorSchema.or("null"),
  body: "string",
  createdAt: "string > 0",
  updatedAt: "string | null",
  webUrl: "string | null",
  "extensions?": extensionsSchema,
});

export const reviewThreadSchema = arkType({
  "+": "reject",
  id: "string > 0",
  state: "'unresolved' | 'resolved' | 'outdated' | 'not-resolvable'",
  resolvable: "boolean",
  location: reviewLocationSchema.or("null"),
  comments: reviewCommentSchema.array(),
  "extensions?": extensionsSchema,
});

export const unsupportedReasonSchema = arkType({
  "+": "reject",
  kind: "'not-implemented' | 'out-of-scope' | 'requires-configuration' | 'unauthenticated' | 'cli-missing' | 'permission-denied' | 'plan-restricted' | 'unknown-capability'",
  message: "string > 0",
  "docsUrl?": "string",
});

const supportedCapabilitySchema = arkType({
  "+": "reject",
  supported: "true",
});
const unsupportedCapabilitySchema = arkType({
  "+": "reject",
  supported: "false",
  reason: unsupportedReasonSchema,
});
export const capabilityStateSchema = supportedCapabilitySchema.or(
  unsupportedCapabilitySchema,
);

export const capabilityMatrixSchema = arkType({
  "+": "reject",
  entries: { "[string]": capabilityStateSchema },
});

const capabilityIdSchema = arkType(
  "'provider.auth' | 'discovery.listNamespaces' | 'discovery.listRepositories' | 'repositoryIdentity' | 'changeRequests.create' | 'changeRequests.get' | 'changeRequests.getByUrl' | 'changeRequests.list' | 'changeRequests.status' | 'changeRequests.comment' | 'changeRequests.merge' | 'changeRequests.preflight' | 'changeRequests.resolveHead' | 'checks.list' | 'checks.snapshot' | 'checks.failureLog' | 'checks.fixPrompt' | 'reviewThreads.list' | 'reviewThreads.resolve' | 'workItems.get' | 'workItems.getByUrl' | 'workItems.list' | 'branches.publish' | 'provider.clone'",
);

export const providerManifestSchema = arkType({
  "+": "reject",
  id: "string > 0",
  displayName: "string > 0",
  hosts: "string[]",
  capabilities: capabilityIdSchema.array(),
  "unsupportedCapabilities?": { "[string]": unsupportedReasonSchema },
  "extensions?": extensionsSchema,
});

export const providerDiagnosticSchema = arkType({
  "+": "reject",
  code: "string > 0",
  message: "string > 0",
  severity: "'info' | 'warning' | 'error'",
  "extensions?": extensionsSchema,
});

export const providerActivationSchema = arkType({
  "+": "reject",
  generation: "number.integer >= 0",
  provider: providerManifestSchema,
  projectPath: "string > 0",
  remote: {
    "+": "reject",
    name: "string > 0",
    url: "string > 0",
  },
  repository: repositoryIdentitySchema.or("null"),
  authentication:
    "'authenticated' | 'unauthenticated' | 'unavailable' | 'unknown'",
  capabilities: capabilityMatrixSchema,
  unavailableReason: unsupportedReasonSchema.or("null"),
  diagnostics: providerDiagnosticSchema.array(),
});

export const sourceControlErrorDetailsSchema = arkType({
  "+": "reject",
  providerId: "string > 0",
  operation: "string > 0",
  retryable: "boolean",
  "providerCode?": "string",
  "providerMessage?": "string",
});

export const eventFingerprintSchema = arkType({
  "+": "reject",
  kind: "'check' | 'review-comment'",
  value: "string > 0",
});
