import type {
  GitHubCheckItem,
  GitHubReviewThread,
} from "@angel-engine/daemon-api/github";

/** Fingerprint for a check run / status context. */
export function checkFingerprint(check: GitHubCheckItem): string {
  if (check.checkRunId !== null) {
    return `${check.checkRunId}:${check.attempt}`;
  }
  return `status:${check.name}:${check.attempt}`;
}

/**
 * Check fingerprints are either `databaseId:attempt` or `status:name:attempt`.
 * Comment fingerprints are opaque GraphQL node ids (e.g. `PRRC_…`).
 */
export function isCheckFingerprint(fingerprint: string): boolean {
  if (fingerprint.startsWith("status:")) return true;
  return /^\d+:\d+$/.test(fingerprint);
}

/** Keep only review-comment fingerprints after a head SHA change. */
export function retainCommentFingerprints(
  fingerprints: readonly string[],
): string[] {
  return fingerprints.filter((fp) => !isCheckFingerprint(fp));
}

/** Fingerprints for every comment on unresolved review threads. */
export function commentFingerprints(
  threads: readonly GitHubReviewThread[],
): string[] {
  const out: string[] = [];
  for (const thread of threads) {
    if (thread.isResolved) continue;
    for (const comment of thread.comments) {
      out.push(comment.id);
    }
  }
  return out;
}

export function unhandledFingerprints(
  fingerprints: readonly string[],
  handled: ReadonlySet<string> | readonly string[],
): string[] {
  const set = handled instanceof Set ? handled : new Set(handled);
  return fingerprints.filter((fp) => !set.has(fp));
}
