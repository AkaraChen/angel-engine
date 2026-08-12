import type {
  CheckRun,
  CheckSummary,
  RepositoryIdentity,
  ReviewThread,
} from "@angel-engine/daemon-api/source-control";
import type {
  ShepherdSession,
  ShepherdSettledReason,
} from "@angel-engine/daemon-api/shepherd";
import { SHEPHERD_NO_PROGRESS_LIMIT } from "@angel-engine/daemon-api/shepherd";

import {
  checkFingerprint,
  commentFingerprint,
  unhandledFingerprints,
} from "./fingerprints";

export interface ShepherdEvaluateInput {
  session: ShepherdSession;
  checks: CheckSummary;
  threads: readonly ReviewThread[];
  repository: RepositoryIdentity;
  prState: string | null;
}

export type ShepherdEvaluateResult =
  | { kind: "pending" }
  | { kind: "head_changed"; headSha: string }
  | { kind: "settle"; reason: ShepherdSettledReason }
  | {
      kind: "dispatch";
      fingerprints: string[];
      failedRequired: readonly CheckRun[];
      newCommentIds: string[];
    }
  | { kind: "noop" };

/** Pure tick decision. Side effects (prompt, gate, send) stay outside. */
export function evaluateShepherdTick(
  input: ShepherdEvaluateInput,
): ShepherdEvaluateResult {
  const { session, checks, threads, repository } = input;
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

  if (checks.hasPending) return { kind: "pending" };

  const unresolved = threads.filter((thread) => thread.state === "unresolved");
  if (checks.requiredAllGreen && unresolved.length === 0) {
    return { kind: "settle", reason: "green" };
  }
  if (session.round >= session.maxRounds) {
    return { kind: "settle", reason: "budget" };
  }
  if (session.consecutiveNoProgress >= SHEPHERD_NO_PROGRESS_LIMIT) {
    return { kind: "settle", reason: "blocked" };
  }

  const handled = new Set(session.handledFingerprints);
  for (const fp of session.pendingFingerprints) handled.add(fp);

  const failedRequired = checks.failedBlocking;
  const checkFps = failedRequired.map((check) =>
    checkFingerprint(check, repository),
  );
  const commentEntries = unresolved.flatMap((thread) =>
    thread.comments.map((comment) => ({
      id: comment.id,
      fingerprint: commentFingerprint(comment),
    })),
  );
  const newCheckFps = unhandledFingerprints(checkFps, handled);
  const newCommentFps = unhandledFingerprints(
    commentEntries.map((entry) => entry.fingerprint),
    handled,
  );

  if (newCheckFps.length === 0 && newCommentFps.length === 0) {
    return { kind: "noop" };
  }

  const newCheckSet = new Set(newCheckFps);
  const newCommentSet = new Set(newCommentFps);
  return {
    kind: "dispatch",
    fingerprints: [...newCheckFps, ...newCommentFps],
    failedRequired: failedRequired.filter((check) =>
      newCheckSet.has(checkFingerprint(check, repository)),
    ),
    newCommentIds: commentEntries
      .filter((entry) => newCommentSet.has(entry.fingerprint))
      .map((entry) => entry.id),
  };
}

export function progressAfterShepherdTurn(input: {
  session: ShepherdSession;
  currentHeadSha: string | null;
}): { consecutiveNoProgress: number; blocked: boolean } {
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
