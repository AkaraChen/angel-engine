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
export type ResolvedSourceControlLink = WorkItem;



export type SourceControlCapabilityId =
  | "provider.auth"
  | "discovery.listNamespaces"
  | "discovery.listRepositories"
  | "repositoryIdentity"
  | "workItems.get"
  | "workItems.getByUrl"
  | "workItems.list"
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
