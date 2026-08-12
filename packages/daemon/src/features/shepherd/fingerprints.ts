import type {
  CheckRun,
  RepositoryIdentity,
  ReviewComment,
  ReviewThread,
} from "@angel-engine/daemon-api/source-control";
import { repositoryKey } from "@angel-engine/daemon-api/source-control";

const CHECK_PREFIX = "check:v1:";
const COMMENT_PREFIX = "review-comment:v1:";

/**
 * A stable logical identity for a check, independent of provider run ids and
 * attempts. Each normalized segment is byte-length-prefixed, so values that
 * contain separators cannot collide with adjacent segments.
 */
export function checkFingerprint(
  check: CheckRun,
  repository: RepositoryIdentity,
): string {
  const group = check.group;
  return (
    CHECK_PREFIX +
    encodeSegments([
      repository.providerId,
      repositoryKey(repository),
      group?.kind ?? "ungrouped",
      group?.name ?? "",
      group?.stage ?? "",
      check.name,
    ])
  );
}

export function commentFingerprint(comment: ReviewComment): string {
  return COMMENT_PREFIX + encodeSegments([comment.id]);
}

export function isCheckFingerprint(fingerprint: string): boolean {
  return fingerprint.startsWith(CHECK_PREFIX);
}

/** Keep only review-comment fingerprints after a head SHA change. */
export function retainCommentFingerprints(
  fingerprints: readonly string[],
): string[] {
  return fingerprints.filter((fp) => fp.startsWith(COMMENT_PREFIX));
}

/** Fingerprints for every comment on unresolved review threads. */
export function commentFingerprints(
  threads: readonly ReviewThread[],
): string[] {
  const out: string[] = [];
  for (const thread of threads) {
    if (thread.state !== "unresolved") continue;
    for (const comment of thread.comments) {
      out.push(commentFingerprint(comment));
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

function encodeSegments(segments: readonly string[]): string {
  return segments
    .map((segment) => {
      const normalized = segment.normalize("NFC");
      return `${Buffer.byteLength(normalized, "utf8")}:${normalized}`;
    })
    .join("");
}
