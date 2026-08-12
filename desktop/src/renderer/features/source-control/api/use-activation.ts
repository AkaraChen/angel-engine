import type {
  CapabilityMatrix,
  ProviderActivation,
  ProviderActivationCandidate,
  ProviderAuthenticationState,
  ProviderDiagnostic,
  RepositoryIdentity,
  SourceControlActivationResult,
  UnsupportedReason,
} from "@angel-engine/daemon-api/source-control";
import { queryOptions, useQuery } from "@tanstack/react-query";

import type { ApiClient } from "@/platform/api-client";
import { queryKeys } from "@/platform/query-keys";
import { useApi } from "@/platform/use-api";
import { sourceControlProviderIdentity } from "../model";

const EMPTY_CAPABILITIES: CapabilityMatrix = { entries: {} };
const EMPTY_DIAGNOSTICS: readonly ProviderDiagnostic[] = [];

export type SourceControlActivationStatus =
  | "disabled"
  | "loading"
  | "active"
  | "ambiguous"
  | "unresolved"
  | "error";

export interface SourceControlActivationView {
  activation: ProviderActivation | null;
  authentication: ProviderAuthenticationState | null;
  candidates: readonly ProviderActivationCandidate[];
  capabilities: CapabilityMatrix;
  diagnostics: readonly ProviderDiagnostic[];
  error: Error | null;
  projectPath: string | null;
  providerDisplayName: string | null;
  providerId: string | null;
  providerIdentity: string | null;
  repository: RepositoryIdentity | null;
  unresolvedReason: "no-match" | "configured-provider-missing" | null;
  status: SourceControlActivationStatus;
  unavailableReason: UnsupportedReason | null;
  refetch(): Promise<unknown>;
}

export function sourceControlActivationQueryOptions({
  api,
  projectId,
}: {
  api: ApiClient;
  projectId: string;
}) {
  return queryOptions({
    queryFn: () => api.sourceControl.activation(projectId),
    queryKey: queryKeys.sourceControl.activation(projectId),
    retry: false,
    staleTime: 30_000,
  });
}

export function useSourceControlActivation(
  projectId: string | null | undefined,
): SourceControlActivationView {
  const api = useApi();
  const enabled = typeof projectId === "string" && projectId.length > 0;
  const query = useQuery({
    ...sourceControlActivationQueryOptions({
      api,
      projectId: projectId ?? "",
    }),
    enabled,
  });
  return activationView({
    enabled,
    error: query.error,
    loading: query.isPending,
    refetch: query.refetch,
    result: query.data,
  });
}

function activationView(input: {
  enabled: boolean;
  error: Error | null;
  loading: boolean;
  refetch(): Promise<unknown>;
  result: SourceControlActivationResult | undefined;
}): SourceControlActivationView {
  const active =
    input.result?.status === "active" ? input.result.activation : null;
  return {
    activation: active,
    authentication: active?.authentication ?? null,
    candidates:
      input.result?.status === "ambiguous" ? input.result.candidates : [],
    capabilities: active?.capabilities ?? EMPTY_CAPABILITIES,
    diagnostics: active?.diagnostics ?? EMPTY_DIAGNOSTICS,
    error: input.error,
    projectPath: input.result?.projectPath ?? null,
    providerDisplayName: active?.provider.displayName ?? null,
    providerId: active?.provider.id ?? null,
    providerIdentity: sourceControlProviderIdentity(active),
    repository: active?.repository ?? null,
    status: !input.enabled
      ? "disabled"
      : input.error !== null
        ? "error"
        : input.result !== undefined
          ? input.result.status
          : input.loading
            ? "loading"
            : "unresolved",
    unavailableReason: active?.unavailableReason ?? null,
    unresolvedReason:
      input.result?.status === "unresolved" ? input.result.reason : null,
    refetch: () => input.refetch(),
  };
}
