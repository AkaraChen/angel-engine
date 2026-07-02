import type { CanUseTool } from "@anthropic-ai/claude-agent-sdk";
import type { ActiveClaudeTurn, ClaudeElicitationResponse } from "../types";
import { EngineEventTurnOutcome } from "@angel-engine/client-napi";
import { describe, expect, it } from "vitest";
import { failedOutcome } from "../events";
import { ClaudeCodeSession, claudeTurnErrorOutcome } from "../session";

type SessionPermissionHarness = {
  canUseTool: (active: ActiveClaudeTurn) => CanUseTool;
  close: () => void;
  emitEngineEvents: () => void;
  resolveElicitationNow: (
    elicitationId: string,
    response: ClaudeElicitationResponse,
  ) => Promise<void>;
};

function activeTurn(events: unknown[] = []): ActiveClaudeTurn {
  return {
    actionIds: new Set(),
    conversationId: "conversation-1",
    request: {
      onEvent: (event) => events.push(event),
      text: "hello",
    },
    sawReasoningDelta: false,
    sawTextDelta: false,
    turnId: "turn-1",
  };
}

function permissionContext(toolUseID: string): Parameters<CanUseTool>[2] {
  return {
    signal: new AbortController().signal,
    toolUseID,
  };
}

describe("claude session turn handling", () => {
  it("records aborted turn errors as interrupted", () => {
    const controller = new AbortController();

    expect(
      claudeTurnErrorOutcome(controller.signal, new Error("boom")),
    ).toEqual(failedOutcome("boom"));

    controller.abort();
    expect(claudeTurnErrorOutcome(controller.signal, new Error("boom"))).toBe(
      EngineEventTurnOutcome.Interrupted,
    );
  });

  it("rejects missing permission tool ids", async () => {
    const session =
      new ClaudeCodeSession() as unknown as SessionPermissionHarness;
    try {
      await expect(
        session.canUseTool(activeTurn())(
          "Read",
          { file_path: "/tmp/a.png" },
          permissionContext(""),
        ),
      ).rejects.toThrow("missing toolUseID");
    } finally {
      session.close();
    }
  });

  it("keeps distinct permission ids independent", async () => {
    const session =
      new ClaudeCodeSession() as unknown as SessionPermissionHarness;
    session.emitEngineEvents = (): void => {};
    try {
      const canUseTool = session.canUseTool(activeTurn());
      const first = canUseTool(
        "Read",
        { file_path: "/tmp/a.png" },
        permissionContext("tool-1"),
      );
      const second = canUseTool(
        "Read",
        { file_path: "/tmp/b.png" },
        permissionContext("tool-2"),
      );

      await session.resolveElicitationNow("tool-1", { type: "allow" });
      await expect(first).resolves.toMatchObject({
        behavior: "allow",
        toolUseID: "tool-1",
      });

      let secondSettled = false;
      void second.then(() => {
        secondSettled = true;
      });
      await Promise.resolve();
      expect(secondSettled).toBe(false);

      await session.resolveElicitationNow("tool-2", { type: "deny" });
      await expect(second).resolves.toMatchObject({
        behavior: "deny",
        toolUseID: "tool-2",
      });
    } finally {
      session.close();
    }
  });
});
