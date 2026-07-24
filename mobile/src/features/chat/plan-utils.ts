import type {
  ConversationMessage,
  DaemonPlanData,
} from "@/platform/chat-types";
import {
  chatPlanPartName,
  cloneChatPlanData,
  isChatPlanData,
  isChatPlanPart,
  normalizeChatPlanMessages,
} from "@angel-engine/daemon-api/chat";

export {
  chatPlanPartName,
  cloneChatPlanData,
  isChatPlanData,
  isChatPlanPart,
  normalizeChatPlanMessages,
};

export function chatPlanKind(plan: DaemonPlanData): "review" | "todo" {
  return plan.kind === "todo" ? "todo" : "review";
}

/**
 * Apply the same created/updated collapse across rendered conversation rows
 * (used after projecting history + for streaming turns that already carry
 * multiple plan snapshots of the same kind).
 */
export function normalizeConversationPlans(
  messages: ConversationMessage[],
): ConversationMessage[] {
  const locations: Array<{
    kind: string;
    messageIndex: number;
    planIndex: number;
  }> = [];
  messages.forEach((message, messageIndex) => {
    message.plans.forEach((plan, planIndex) => {
      locations.push({
        kind: chatPlanKind(plan),
        messageIndex,
        planIndex,
      });
    });
  });
  if (locations.length === 0) return messages;

  const latestByKind = new Map<string, (typeof locations)[number]>();
  for (const location of locations) {
    latestByKind.set(location.kind, location);
  }

  return messages.map((message, messageIndex) => {
    if (message.plans.length === 0) return message;
    return {
      ...message,
      plans: message.plans.map((plan, planIndex) => {
        const kind = chatPlanKind(plan);
        const kindLocations = locations.filter(
          (location) => location.kind === kind,
        );
        const locationIndex = kindLocations.findIndex(
          (location) =>
            location.messageIndex === messageIndex &&
            location.planIndex === planIndex,
        );
        if (locationIndex === -1) return plan;
        return {
          ...cloneChatPlanData(plan),
          presentation: planPresentationForLocation(
            locationIndex,
            latestByKind.get(kind),
            { messageIndex, planIndex },
          ),
        };
      }),
    };
  });
}

function planPresentationForLocation(
  locationIndex: number,
  latest:
    | { messageIndex: number; partIndex: number }
    | { messageIndex: number; planIndex: number }
    | undefined,
  current:
    | { messageIndex: number; partIndex: number }
    | { messageIndex: number; planIndex: number },
): DaemonPlanData["presentation"] {
  if (latest && samePlanLocation(latest, current)) {
    return null;
  }
  if (locationIndex === 0) return "created";
  return "updated";
}

function samePlanLocation(
  a:
    | { messageIndex: number; partIndex: number }
    | { messageIndex: number; planIndex: number },
  b:
    | { messageIndex: number; partIndex: number }
    | { messageIndex: number; planIndex: number },
): boolean {
  if (a.messageIndex !== b.messageIndex) return false;
  const aIndex = "partIndex" in a ? a.partIndex : a.planIndex;
  const bIndex = "partIndex" in b ? b.partIndex : b.planIndex;
  return aIndex === bIndex;
}

/** Upsert a streamed plan into a turn's ordered plan list by kind. */
export function upsertPlan(
  plans: DaemonPlanData[],
  plan: DaemonPlanData,
): DaemonPlanData[] {
  const kind = chatPlanKind(plan);
  const index = plans.findIndex((existing) => chatPlanKind(existing) === kind);
  const next = cloneChatPlanData(plan);
  if (index === -1) return [...plans, next];
  const copy = plans.slice();
  copy[index] = next;
  return copy;
}
