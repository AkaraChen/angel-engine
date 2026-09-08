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
  clone?: ProviderOperation<"provider.clone">;
}

export interface RepositoryCapability {
  parseUrl(url: string): RepositoryIdentity | null;
}

export type AutomationCapability = Record<never, never>;
export type ReleaseCapability = Record<never, never>;
export interface SourceControlProviderPlugin {
  manifest: ProviderManifest;
  discovery: ProjectDiscoveryCapability;
  auth: AuthCapability;
  git: GitWorkflowCapability;
  repositories?: RepositoryCapability;
  automation?: AutomationCapability;
  releases?: ReleaseCapability;
}
