import type {
  CheckRun,
  CheckSummary,
  RepositoryIdentity,
  ReviewThread,
} from "@angel-engine/daemon-api/source-control";
import type { ShepherdSession } from "@angel-engine/daemon-api/shepherd";
import { describe, expect, it } from "vitest";

import {
  evaluateShepherdTick as evaluateTick,
  progressAfterShepherdTurn,
  type ShepherdEvaluateInput,
} from "./evaluate";
import { checkFingerprint, retainCommentFingerprints } from "./fingerprints";

const repository: RepositoryIdentity = {
  providerId: "github",
  host: "github.com",
  namespace: ["acme"],
  name: "app",
  remoteId: null,
  displayPath: "acme/app",
  webUrl: "https://github.com/acme/app",
};

function check(
  overrides: Partial<CheckRun> & Pick<CheckRun, "name">,
): CheckRun {
  return {
    attempt: 1,
    id: "100",
    group: null,
    conclusion: "failure",
    detailsUrl: null,
    status: "completed",
    requiredness: "required",
    blocking: true,
    retryOf: null,
    allowFailure: false,
    manual: false,
    startedAt: null,
    completedAt: null,
    logRef: { kind: "workflow-run", runId: "9", jobId: null },
    ...overrides,
  };
}

function snapshot(
  overrides: Partial<CheckSummary> & {
    failedRequired?: readonly CheckRun[];
  } = {},
): CheckSummary {
  const failedRequired = overrides.failedRequired ?? [];
  return {
    checks: overrides.checks ?? failedRequired,
    failed: overrides.failed ?? failedRequired,
    failedBlocking: failedRequired,
    hasPending: overrides.hasPending ?? false,
    headOid: overrides.headOid ?? "sha-a",
    requiredAllGreen: overrides.requiredAllGreen ?? failedRequired.length === 0,
  };
}

function threads(
  overrides: { unresolved?: readonly ReviewThread[] } = {},
): readonly ReviewThread[] {
  return overrides.unresolved ?? [];
}

function evaluateShepherdTick(
  input: Omit<ShepherdEvaluateInput, "repository">,
) {
  return evaluateTick({ ...input, repository });
}

function session(overrides: Partial<ShepherdSession> = {}): ShepherdSession {
  return {
    id: "s1",
    chatId: "chat-1",
    owner: "acme",
    repo: "app",
    prNumber: 1,
    headSha: "sha-a",
    state: "watching",
    settledReason: null,
    holdReason: null,
    round: 0,
    maxRounds: 10,
    consecutiveNoProgress: 0,
    handledFingerprints: [],
    baselineSnapshot: null,
    pendingPrompt: null,
    pendingFingerprints: [],
    lastSentHeadSha: null,
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("evaluateShepherdTick", () => {
  it("does nothing while checks are pending", () => {
    const result = evaluateShepherdTick({
      session: session(),
      checks: snapshot({ hasPending: true, requiredAllGreen: false }),
      threads: threads(),
      prState: "OPEN",
    });
    expect(result).toEqual({ kind: "pending" });
  });

  it("settles green when required checks pass and threads are resolved", () => {
    expect(
      evaluateShepherdTick({
        session: session(),
        checks: snapshot({ requiredAllGreen: true, failedRequired: [] }),
        threads: threads(),
        prState: "OPEN",
      }),
    ).toEqual({ kind: "settle", reason: "green" });
  });

  it("settles closed when the PR is merged or closed", () => {
    expect(
      evaluateShepherdTick({
        session: session(),
        checks: snapshot({ hasPending: true }),
        threads: threads(),
        prState: "MERGED",
      }),
    ).toEqual({ kind: "settle", reason: "closed" });
  });

  it("treats headSha changes as rebase without counting a round", () => {
    expect(
      evaluateShepherdTick({
        session: session({ headSha: "sha-a", round: 3 }),
        checks: snapshot({
          headOid: "sha-b",
          failedRequired: [check({ name: "build", id: "1" })],
        }),
        threads: threads(),
        prState: "OPEN",
      }),
    ).toEqual({ kind: "head_changed", headSha: "sha-b" });
  });

  it("dispatches on unhandled required failures", () => {
    const failed = check({ name: "build", id: "42", attempt: 2 });
    const result = evaluateShepherdTick({
      session: session(),
      checks: snapshot({
        failedRequired: [failed],
        requiredAllGreen: false,
      }),
      threads: threads(),
      prState: "OPEN",
    });
    expect(result.kind).toBe("dispatch");
    if (result.kind !== "dispatch") return;
    expect(result.fingerprints).toEqual([checkFingerprint(failed, repository)]);
    expect(result.failedRequired).toEqual([failed]);
  });

  it("dedupes already-handled fingerprints", () => {
    const failed = check({ name: "build", id: "42", attempt: 1 });
    const fp = checkFingerprint(failed, repository);
    expect(
      evaluateShepherdTick({
        session: session({ handledFingerprints: [fp] }),
        checks: snapshot({
          failedRequired: [failed],
          requiredAllGreen: false,
        }),
        threads: threads(),
        prState: "OPEN",
      }),
    ).toEqual({ kind: "noop" });
  });

  it("dispatches on new unresolved review comments", () => {
    const result = evaluateShepherdTick({
      session: session(),
      checks: snapshot({ requiredAllGreen: true }),
      threads: threads({
        unresolved: [
          {
            id: "t1",
            state: "unresolved",
            resolvable: true,
            location: { path: "a.ts", side: "right", startLine: 3, endLine: 3 },
            comments: [
              {
                id: "c1",
                author: {
                  id: null,
                  login: "rev",
                  displayName: null,
                  avatarUrl: null,
                  webUrl: null,
                },
                body: "fix me",
                createdAt: "2026-08-10T00:00:00.000Z",
                updatedAt: null,
                webUrl: null,
              },
            ],
          },
        ],
      }),
      prState: "OPEN",
    });
    expect(result).toMatchObject({
      kind: "dispatch",
      fingerprints: [expect.stringMatching(/^review-comment:v1:/)],
      newCommentIds: ["c1"],
    });
  });

  it("settles budget when rounds are exhausted", () => {
    expect(
      evaluateShepherdTick({
        session: session({ round: 10, maxRounds: 10 }),
        checks: snapshot({
          failedRequired: [check({ name: "build" })],
          requiredAllGreen: false,
        }),
        threads: threads(),
        prState: "OPEN",
      }),
    ).toEqual({ kind: "settle", reason: "budget" });
  });

  it("settles blocked when consecutive no-progress hits the limit", () => {
    expect(
      evaluateShepherdTick({
        session: session({ consecutiveNoProgress: 2 }),
        checks: snapshot({
          failedRequired: [check({ name: "build" })],
          requiredAllGreen: false,
        }),
        threads: threads(),
        prState: "OPEN",
      }),
    ).toEqual({ kind: "settle", reason: "blocked" });
  });
});

describe("retainCommentFingerprints", () => {
  it("drops check fingerprints and keeps comment ids after head change", () => {
    expect(
      retainCommentFingerprints([
        "check:v1:2:ci",
        "review-comment:v1:18:PRRC_kwDOComment1",
      ]),
    ).toEqual(["review-comment:v1:18:PRRC_kwDOComment1"]);
  });
});

describe("progressAfterShepherdTurn", () => {
  it("increments no-progress when headSha did not move", () => {
    expect(
      progressAfterShepherdTurn({
        session: session({
          consecutiveNoProgress: 0,
          lastSentHeadSha: "sha-a",
        }),
        currentHeadSha: "sha-a",
      }),
    ).toEqual({ consecutiveNoProgress: 1, blocked: false });
  });

  it("blocks after two no-progress turns", () => {
    expect(
      progressAfterShepherdTurn({
        session: session({
          consecutiveNoProgress: 1,
          lastSentHeadSha: "sha-a",
        }),
        currentHeadSha: "sha-a",
      }),
    ).toEqual({ consecutiveNoProgress: 2, blocked: true });
  });

  it("resets when headSha advances", () => {
    expect(
      progressAfterShepherdTurn({
        session: session({
          consecutiveNoProgress: 1,
          lastSentHeadSha: "sha-a",
        }),
        currentHeadSha: "sha-b",
      }),
    ).toEqual({ consecutiveNoProgress: 0, blocked: false });
  });
});
