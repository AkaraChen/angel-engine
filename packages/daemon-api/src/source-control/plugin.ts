import type {
  ProbeContext,
  ProviderMatch,
  ProviderOperation,
  ProviderOperationContext,
  ProviderReadiness,
} from "./operations";
import type { ProviderManifest, RepositoryIdentity } from "./types";

export interface ProjectDiscoveryCapability {
  /** Pure matching only. The registry owns all local and network I/O. */
  match(context: ProbeContext): ProviderMatch | readonly ProviderMatch[] | null;
  /** Read-only readiness I/O. The registry wraps this call with timeout and cancellation. */
  checkReadiness(
    match: ProviderMatch,
    context: ProviderOperationContext,
  ): Promise<ProviderReadiness>;
  listNamespaces?: ProviderOperation<"discovery.listNamespaces">;
  listRepositories?: ProviderOperation<"discovery.listRepositories">;
}

export interface AuthCapability {
  status: ProviderOperation<"provider.auth">;
}

export interface GitWorkflowCapability {
  parseUrl(url: string): RepositoryIdentity | null;
  parseChangeRequestUrl(
    url: string,
  ): { repository: RepositoryIdentity; id: string } | null;
  publishBranch?: ProviderOperation<"branches.publish">;
  clone?: ProviderOperation<"provider.clone">;
}

export interface RepositoryCapability {
  parseUrl(url: string): RepositoryIdentity | null;
}

export interface WorkItemCapability {
  get?: ProviderOperation<"workItems.get">;
  getByUrl?: ProviderOperation<"workItems.getByUrl">;
  list?: ProviderOperation<"workItems.list">;
}

export interface ChangeRequestCapability {
  create?: ProviderOperation<"changeRequests.create">;
  get?: ProviderOperation<"changeRequests.get">;
  getByUrl?: ProviderOperation<"changeRequests.getByUrl">;
  list?: ProviderOperation<"changeRequests.list">;
  status?: ProviderOperation<"changeRequests.status">;
  comment?: ProviderOperation<"changeRequests.comment">;
  merge?: ProviderOperation<"changeRequests.merge">;
  preflight?: ProviderOperation<"changeRequests.preflight">;
  resolveHead?: ProviderOperation<"changeRequests.resolveHead">;
}

export interface ReviewCapability {
  listThreads?: ProviderOperation<"reviewThreads.list">;
  resolveThread?: ProviderOperation<"reviewThreads.resolve">;
}

export interface ChecksCapability {
  list?: ProviderOperation<"checks.list">;
  snapshot?: ProviderOperation<"checks.snapshot">;
  failureLog?: ProviderOperation<"checks.failureLog">;
  fixPrompt?: ProviderOperation<"checks.fixPrompt">;
}

export type AutomationCapability = Record<never, never>;
export type ReleaseCapability = Record<never, never>;
export interface ProviderLinkDescriptor {
  id: string;
  kind: "change-request" | "work-item";
  repository: RepositoryIdentity;
  url: string;
}
export interface LinkResolutionCapability {
  matchUrl(url: string): number | null;
  parseUrl(url: string): ProviderLinkDescriptor | null;
}

export interface SourceControlProviderPlugin {
  manifest: ProviderManifest;
  discovery: ProjectDiscoveryCapability;
  auth: AuthCapability;
  git: GitWorkflowCapability;
  repositories?: RepositoryCapability;
  workItems?: WorkItemCapability;
  changeRequests?: ChangeRequestCapability;
  reviews?: ReviewCapability;
  checks?: ChecksCapability;
  automation?: AutomationCapability;
  releases?: ReleaseCapability;
  links?: LinkResolutionCapability;
}
