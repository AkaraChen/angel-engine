import type {
  PartState,
  ReasoningMessagePartComponent,
} from "@assistant-ui/react";
import type { TFunction } from "i18next";
import { ChainOfThoughtPrimitive, useAuiState } from "@assistant-ui/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Reasoning } from "@/components/assistant-ui/reasoning";
import {
  formatToolGroupLabel,
  hasActiveToolGroupPart,
  ToolGroup,
} from "@/components/assistant-ui/tool-group";
import { ToolActionMessagePart } from "@/features/chat/components/tool-action-message";
import {
  defaultTurnActivityDisplay,
  nextTurnActivityDisplay,
} from "@/features/chat/components/turn-activity-state";

type ActivitySegment = {
  endIndex: number;
  startIndex: number;
  type: "reasoning" | "tool-call";
};

export function TurnActivity() {
  const { t } = useTranslation();
  const parts = useAuiState((state) => state.chainOfThought.parts);
  const messageTiming = useAuiState((state) => state.message.metadata.timing);
  const active = isTurnActivityActive(parts);
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

  if (display === "summary") {
    return (
      <div
        className="animate-in duration-200 fade-in-0 slide-in-from-top-1"
        data-slot="turn-activity-summary"
      >
        {activitySegments(parts).map((segment) =>
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
        <ChainOfThoughtPrimitive.Parts
          components={{
            Reasoning: ExpandedReasoning,
            tools: { Fallback: ToolActionMessagePart },
          }}
        />
      </ToolGroup.Content>
    </ToolGroup.Root>
  );
}

const ExpandedReasoning: ReasoningMessagePartComponent = ({ text }) => {
  if (!text) return null;
  return <Reasoning.Text>{text}</Reasoning.Text>;
};

function activitySegments(parts: readonly PartState[]) {
  const segments: ActivitySegment[] = [];

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (part?.type !== "reasoning" && part?.type !== "tool-call") continue;

    const previous = segments.at(-1);
    if (previous?.type === part.type) {
      previous.endIndex = index;
    } else {
      segments.push({ endIndex: index, startIndex: index, type: part.type });
    }
  }

  return segments;
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
