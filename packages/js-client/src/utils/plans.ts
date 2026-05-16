import { type } from "arktype";
import type {
  ChatHistoryMessage,
  ChatHistoryMessagePart,
  ChatPlanData,
} from "../types.js";

const chatPlanEntry = type({
  content: "string",
  status: "'pending' | 'in_progress' | 'completed'",
});

const chatPlanData = type({
  entries: chatPlanEntry.array(),
  "kind?": "'review' | 'todo' | null",
  "path?": "string | null",
  "presentation?": "'created' | 'updated' | null",
  text: "string",
});

export function isChatPlanData(value: unknown): value is ChatPlanData {
  return !(chatPlanData(value) instanceof type.errors);
}

export function cloneChatPlanData(data: ChatPlanData): ChatPlanData {
  return {
    entries: data.entries.map((entry) => ({ ...entry })),
    kind: data.kind ?? "review",
    path: data.path ?? null,
    presentation: data.presentation ?? null,
    text: data.text,
  };
}

export function normalizeChatPlanMessages(
  messages: ChatHistoryMessage[],
): ChatHistoryMessage[] {
  const locations = planPartLocations(messages);
  if (locations.length === 0) return messages;

  const latestByKind = new Map<string, (typeof locations)[number]>();
  for (const location of locations) {
    latestByKind.set(location.kind, location);
  }

  return messages.map((message, messageIndex) => {
    const hasPlan = locations.some(
      (location) => location.messageIndex === messageIndex,
    );
    if (!hasPlan) return message;

    return {
      ...message,
      content: message.content.map((part, partIndex) => {
        if (!isChatPlanPart(part)) return part;
        const kind = chatPlanKind(part.data);
        const kindLocations = locations.filter(
          (location) => location.kind === kind,
        );
        const locationIndex = kindLocations.findIndex(
          (location) =>
            location.messageIndex === messageIndex &&
            location.partIndex === partIndex,
        );
        if (locationIndex === -1) return part;
        const presentation = planPresentationForLocation(
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
      }),
    };
  });
}

export function upsertChatPlanPart(
  parts: ChatHistoryMessagePart[],
  plan: ChatPlanData,
): void {
  const nextPart: ChatHistoryMessagePart = {
    data: cloneChatPlanData(plan),
    name: chatPlanPartName(plan),
    type: "data",
  };
  const index = parts.findIndex(
    (part) =>
      isChatPlanPart(part) && chatPlanKind(part.data) === chatPlanKind(plan),
  );

  if (index === -1) {
    const firstToolIndex = parts.findIndex((part) => part.type === "tool-call");
    if (firstToolIndex === -1) parts.push(nextPart);
    else parts.splice(firstToolIndex, 0, nextPart);
    return;
  }

  parts[index] = nextPart;
}

export function chatPlanPartName(plan: ChatPlanData): "plan" | "todo" {
  return chatPlanKind(plan) === "todo" ? "todo" : "plan";
}

export function isChatPlanPart(part: ChatHistoryMessagePart): part is Extract<
  ChatHistoryMessagePart,
  { type: "data" }
> & {
  data: ChatPlanData;
  name: "plan" | "todo";
} {
  return (
    part.type === "data" &&
    (part.name === "plan" || part.name === "todo") &&
    isChatPlanData(part.data)
  );
}

function planPartLocations(messages: ChatHistoryMessage[]) {
  const locations: Array<{
    kind: string;
    messageIndex: number;
    partIndex: number;
  }> = [];
  messages.forEach((message, messageIndex) => {
    message.content.forEach((part, partIndex) => {
      if (isChatPlanPart(part)) {
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

function planPresentationForLocation(
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

function chatPlanKind(plan: ChatPlanData) {
  return plan.kind ?? "review";
}
