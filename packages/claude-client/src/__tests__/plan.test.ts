import type { ActiveClaudeTurn } from "../types";

import {
  EngineEventContentKind,
  PlanEntryStatus,
} from "@angel-engine/client-napi";
import { homedir } from "node:os";
import path from "node:path";
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

const planBody = `# Plan: Add a README Note

## Context
Ship plan mode.

## Steps
- Toggle
- Render

## Verification
- Tests green
`;

const planFilePath = path.join(homedir(), ".claude", "plans", "plan.md");

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

  it("emits one plan body for Write(plan.md) then ExitPlanMode with the same text", () => {
    const active = activeTurn();
    const writeEvents = planEventsFromToolUse(active, CLAUDE_TOOL.Write, {
      content: planBody,
      file_path: planFilePath,
    });
    expect(writeEvents.length).toBeGreaterThan(0);
    expect(writeEvents).toEqual(
      expect.arrayContaining([
        {
          PlanDelta: {
            conversation_id: "conversation-1",
            delta: { [EngineEventContentKind.Text]: planBody },
            turn_id: "turn-1",
          },
        },
      ]),
    );

    // ToolSearch is not a plan tool; it must not reset the fingerprint.
    expect(
      planEventsFromToolUse(active, "ToolSearch", { query: "ExitPlanMode" }),
    ).toEqual([]);

    const exitEvents = planEventsFromToolUse(active, CLAUDE_TOOL.ExitPlanMode, {
      plan: planBody,
      planFilePath,
    });
    expect(exitEvents).toEqual([]);

    // A revised plan body at exit still projects.
    const revised = `${planBody}\n- Extra step\n`;
    const revisedEvents = planEventsFromToolUse(
      active,
      CLAUDE_TOOL.ExitPlanMode,
      { plan: revised, planFilePath },
    );
    expect(revisedEvents).toEqual(
      expect.arrayContaining([
        {
          PlanDelta: {
            conversation_id: "conversation-1",
            delta: { [EngineEventContentKind.Text]: revised },
            turn_id: "turn-1",
          },
        },
      ]),
    );
  });

  it("history-style structured projection also keeps a single plan for Write → ExitPlanMode", () => {
    const state = {};
    const fromWrite = structuredPlanFromToolUse(
      CLAUDE_TOOL.Write,
      { content: planBody, file_path: planFilePath },
      state,
    );
    expect(fromWrite).toMatchObject({
      kind: "review",
      path: planFilePath,
      text: planBody,
      type: "plan",
    });

    const fromExit = structuredPlanFromToolUse(
      CLAUDE_TOOL.ExitPlanMode,
      { plan: planBody, planFilePath },
      state,
    );
    expect(fromExit).toBeUndefined();
  });
});
