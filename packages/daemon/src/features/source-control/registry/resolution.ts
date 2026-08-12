import type {
  ProbeContext,
  ProviderMatch,
} from "@angel-engine/daemon-api/source-control";

export type ProviderResolution =
  | { status: "resolved"; match: ProviderMatch }
  | { status: "ambiguous"; candidates: readonly ProviderMatch[] }
  | {
      status: "unresolved";
      reason: "no-match" | "configured-provider-missing";
    };

function stableCandidates(matches: readonly ProviderMatch[]) {
  return [...matches].sort((left, right) =>
    `${left.providerId}\0${left.remote.name}\0${left.remote.url}`.localeCompare(
      `${right.providerId}\0${right.remote.name}\0${right.remote.url}`,
    ),
  );
}

function choose(
  candidates: readonly ProviderMatch[],
): ProviderResolution | null {
  const stable = stableCandidates(candidates);
  if (stable.length === 0) return null;
  if (stable.length === 1) return { status: "resolved", match: stable[0] };
  return { status: "ambiguous", candidates: stable };
}

/** Resolves by project intent. Provider id and registration order are never tiebreakers. */
export function resolveProvider(
  context: ProbeContext,
  matches: readonly ProviderMatch[],
): ProviderResolution {
  if (context.explicitProviderId !== null) {
    const explicit = matches.filter(
      (match) =>
        match.providerId === context.explicitProviderId &&
        (context.explicitRemote === null ||
          match.remote.name === context.explicitRemote),
    );
    return (
      choose(explicit) ?? {
        status: "unresolved",
        reason: "configured-provider-missing",
      }
    );
  }

  if (context.upstreamRemote !== null) {
    const upstream = choose(
      matches.filter((match) => match.remote.name === context.upstreamRemote),
    );
    if (upstream !== null) return upstream;
  }

  if (context.defaultRemote !== null) {
    const defaultRemote = choose(
      matches.filter((match) => match.remote.name === context.defaultRemote),
    );
    if (defaultRemote !== null) return defaultRemote;
  }

  return choose(matches) ?? { status: "unresolved", reason: "no-match" };
}
