import type {
  CapabilityMatrix,
  ProviderActivation,
  SourceControlCapabilityId,
} from "@angel-engine/daemon-api/source-control";
import {
  capabilityState as contractCapabilityState,
  repositoryKey,
} from "@angel-engine/daemon-api/source-control";

const EMPTY_CAPABILITIES: CapabilityMatrix = { entries: {} };

/** Missing capabilities are unsupported by contract; callers must never infer support. */
export function capabilityState(
  capabilities: CapabilityMatrix | null | undefined,
  capability: SourceControlCapabilityId,
) {
  return contractCapabilityState(
    capabilities ?? EMPTY_CAPABILITIES,
    capability,
  );
}

/** Cache identity changes whenever provider, repository, or activation generation changes. */
export function sourceControlProviderIdentity(
  activation: ProviderActivation | null | undefined,
): string | null {
  const repository = activation?.repository;
  if (
    !activation ||
    !repository ||
    repository.providerId !== activation.provider.id
  ) {
    return null;
  }
  return `${activation.provider.id}:${repositoryKey(repository)}:${activation.generation}`;
}
