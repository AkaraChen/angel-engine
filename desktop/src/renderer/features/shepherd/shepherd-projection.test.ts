import type { ShepherdSession } from "@angel-engine/daemon-api/shepherd";
import { describe, expect, it } from "vitest";

import {
  isResumableShepherdSession,
  shepherdHoldReason,
  shouldShowShepherdYieldToast,
} from "./shepherd-projection";

function session(overrides: Partial<ShepherdSession> = {}): ShepherdSession {
  return {
    id: "s1",
    chatId: "chat-1",
    owner: "acme",
    repo: "app",
    prNumber: 1,
    headSha: "sha",
    state: "watching",
    settledReason: null,
    holdReason: null,
    round: 1,
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

describe("shouldShowShepherdYieldToast", () => {
  it("shows toast only for passive yield transitions", () => {
    expect(
      shouldShowShepherdYieldToast(
        "watching",
        session({ state: "settled", settledReason: "yielded" }),
      ),
    ).toBe(true);
    expect(
      shouldShowShepherdYieldToast(
        "queued",
        session({ state: "settled", settledReason: "yielded" }),
      ),
    ).toBe(true);
  });

  it("does not toast on manual stop", () => {
    expect(
      shouldShowShepherdYieldToast(
        "watching",
        session({ state: "settled", settledReason: "stopped" }),
      ),
    ).toBe(false);
  });

  it("does not toast on first paint or other settles", () => {
    expect(
      shouldShowShepherdYieldToast(
        null,
        session({ state: "settled", settledReason: "yielded" }),
      ),
    ).toBe(false);
    expect(
      shouldShowShepherdYieldToast(
        "watching",
        session({ state: "settled", settledReason: "green" }),
      ),
    ).toBe(false);
  });
});

describe("isResumableShepherdSession", () => {
  it("allows resume after stop or yield", () => {
    expect(
      isResumableShepherdSession(
        session({ state: "settled", settledReason: "stopped" }),
      ),
    ).toBe(true);
    expect(
      isResumableShepherdSession(
        session({ state: "settled", settledReason: "yielded" }),
      ),
    ).toBe(true);
    expect(
      isResumableShepherdSession(
        session({ state: "settled", settledReason: "green" }),
      ),
    ).toBe(false);
  });
});

describe("shepherdHoldReason", () => {
  it("projects daemon hold only while watching", () => {
    expect(
      shepherdHoldReason(
        session({ state: "watching", holdReason: "queued_run" }),
      ),
    ).toBe("queued_run");
    expect(
      shepherdHoldReason(
        session({ state: "queued", holdReason: "queued_run" }),
      ),
    ).toBeNull();
    expect(
      shepherdHoldReason(session({ state: "watching", holdReason: null })),
    ).toBeNull();
  });
});
