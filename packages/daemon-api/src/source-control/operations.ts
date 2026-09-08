import { type as arkType } from "arktype";

import {
  providerDiagnosticSchema,
  repositoryIdentitySchema,
} from "./schemas";
import type {
  ProviderAuthenticationState,
  ProviderDiagnostic,
  RepositoryIdentity,
  SourceControlCapabilityId,
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
