import type {
  ConversationMessage,
  DaemonHistoryMessage,
  DaemonMessagePart,
  DaemonPlanData,
  DaemonPlanEntry,
} from "@/platform/chat-types";

/** Structural guard mirroring `isChatPlanData` from daemon-api/chat. */
export function isChatPlanData(value: unknown): value is DaemonPlanData {
  if (value === null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (typeof record.text !== "string") return false;
  if (!Array.isArray(record.entries)) return false;
  for (const entry of record.entries) {
    if (!isPlanEntry(entry)) return false;
  }
  if (
    record.kind !== undefined &&
    record.kind !== null &&
    record.kind !== "review" &&
    record.kind !== "todo"
  ) {
    return false;
  }
  if (
    record.presentation !== undefined &&
    record.presentation !== null &&
    record.presentation !== "created" &&
    record.presentation !== "updated"
  ) {
    return false;
  }
  if (
    record.path !== undefined &&
    record.path !== null &&
    typeof record.path !== "string"
  ) {
    return false;
  }
  return true;
}

function isPlanEntry(value: unknown): value is DaemonPlanEntry {
  if (value === null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.content === "string" &&
    (record.status === "pending" ||
      record.status === "in_progress" ||
      record.status === "completed")
  );
}

export function cloneChatPlanData(data: DaemonPlanData): DaemonPlanData {
  return {
    entries: data.entries.map((entry) => ({ ...entry })),
    kind: data.kind ?? "review",
    path: data.path ?? null,
    presentation: data.presentation ?? null,
    text: data.text,
  };
}

export function chatPlanKind(plan: DaemonPlanData): "review" | "todo" {
  return plan.kind === "todo" ? "todo" : "review";
}

export function chatPlanPartName(plan: DaemonPlanData): "plan" | "todo" {
  return chatPlanKind(plan) === "todo" ? "todo" : "plan";
}

export function isChatPlanPart(
  part: DaemonMessagePart,
): part is DaemonMessagePart & { data: DaemonPlanData; type: "data" } {
  return (
    part.type === "data" &&
    (part.name === "plan" || part.name === "todo") &&
    isChatPlanData(part.data)
  );
}

/**
 * Collapse older plans of the same kind to created/updated markers so only the
 * latest full plan body is expanded — same semantics as desktop/daemon-api.
 */
export function normalizeChatPlanMessages(
  messages: DaemonHistoryMessage[],
): DaemonHistoryMessage[] {
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

function planPartLocations(messages: DaemonHistoryMessage[]) {
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
