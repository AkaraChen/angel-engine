import type { PartState } from "@assistant-ui/react";
import { describe, expect, it } from "vitest";

import {
  buildTurnActivityRenderPlan,
  visibleTurnActivityRenderPlan,
} from "@/features/chat/components/turn-activity-parts";

describe("turn activity parts", () => {
  it("keeps text between activity runs under one turn controller", () => {
    const parts = [
      { type: "reasoning" },
      { toolCallId: "tool-1", type: "tool-call" },
      { text: "between tools", type: "text" },
      { toolCallId: "tool-2", type: "tool-call" },
    ] as PartState[];
    const plan = buildTurnActivityRenderPlan(parts);

    expect(plan).toEqual([
      {
        endIndex: 1,
        isController: true,
        kind: "activity",
        startIndex: 0,
      },
      { index: 2, kind: "part" },
      {
        endIndex: 3,
        isController: false,
        kind: "activity",
        startIndex: 3,
      },
    ]);
    expect(
      plan.filter((item) => item.kind === "activity" && item.isController),
    ).toHaveLength(1);

    expect(visibleTurnActivityRenderPlan(plan, "summary")).toEqual(plan);
    expect(visibleTurnActivityRenderPlan(plan, "expanded")).toEqual(plan);
    expect(visibleTurnActivityRenderPlan(plan, "collapsed")).toEqual([
      plan[0],
      plan[1],
    ]);
  });
});
