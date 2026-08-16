import type { PartState } from "@assistant-ui/react";
import { describe, expect, it } from "vitest";

import { activityPartIndices } from "@/features/chat/components/turn-activity-parts";

describe("turn activity parts", () => {
  it("collects interleaved reasoning and tools in their original order", () => {
    const parts = [
      { type: "reasoning" },
      { text: "before the first tool", type: "text" },
      { toolCallId: "tool-1", type: "tool-call" },
      { text: "between tools", type: "text" },
      { type: "reasoning" },
      { toolCallId: "tool-2", type: "tool-call" },
      { text: "done", type: "text" },
    ] as PartState[];

    expect(activityPartIndices(parts)).toEqual([0, 2, 4, 5]);
  });
});
