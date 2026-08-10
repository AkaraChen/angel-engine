import type {
  GitHubChecksSnapshot,
  GitHubReviewThreadsResult,
} from "@angel-engine/daemon-api/github";
import type {
  ShepherdSession,
  ShepherdSettledReason,
} from "@angel-engine/daemon-api/shepherd";
import { SHEPHERD_NO_PROGRESS_LIMIT } from "@angel-engine/daemon-api/shepherd";

import {
  checkFingerprint,
  commentFingerprints,
  unhandledFingerprints,
} from "./fingerprints";

export interface ShepherdEvaluateInput {
  session: ShepherdSession;
  checks: GitHubChecksSnapshot;
  threads: GitHubReviewThreadsResult;
  /** PR state from gh (OPEN / CLOSED / MERGED), uppercased. */
  prState: string | null;
}

export type ShepherdEvaluateResult =
  | { kind: "pending" }
  | { kind: "head_changed"; headSha: string }
  | { kind: "settle"; reason: ShepherdSettledReason }
  | {
      kind: "dispatch";
      fingerprints: string[];
      failedRequired: GitHubChecksSnapshot["failedRequired"];
      newCommentIds: string[];
    }
  | { kind: "noop" };

/**
 * Pure tick decision. Side effects (prompt, gate, send) stay outside.
 */
export function evaluateShepherdTick(
  input: ShepherdEvaluateInput,
): ShepherdEvaluateResult {
  const { session, checks, threads } = input;
  const prState = input.prState?.toUpperCase() ?? null;

  if (prState === "CLOSED" || prState === "MERGED") {
    return { kind: "settle", reason: "closed" };
  }

  const headSha = checks.headOid;
  if (
    headSha !== null &&
    session.headSha !== null &&
    headSha !== session.headSha
  ) {
    return { kind: "head_changed", headSha };
  }

  if (checks.hasPending) {
    return { kind: "pending" };
  }

  if (checks.requiredAllGreen && threads.unresolvedCount === 0) {
    return { kind: "settle", reason: "green" };
  }

  if (session.round >= session.maxRounds) {
    return { kind: "settle", reason: "budget" };
  }

  if (session.consecutiveNoProgress >= SHEPHERD_NO_PROGRESS_LIMIT) {
    return { kind: "settle", reason: "blocked" };
  }

  const handled = new Set(session.handledFingerprints);
  // Also treat pending (queued) fingerprints as already claimed for this batch.
  for (const fp of session.pendingFingerprints) handled.add(fp);

  const failedRequired = checks.failedRequired;
  const checkFps = failedRequired.map(checkFingerprint);
  const commentFps = commentFingerprints(threads.unresolved);
  const newCheckFps = unhandledFingerprints(checkFps, handled);
  const newCommentFps = unhandledFingerprints(commentFps, handled);

  if (newCheckFps.length === 0 && newCommentFps.length === 0) {
    // Same red state already handled — if we already sent on this head, count
    // as no-progress only via the send-completion path; tick itself noops.
    return { kind: "noop" };
  }

  return {
    kind: "dispatch",
    fingerprints: [...newCheckFps, ...newCommentFps],
    failedRequired: failedRequired.filter((check) =>
      newCheckFps.includes(checkFingerprint(check)),
    ),
    newCommentIds: newCommentFps,
  };
}

/**
 * After a shepherd turn settles, update consecutiveNoProgress from headSha.
 */
export function progressAfterShepherdTurn(input: {
  session: ShepherdSession;
  currentHeadSha: string | null;
}): {
  consecutiveNoProgress: number;
  blocked: boolean;
} {
  const sameHead =
    input.session.lastSentHeadSha !== null &&
    input.currentHeadSha !== null &&
    input.session.lastSentHeadSha === input.currentHeadSha;

  const consecutiveNoProgress = sameHead
    ? input.session.consecutiveNoProgress + 1
    : 0;

  return {
    consecutiveNoProgress,
    blocked: consecutiveNoProgress >= SHEPHERD_NO_PROGRESS_LIMIT,
  };
}
