import {
  EngineEventActionKind,
  EngineEventActionPhase,
  EngineEventTurnOutcome,
} from "@angel-engine/client-napi";
import { describe, expect, it } from "vitest";
import { actionObserved, actionOutputUpdated, failedOutcome } from "../events";
import { piTurnErrorOutcome } from "../session";
import type { ActivePiTurn } from "../types";

function activeTurn(): ActivePiTurn {
  return {
    actionIds: new Set(),
    conversationId: "conversation-1",
    request: { text: "hello" },
    sawReasoningDelta: false,
    sawTextDelta: false,
    terminalEmitted: false,
    turnId: "turn-1",
  };
}

describe("pi events", () => {
  it("maps bash tool starts to command actions", () => {
    expect(
      actionObserved(activeTurn(), "tool-1", "bash", { command: "pwd" }),
    ).toMatchObject({
      ActionObserved: {
        action: {
          id: "tool-1",
          input: { summary: "pwd" },
          kind: EngineEventActionKind.Command,
          title: "pwd",
        },
      },
    });
  });

  it("maps tool output updates", () => {
    expect(
      actionOutputUpdated(
        activeTurn(),
        "tool-1",
        "read",
        { content: [{ text: "done", type: "text" }] },
        EngineEventActionPhase.Completed,
        false,
      ),
    ).toMatchObject({
      ActionUpdated: {
        action_id: "tool-1",
        patch: {
          output_delta: { Text: "done" },
          phase: EngineEventActionPhase.Completed,
        },
      },
    });
  });

  it("records aborted turn errors as interrupted", () => {
    const controller = new AbortController();

    expect(piTurnErrorOutcome(controller.signal, new Error("boom"))).toEqual(
      failedOutcome("boom"),
    );

    controller.abort();
    expect(piTurnErrorOutcome(controller.signal, new Error("boom"))).toBe(
      EngineEventTurnOutcome.Interrupted,
    );
  });
});
