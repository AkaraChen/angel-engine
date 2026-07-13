import type {
  CanUseTool,
  SpawnedProcess,
  SpawnOptions,
} from "@anthropic-ai/claude-agent-sdk";
import type {
  ConversationSnapshot,
  TurnRunResult,
} from "@angel-engine/client-napi";
import type { ActiveClaudeTurn, ClaudeElicitationResponse } from "../types";
import { EngineEventTurnOutcome } from "@angel-engine/client-napi";
import { describe, expect, it } from "vitest";
import { failedOutcome } from "../events";
import { ClaudeCodeSession, claudeTurnErrorOutcome } from "../session";

type SessionPermissionHarness = {
  canUseTool: (active: ActiveClaudeTurn) => CanUseTool;
  close: () => void;
  eventsFromSdkMessage: (
    message: { subtype?: string; type: string },
    active: ActiveClaudeTurn,
  ) => unknown[];
  emitEngineEvents: () => void;
  resolveElicitationNow: (
    elicitationId: string,
    response: ClaudeElicitationResponse,
  ) => Promise<void>;
};

type SessionFinishHarness = SessionPermissionHarness & {
  finishTurn: (active: ActiveClaudeTurn) => TurnRunResult;
  replayedSessionId?: string;
  requireConversation: () => ConversationSnapshot;
};

type SessionProcessHarness = {
  spawnClaudeProcess: (
    options: SpawnOptions,
  ) => SpawnedProcess & { pid?: number };
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
  it("publishes the pid lifecycle of a spawned Claude process", async () => {
    const session = new ClaudeCodeSession();
    const processIds: Array<number | undefined> = [];
    const unsubscribe = session.subscribeProcessId((processId) => {
      processIds.push(processId);
    });
    const child = (
      session as unknown as SessionProcessHarness
    ).spawnClaudeProcess({
      args: ["-e", "setInterval(() => undefined, 1_000)"],
      command: process.execPath,
      env: process.env,
      signal: new AbortController().signal,
    });

    try {
      expect(session.processId()).toBe(child.pid);
      expect(processIds).toEqual([child.pid]);
      const exited = new Promise<void>((resolve) => {
        child.once("exit", () => resolve());
      });
      child.kill("SIGTERM");
      await exited;
      expect(session.processId()).toBeUndefined();
      expect(processIds).toEqual([child.pid, undefined]);
    } finally {
      unsubscribe();
      child.kill("SIGKILL");
      session.close();
    }
  });

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

  it("does not replay history again after a live turn finishes", () => {
    const session = new ClaudeCodeSession() as unknown as SessionFinishHarness;
    session.requireConversation = (): ConversationSnapshot =>
      ({
        remoteId: "claude-session-1",
        remoteKind: "known",
      }) as ConversationSnapshot;

    try {
      expect(session.finishTurn(activeTurn()).remoteThreadId).toBe(
        "claude-session-1",
      );
      expect(session.replayedSessionId).toBe("claude-session-1");
    } finally {
      session.close();
    }
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

  it("rejects unsupported sdk messages", () => {
    const session =
      new ClaudeCodeSession() as unknown as SessionPermissionHarness;
    try {
      expect(() =>
        session.eventsFromSdkMessage(
          { type: "new_runtime_event" },
          activeTurn(),
        ),
      ).toThrow("Unsupported Claude SDK message type");

      expect(() =>
        session.eventsFromSdkMessage(
          { subtype: "new_system_event", type: "system" },
          activeTurn(),
        ),
      ).toThrow("Unsupported Claude SDK system message subtype");
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
