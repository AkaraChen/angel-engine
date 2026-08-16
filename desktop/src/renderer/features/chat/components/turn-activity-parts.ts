import type { PartState } from "@assistant-ui/react";

import type { TurnActivityDisplay } from "@/features/chat/components/turn-activity-state";

export type TurnActivityRenderItem =
  | {
      endIndex: number;
      isController: boolean;
      kind: "activity";
      startIndex: number;
    }
  | { index: number; kind: "part" };

export function buildTurnActivityRenderPlan(
  parts: readonly PartState[],
): TurnActivityRenderItem[] {
  const plan: TurnActivityRenderItem[] = [];
  let hasController = false;

  for (let index = 0; index < parts.length; index += 1) {
    const type = parts[index]?.type;
    if (!isActivityPart(type)) {
      plan.push({ index, kind: "part" });
      continue;
    }

    const previous = plan.at(-1);
    if (previous?.kind === "activity" && previous.endIndex === index - 1) {
      previous.endIndex = index;
      continue;
    }

    plan.push({
      endIndex: index,
      isController: !hasController,
      kind: "activity",
      startIndex: index,
    });
    hasController = true;
  }

  return plan;
}

export function visibleTurnActivityRenderPlan(
  plan: readonly TurnActivityRenderItem[],
  display: TurnActivityDisplay,
) {
  if (display !== "collapsed") return plan;
  return plan.filter((item) => item.kind === "part" || item.isController);
}

function isActivityPart(type: PartState["type"] | undefined) {
  return type === "reasoning" || type === "tool-call";
}
