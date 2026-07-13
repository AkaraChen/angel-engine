import type { ChatPlanData } from "@angel-engine/daemon-api/chat";
import type { EngineMessage } from "./chat-run-types";
import {
  chatPlanPartName,
  cloneChatPlanData,
  isChatPlanData,
} from "@angel-engine/daemon-api/chat";

export function normalizeEnginePlanMessages(
  messages: EngineMessage[],
): EngineMessage[] {
  const locations = enginePlanPartLocations(messages);
  if (locations.length === 0) return messages;

  const latestByKind = new Map<string, (typeof locations)[number]>();
  const messagesWithPlans = new Set<number>();
  const orderInKind = new Map<string, number>();
  const kindCounters = new Map<string, number>();
  for (const location of locations) {
    latestByKind.set(location.kind, location);
    messagesWithPlans.add(location.messageIndex);
    const next = kindCounters.get(location.kind) ?? 0;
    orderInKind.set(`${location.messageIndex}:${location.partIndex}`, next);
    kindCounters.set(location.kind, next + 1);
  }

  return messages.map((message, messageIndex) => {
    if (!messagesWithPlans.has(messageIndex)) return message;

    return {
      ...message,
      content: message.content.map((part, partIndex) => {
        if (!isEnginePlanPart(part)) return part;
        const kind = chatPlanKind(part.data);
        const locationIndex = orderInKind.get(`${messageIndex}:${partIndex}`);
        if (locationIndex === undefined) return part;

        const presentation = enginePlanPresentationForLocation(
          locationIndex,
          latestByKind.get(kind),
          { messageIndex, partIndex },
        );

        return {
          ...part,
          name: chatPlanPartName(part.data),
          data: {
            ...cloneChatPlanData(part.data),
            presentation,
          },
        };
      }) as EngineMessage["content"],
    } as EngineMessage;
  });
}

function enginePlanPartLocations(messages: EngineMessage[]) {
  const locations: Array<{
    kind: string;
    messageIndex: number;
    partIndex: number;
  }> = [];
  messages.forEach((message, messageIndex) => {
    message.content.forEach((part, partIndex) => {
      if (isEnginePlanPart(part)) {
        locations.push({
          kind: chatPlanKind(part.data),
          messageIndex,
          partIndex,
        });
      }
    });
  });
  return locations;
}

function enginePlanPresentationForLocation(
  locationIndex: number,
  latest: { messageIndex: number; partIndex: number } | undefined,
  current: { messageIndex: number; partIndex: number },
): ChatPlanData["presentation"] {
  if (
    latest &&
    latest.messageIndex === current.messageIndex &&
    latest.partIndex === current.partIndex
  ) {
    return null;
  }

  if (locationIndex === 0) return "created";
  return "updated";
}

type EnginePlanPart = Omit<
  EngineMessage["content"][number],
  "data" | "name" | "type"
> & {
  data: ChatPlanData;
  name: "plan" | "todo";
  type: "data";
};

function isEnginePlanPart(
  part: EngineMessage["content"][number],
): part is EnginePlanPart {
  return (
    part.type === "data" &&
    ((part as { name?: unknown }).name === "plan" ||
      (part as { name?: unknown }).name === "todo") &&
    isChatPlanData((part as { data?: unknown }).data)
  );
}

export function chatPlanKind(plan: ChatPlanData) {
  return plan.kind ?? "review";
}
