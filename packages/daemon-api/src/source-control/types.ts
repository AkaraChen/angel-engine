export type SourceControlExtensions = Record<string, unknown>;

export interface RepositoryIdentity {
  providerId: string;
  host: string;
  /** Ordered path segments above the repository. GitLab namespaces may be arbitrarily deep. */
  namespace: readonly string[];
  name: string;
  remoteId: string | null;
  displayPath: string;
  webUrl: string | null;
  extensions?: SourceControlExtensions;
}

export interface SourceControlActor {
  id: string | null;
  login: string;
  displayName: string | null;
  avatarUrl: string | null;
  webUrl: string | null;
  extensions?: SourceControlExtensions;
}

export type ChangeRequestState = "open" | "closed" | "merged";
export type MergeMethod = "merge" | "rebase" | "squash";

export interface ChangeRequestRef {
  name: string;
  oid: string | null;
  repository: RepositoryIdentity;
}

export interface ChangeRequest {
  id: string;
  number: number | null;
  repository: RepositoryIdentity;
  title: string;
  body: string;
  author: SourceControlActor | null;
  state: ChangeRequestState;
  draft: boolean;
  source: ChangeRequestRef;
  target: ChangeRequestRef;
  webUrl: string;
  createdAt: string | null;
  updatedAt: string | null;
  mergedAt: string | null;
  additions: number | null;
  deletions: number | null;
  changedFiles: number | null;
  commitCount: number | null;
  reviewDecision: ReviewDecision;
  mergeRequirements: readonly MergeRequirement[];
  allowedMergeMethods: readonly MergeMethod[];
  defaultMergeMethod: MergeMethod | null;
  viewerCanMerge: boolean | null;
  extensions?: SourceControlExtensions;
}

export type WorkItemKind = "issue" | "task" | "bug" | "feature" | "other";

export interface WorkItem {
  id: string;
  number: number | null;
  repository: RepositoryIdentity;
  kind: WorkItemKind;
  title: string;
  body: string;
  state: "open" | "closed";
  author: SourceControlActor | null;
  assignees: readonly SourceControlActor[];
  labels: readonly string[];
  webUrl: string;
  createdAt: string | null;
  updatedAt: string | null;
  closedAt: string | null;
  extensions?: SourceControlExtensions;
}

/** Provider-neutral result returned by the source-control link resolver. */
export type ResolvedSourceControlLink = ChangeRequest | WorkItem;

export type CheckGroupKind = "workflow-run" | "pipeline" | "policy-set";

export interface CheckGroup {
  id: string;
  kind: CheckGroupKind;
  name: string;
  stage: string | null;
  parentGroupId: string | null;
  attempt: number;
  detailsUrl: string | null;
  extensions?: SourceControlExtensions;
}

export type CheckRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "skipped"
  | "canceled"
  | "waiting-manual";

export type CheckRunConclusion =
  | "success"
  | "failure"
  | "neutral"
  | "canceled"
  | "timed-out"
  | "action-required"
  | "skipped";

export type CheckRequiredness = "required" | "optional" | "unknown";

export type CheckLogRef =
  | { kind: "workflow-run"; runId: string; jobId: string | null }
  | { kind: "job"; jobId: string };

export interface CheckRun {
  id: string;
  group: CheckGroup | null;
  name: string;
  status: CheckRunStatus;
  conclusion: CheckRunConclusion | null;
  requiredness: CheckRequiredness;
  /** Provider-computed merge impact. Consumers must not infer this from requiredness. */
  blocking: boolean;
  attempt: number;
  retryOf: string | null;
  allowFailure: boolean;
  manual: boolean;
  startedAt: string | null;
  completedAt: string | null;
  detailsUrl: string | null;
  logRef: CheckLogRef | null;
  extensions?: SourceControlExtensions;
}

export interface CheckSummary {
  checks: readonly CheckRun[];
  headOid: string | null;
  hasPending: boolean;
  /** Provider-computed result based on blocking semantics. */
  requiredAllGreen: boolean;
  failedBlocking: readonly CheckRun[];
  failed: readonly CheckRun[];
}

export interface ReviewLocation {
  path: string;
  side: "left" | "right";
  startLine: number | null;
  endLine: number | null;
}

export interface ReviewComment {
  id: string;
  author: SourceControlActor | null;
  body: string;
  createdAt: string;
  updatedAt: string | null;
  webUrl: string | null;
  extensions?: SourceControlExtensions;
}

export type ReviewThreadState =
  | "unresolved"
  | "resolved"
  | "outdated"
  | "not-resolvable";

export interface ReviewThread {
  id: string;
  state: ReviewThreadState;
  resolvable: boolean;
  location: ReviewLocation | null;
  comments: readonly ReviewComment[];
  extensions?: SourceControlExtensions;
}

export type ReviewDecision =
  | "approved"
  | "changes-requested"
  | "review-required"
  | "none";

export type MergeRequirementKind =
  | "checks"
  | "review-approval"
  | "unresolved-discussions"
  | "linked-work-items"
  | "branch-up-to-date"
  | "conflict"
  | "draft"
  | "merge-strategy"
  | "other";

export interface MergeRequirement {
  id: string;
  kind: MergeRequirementKind;
  state: "satisfied" | "unsatisfied" | "pending" | "not-applicable";
  blocking: boolean;
  label: string;
  detailsUrl: string | null;
  extensions?: SourceControlExtensions;
}

export type SourceControlCapabilityId =
  | "provider.auth"
  | "discovery.listNamespaces"
  | "discovery.listRepositories"
  | "repositoryIdentity"
  | "changeRequests.create"
  | "changeRequests.get"
  | "changeRequests.getByUrl"
  | "changeRequests.list"
  | "changeRequests.status"
  | "changeRequests.comment"
  | "changeRequests.merge"
  | "changeRequests.preflight"
  | "changeRequests.resolveHead"
  | "checks.list"
  | "checks.snapshot"
  | "checks.failureLog"
  | "checks.fixPrompt"
  | "reviewThreads.list"
  | "reviewThreads.resolve"
  | "workItems.get"
  | "workItems.getByUrl"
  | "workItems.list"
  | "branches.publish"
  | "provider.clone";

export type UnsupportedReasonKind =
  | "not-implemented"
  | "out-of-scope"
  | "requires-configuration"
  | "unauthenticated"
  | "cli-missing"
  | "permission-denied"
  | "plan-restricted"
  | "unknown-capability";

export interface UnsupportedReason {
  kind: UnsupportedReasonKind;
  message: string;
  docsUrl?: string;
}

export type CapabilityState =
  | { supported: true }
  | { supported: false; reason: UnsupportedReason };

export interface CapabilityMatrix {
  /** Missing entries are intentionally unsupported (fail closed). */
  entries: Partial<Record<SourceControlCapabilityId, CapabilityState>>;
}

export interface ProviderManifest {
  id: string;
  displayName: string;
  hosts: readonly string[];
  capabilities: readonly SourceControlCapabilityId[];
  /** Optional explicit reasons for intentionally unsupported capabilities. */
  unsupportedCapabilities?: Partial<
    Record<SourceControlCapabilityId, UnsupportedReason>
  >;
  extensions?: SourceControlExtensions;
}

export type ProviderAuthenticationState =
  | "authenticated"
  | "unauthenticated"
  | "unavailable"
  | "unknown";

export interface ProviderDiagnostic {
  code: string;
  message: string;
  severity: "info" | "warning" | "error";
  extensions?: SourceControlExtensions;
}

export interface ProviderActivation {
  generation: number;
  provider: ProviderManifest;
  projectPath: string;
  remote: {
    name: string;
    url: string;
  };
  repository: RepositoryIdentity | null;
  authentication: ProviderAuthenticationState;
  capabilities: CapabilityMatrix;
  unavailableReason: UnsupportedReason | null;
  diagnostics: readonly ProviderDiagnostic[];
}

export interface ProviderActivationCandidate {
  providerId: string;
  remote: {
    name: string;
    url: string;
    fetchUrl: string;
    pushUrl: string | null;
  };
  repository: RepositoryIdentity | null;
  score: number;
  source: "explicit" | "upstream" | "default-remote" | "remote";
}

export type SourceControlActivationResult =
  | {
      status: "active";
      projectPath: string;
      activation: ProviderActivation;
    }
  | {
      status: "ambiguous";
      projectPath: string;
      candidates: readonly ProviderActivationCandidate[];
    }
  | {
      status: "unresolved";
      projectPath: string;
      reason: "no-match" | "configured-provider-missing";
    };

export interface SourceControlErrorDetails {
  providerId: string;
  operation: string;
  retryable: boolean;
  providerCode?: string;
  providerMessage?: string;
}

export interface EventFingerprint {
  kind: "check" | "review-comment";
  value: string;
}
