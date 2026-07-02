import type { ActiveClaudeTurn } from "../types";

import {
  EngineEventContentKind,
  PlanEntryStatus,
} from "@angel-engine/client-napi";
import { describe, expect, it } from "vitest";
import {
  isClaudePlanToolUse,
  planEventsFromToolUse,
  structuredPlanFromToolUse,
} from "../plan";
import { CLAUDE_TOOL } from "../sdk-types";

function activeTurn(): ActiveClaudeTurn {
  return {
    actionIds: new Set(),
    conversationId: "conversation-1",
    request: { text: "test" },
    sawReasoningDelta: false,
    sawTextDelta: false,
    turnId: "turn-1",
  };
}

describe("claude plan tools", () => {
  it("recognizes explicit plan tools only", () => {
    expect(isClaudePlanToolUse(CLAUDE_TOOL.TodoWrite)).toBe(true);
    expect(isClaudePlanToolUse(CLAUDE_TOOL.ExitPlanMode)).toBe(true);
    expect(isClaudePlanToolUse(CLAUDE_TOOL.Bash, { command: "pwd" })).toBe(
      false,
    );
  });

  it("normalizes todo and exit-plan inputs into structured plans", () => {
    expect(
      structuredPlanFromToolUse(CLAUDE_TOOL.TodoWrite, {
        todos: [
          {
            activeForm: "Writing tests",
            content: "Write tests",
            status: "in_progress",
          },
        ],
      }),
    ).toEqual({
      entries: [{ content: "Write tests", status: "in_progress" }],
      kind: "todo",
      text: "",
      type: "plan",
    });

    expect(
      structuredPlanFromToolUse(CLAUDE_TOOL.ExitPlanMode, {
        plan: "- Draft tests\n- Run tests",
        planFilePath: "/tmp/plan.md",
      }),
    ).toEqual({
      entries: [
        { content: "Draft tests", status: PlanEntryStatus.Pending },
        { content: "Run tests", status: PlanEntryStatus.Pending },
      ],
      kind: "review",
      path: "/tmp/plan.md",
      text: "- Draft tests\n- Run tests",
      type: "plan",
    });

    expect(
      structuredPlanFromToolUse(CLAUDE_TOOL.Bash, { command: "pwd" }),
    ).toBeUndefined();
  });

  it("emits plan events from plan tool uses", () => {
    expect(
      planEventsFromToolUse(activeTurn(), CLAUDE_TOOL.TodoWrite, {
        todos: [
          {
            activeForm: "Writing tests",
            content: "Write tests",
            status: "pending",
          },
        ],
      }),
    ).toEqual([
      {
        TodoUpdated: {
          conversation_id: "conversation-1",
          todo: { entries: [{ content: "Write tests", status: "pending" }] },
          turn_id: "turn-1",
        },
      },
    ]);

    expect(
      planEventsFromToolUse(activeTurn(), CLAUDE_TOOL.ExitPlanMode, {
        plan: "- Draft tests",
        planFilePath: "/tmp/plan.md",
      }),
    ).toEqual([
      {
        PlanDelta: {
          conversation_id: "conversation-1",
          delta: { [EngineEventContentKind.Text]: "- Draft tests" },
          turn_id: "turn-1",
        },
      },
      {
        PlanPathUpdated: {
          conversation_id: "conversation-1",
          path: "/tmp/plan.md",
          turn_id: "turn-1",
        },
      },
    ]);

    expect(
      planEventsFromToolUse(activeTurn(), CLAUDE_TOOL.Bash, { command: "pwd" }),
    ).toEqual([]);
  });
});
