import type { RuntimeOptions } from "@angel-engine/client-napi";
import type { Chat } from "@angel-engine/daemon-api/chat";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatActivityStore } from "./activity";
import { DesktopAngelSession } from "./desktop-angel-session";
import { ChatProcessRegistry } from "./process-registry";

const native = vi.hoisted(() => ({
  close: vi.fn(),
  isProcessRunning: vi.fn(() => true),
  processId: 123,
}));

vi.mock("@angel-engine/client-napi", () => ({
  ActionPhase: { AwaitingDecision: "awaitingDecision" },
  AngelSession: class {
    close(): void {
      native.close();
    }

    processId(): number {
      return native.processId;
    }
  },
  ElicitationResponseType: {
    Allow: "allow",
    AllowForSession: "allowForSession",
    Answers: "answers",
    Cancel: "cancel",
    Deny: "deny",
    DynamicToolResult: "dynamicToolResult",
    ExternalComplete: "externalComplete",
    Raw: "raw",
  },
  TurnRunEventType: { Elicitation: "elicitation" },
  isProcessRunning: native.isProcessRunning,
}));

const chat = {
  archived: false,
  createdAt: "2026-07-25T00:00:00.000Z",
  cwd: "/tmp",
  id: "chat-1",
  pinned: false,
  projectId: null,
  remoteThreadId: null,
  runtime: "codex",
  title: "Test",
  updatedAt: "2026-07-25T00:00:00.000Z",
} satisfies Chat;

beforeEach(() => {
  vi.useFakeTimers();
  native.close.mockClear();
  native.isProcessRunning.mockReset().mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("DesktopAngelSession process liveness", () => {
  it("propagates root process exit through the registry to stuck activity", async () => {
    const activity = new ChatActivityStore({ stuckGraceMs: 100 });
    activity.start(chat.id, "run-1");
    const session = new DesktopAngelSession({} as RuntimeOptions);
    const registry = new ChatProcessRegistry({
      lookupChat: async () => chat,
      replaceEntries: async (entries) => {
        activity.replaceProcessEntries(entries);
      },
      sessions: new Map([[chat.id, session]]),
    });

    await registry.refresh();
    expect(activity.list().items[0]?.status).toBe("running");

    native.isProcessRunning.mockReturnValue(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(native.isProcessRunning).toHaveBeenCalledWith(native.processId);

    await vi.advanceTimersByTimeAsync(100);
    expect(activity.list().items[0]).toMatchObject({
      reason: "process_exited",
      status: "stuck",
    });
    expect(session.processId()).toBeUndefined();

    session.close();
    expect(native.close).toHaveBeenCalledOnce();
  });
});
