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
