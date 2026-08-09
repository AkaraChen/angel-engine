import { describe, expect, it, vi } from "vitest";
import {
  type WorktreeCreationGateState,
  WorktreeCreationGate,
} from "./worktree-creation-gate";

describe("WorktreeCreationGate", () => {
  it("keeps the original waiter through failure, retry, and ready", async () => {
    const gate = new WorktreeCreationGate();
    let state: WorktreeCreationGateState = "failed";
    const inspect = vi.fn(async () => state);
    let sent = 0;
    const originalRun = gate
      .waitUntilReady("chat-1", inspect)
      .then(() => (sent += 1));

    await vi.waitFor(() => expect(inspect).toHaveBeenCalledOnce());
    expect(sent).toBe(0);

    state = "creating";
    gate.changed("chat-1");
    await vi.waitFor(() => expect(inspect).toHaveBeenCalledTimes(2));
    expect(sent).toBe(0);

    state = null;
    gate.changed("chat-1");

    await expect(originalRun).resolves.toBe(1);
    expect(sent).toBe(1);
  });
});
