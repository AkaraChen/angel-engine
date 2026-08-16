import type {
  PartState,
  ReasoningMessagePartComponent,
} from "@assistant-ui/react";
import type { TFunction } from "i18next";
import type { ReactNode } from "react";
import { MessagePrimitive, useAuiState } from "@assistant-ui/react";
import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";

import { Reasoning } from "@/components/assistant-ui/reasoning";
import {
  formatToolGroupLabel,
  hasActiveToolGroupPart,
  ToolGroup,
} from "@/components/assistant-ui/tool-group";
import { ToolActionMessagePart } from "@/features/chat/components/tool-action-message";
import {
  buildTurnActivityRenderPlan,
  type TurnActivityRenderItem,
  visibleTurnActivityRenderPlan,
} from "@/features/chat/components/turn-activity-parts";
import {
  defaultTurnActivityDisplay,
  nextTurnActivityDisplay,
} from "@/features/chat/components/turn-activity-state";

type ActivitySegment = {
  endIndex: number;
  startIndex: number;
  type: "reasoning" | "tool-call";
};

export function TurnActivity({
  renderMessagePart,
}: {
  renderMessagePart: (index: number) => ReactNode;
}) {
  const { t } = useTranslation();
  const parts = useAuiState((state) => state.message.parts);
  const messageRunning = useAuiState(
    (state) => state.message.status?.type === "running",
  );
  const messageTiming = useAuiState((state) => state.message.metadata.timing);
  const active = messageRunning || isTurnActivityActive(parts);
  const [manualDisplay, setManualDisplay] =
    useState<ReturnType<typeof defaultTurnActivityDisplay>>();
  const display = manualDisplay ?? defaultTurnActivityDisplay(active);
  const label = formatTurnActivityLabel(
    parts,
    active,
    messageTiming?.totalStreamTime,
    t,
  );

  const cycleDisplay = () => {
    setManualDisplay(nextTurnActivityDisplay(display));
  };
  const renderPlan = visibleTurnActivityRenderPlan(
    buildTurnActivityRenderPlan(parts),
    display,
  );

  return (
    <>
      {renderPlan.map((item) => {
        if (item.kind === "part") {
          return (
            <Fragment key={messagePartKey(parts[item.index], item.index)}>
              {renderMessagePart(item.index)}
            </Fragment>
          );
        }

        return (
          <Fragment key={`activity-${item.startIndex}`}>
            {renderActivityItem({
              active,
              cycleDisplay,
              display,
              item,
              label,
              parts,
              t,
            })}
          </Fragment>
        );
      })}
    </>
  );
}

function renderActivityItem({
  active,
  cycleDisplay,
  display,
  item,
  label,
  parts,
  t,
}: {
  active: boolean;
  cycleDisplay: () => void;
  display: ReturnType<typeof defaultTurnActivityDisplay>;
  item: Extract<TurnActivityRenderItem, { kind: "activity" }>;
  label: string;
  parts: readonly PartState[];
  t: TFunction;
}) {
  if (display === "summary") {
    return (
      <ActivitySummary
        cycleDisplay={cycleDisplay}
        endIndex={item.endIndex}
        parts={parts}
        startIndex={item.startIndex}
        t={t}
      />
    );
  }

  if (display === "expanded" && !item.isController) {
    return (
      <div
        className="my-2 animate-in duration-200 fade-in-0 slide-in-from-top-1"
        data-slot="turn-activity-continuation"
      >
        <div className="mt-1.5 flex flex-col gap-1.5">
          <ExpandedActivityParts
            endIndex={item.endIndex}
            parts={parts}
            startIndex={item.startIndex}
          />
        </div>
      </div>
    );
  }

  return (
    <ToolGroup.Root
      className={
        display === "collapsed"
          ? "my-0 animate-in duration-200 fade-in-0 slide-in-from-top-1"
          : "animate-in duration-200 fade-in-0 slide-in-from-top-1"
      }
      onOpenChange={cycleDisplay}
      open={display === "expanded"}
    >
      <ToolGroup.Trigger
        active={active}
        aria-expanded={display === "expanded"}
        label={label}
        status={active ? "running" : "complete"}
      />
      <ToolGroup.Content aria-busy={active}>
        <ExpandedActivityParts
          endIndex={item.endIndex}
          parts={parts}
          startIndex={item.startIndex}
        />
      </ToolGroup.Content>
    </ToolGroup.Root>
  );
}

function ActivitySummary({
  cycleDisplay,
  endIndex,
  parts,
  startIndex,
  t,
}: {
  cycleDisplay: () => void;
  endIndex: number;
  parts: readonly PartState[];
  startIndex: number;
  t: TFunction;
}) {
  return (
    <div
      className="animate-in duration-200 fade-in-0 slide-in-from-top-1"
      data-slot="turn-activity-summary"
    >
      {activitySegments(parts, startIndex, endIndex).map((segment) =>
        segment.type === "tool-call" ? (
          <ToolGroup.Root
            key={`${segment.type}-${segment.startIndex}`}
            onOpenChange={cycleDisplay}
            open={false}
          >
            <ToolGroup.Trigger
              active={hasActiveToolGroupPart(
                parts,
                segment.startIndex,
                segment.endIndex,
              )}
              aria-expanded="true"
              label={formatToolGroupLabel(
                parts,
                segment.startIndex,
                segment.endIndex,
                t,
              )}
            />
          </ToolGroup.Root>
        ) : (
          <Reasoning.Root
            key={`${segment.type}-${segment.startIndex}`}
            onOpenChange={cycleDisplay}
            open={false}
          >
            <Reasoning.Trigger
              active={activeReasoningSegment(parts, segment)}
              aria-expanded="true"
            />
          </Reasoning.Root>
        ),
      )}
    </div>
  );
}

function ExpandedActivityParts({
  endIndex,
  parts,
  startIndex,
}: {
  endIndex: number;
  parts: readonly PartState[];
  startIndex: number;
}) {
  return Array.from({ length: endIndex - startIndex + 1 }, (_, offset) => {
    const index = startIndex + offset;
    return (
      <MessagePrimitive.PartByIndex
        components={expandedActivityPartComponents}
        index={index}
        key={activityPartKey(parts[index], index)}
      />
    );
  });
}

const ExpandedReasoning: ReasoningMessagePartComponent = ({ text }) => {
  if (!text) return null;
  return <Reasoning.Text>{text}</Reasoning.Text>;
};

const expandedActivityPartComponents = {
  Reasoning: ExpandedReasoning,
  tools: { Fallback: ToolActionMessagePart },
};

function activityPartKey(part: PartState | undefined, index: number) {
  return part?.type === "tool-call" ? part.toolCallId : `reasoning-${index}`;
}

function activitySegments(
  parts: readonly PartState[],
  startIndex: number,
  endIndex: number,
) {
  const segments: ActivitySegment[] = [];

  for (let index = startIndex; index <= endIndex; index += 1) {
    const part = parts[index];
    if (part?.type !== "reasoning" && part?.type !== "tool-call") continue;

    const previous = segments.at(-1);
    if (previous?.type === part.type && previous.endIndex === index - 1) {
      previous.endIndex = index;
    } else {
      segments.push({ endIndex: index, startIndex: index, type: part.type });
    }
  }

  return segments;
}

function messagePartKey(part: PartState | undefined, index: number) {
  return part?.type === "tool-call"
    ? part.toolCallId
    : `${part?.type ?? "part"}-${index}`;
}

function activeReasoningSegment(
  parts: readonly PartState[],
  segment: ActivitySegment,
) {
  return (
    segment.endIndex === parts.length - 1 &&
    parts[segment.endIndex]?.status.type === "running"
  );
}

function isTurnActivityActive(parts: readonly PartState[]) {
  return (
    parts.some(
      (part) => part.type === "reasoning" && part.status.type === "running",
    ) || hasActiveToolGroupPart(parts, 0, parts.length - 1)
  );
}

function formatTurnActivityLabel(
  parts: readonly PartState[],
  active: boolean,
  durationMs: number | undefined,
  t: TFunction,
) {
  const toolCount = parts.filter((part) => part.type === "tool-call").length;
  const hasReasoning = parts.some((part) => part.type === "reasoning");

  if (toolCount > 0 && hasReasoning) {
    return t("components.toolGroup.thoughtAndToolCalls", { count: toolCount });
  }
  if (toolCount > 0) {
    return t("components.toolGroup.calledTools", { count: toolCount });
  }
  if (active) return t("components.toolGroup.thinking");

  const seconds = Math.max(1, Math.round((durationMs ?? 0) / 1000));
  return t("components.toolGroup.thoughtSeconds", { count: seconds });
}
