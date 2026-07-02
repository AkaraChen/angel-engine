import type { ClientUpdate } from "@angel-engine/client-napi";
import { TurnRunEventType } from "@angel-engine/client-napi";
import { projectTurnRunEvent } from "@angel-engine/js-client/projection";
import { describe, expect, it } from "vitest";
import { turnRunEventsFromUpdate } from "../events";

describe("claude event projection", () => {
  it("emits elicitation message parts that project to chat elicitations", () => {
    const [event] = turnRunEventsFromUpdate({
      events: [
        {
          elicitation: {
            choices: ["Allow", "Deny"],
            id: "permission-1",
            kind: "approval",
            phase: "open",
            questions: [],
            title: "Permission request",
            turnId: "turn-1",
          },
          type: "elicitationOpened",
        },
      ],
    } satisfies ClientUpdate);

    expect(event).toMatchObject({
      messagePart: {
        action: {
          elicitationId: "permission-1",
          id: "permission-1",
          kind: "elicitation",
          phase: "awaitingDecision",
        },
        type: "tool-call",
      },
      type: TurnRunEventType.Elicitation,
    });

    expect(projectTurnRunEvent(event)).toMatchObject({
      elicitation: {
        id: "permission-1",
        kind: "approval",
        phase: "open",
      },
      type: "elicitation",
    });
  });
});
