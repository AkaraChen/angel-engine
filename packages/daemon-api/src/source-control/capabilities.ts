import type {
  CapabilityMatrix,
  CapabilityState,
  SourceControlCapabilityId,
} from "./types";

export function capabilityState(
  matrix: CapabilityMatrix,
  capability: SourceControlCapabilityId,
): CapabilityState {
  return (
    matrix.entries[capability] ?? {
      supported: false,
      reason: {
        kind: "unknown-capability",
        message: `Capability ${capability} was not declared by the provider.`,
      },
    }
  );
}

export function repositoryKey(identity: {
  host: string;
  name: string;
  namespace: readonly string[];
}): string {
  return `${identity.host}/${[...identity.namespace, identity.name].join("/")}`;
}
