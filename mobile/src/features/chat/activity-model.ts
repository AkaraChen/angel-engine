import type {
  ChatActivity,
  ChatActivityStatus,
  ChatSummary,
} from "@/platform/chat-types";

/**
 * Home segments. `attention` covers every status the user still owns, matching
 * the desktop Fleet page so both surfaces group the same runs the same way.
 */
export type ChatActivitySegment = "all" | "attention" | "running" | "done";

export const CHAT_ACTIVITY_SEGMENTS: ChatActivitySegment[] = [
  "all",
  "attention",
  "running",
  "done",
];

export interface ChatActivityRow {
  /** Null for chats with no daemon activity; those only show under `all`. */
  activity: ChatActivity | null;
  chat: ChatSummary;
}

export type ChatActivityCounts = Record<ChatActivitySegment, number>;

/**
 * Ordering is a product decision, not a daemon one: whatever the user still
 * owns comes first, then what is merely in flight.
 */
const STATUS_ORDER: Record<ChatActivityStatus, number> = {
  waiting_for_you: 0,
  failed: 1,
  stuck: 2,
  running: 3,
  done: 4,
};

const STATUS_SEGMENT: Record<
  ChatActivityStatus,
  Exclude<ChatActivitySegment, "all">
> = {
  waiting_for_you: "attention",
  failed: "attention",
  stuck: "attention",
  running: "running",
  done: "done",
};

function chatActivitySegment(
  status: ChatActivityStatus,
): Exclude<ChatActivitySegment, "all"> {
  return STATUS_SEGMENT[status];
}

/** The marker id an opened chat can acknowledge, if the run has ended. */
export function terminalAttentionId(
  activity: ChatActivity,
): string | undefined {
  return activity.status === "done" || activity.status === "failed"
    ? activity.attentionId
    : undefined;
}

/**
 * Joins the chat list with the daemon activity projection and floats the active
 * runs to the top by urgency. Chats without activity keep the daemon's own
 * ordering below them, so the full history stays scannable under `All`.
 */
export function buildChatActivityRows({
  activities,
  chats,
}: {
  activities: ChatActivity[];
  chats: ChatSummary[];
}): ChatActivityRow[] {
  const activityByChatId = new Map(
    activities.map((activity) => [activity.chatId, activity]),
  );
  const rows = chats.map((chat) => ({
    activity: activityByChatId.get(chat.id) ?? null,
    chat,
  }));

  // A stable sort keeps the daemon's ordering for every row that ties, which is
  // all of the inactive ones.
  return rows.sort(compareRows);
}

function compareRows(left: ChatActivityRow, right: ChatActivityRow): number {
  if (left.activity === null || right.activity === null) {
    if (left.activity === right.activity) return 0;
    return left.activity === null ? 1 : -1;
  }
  const byStatus =
    STATUS_ORDER[left.activity.status] - STATUS_ORDER[right.activity.status];
  if (byStatus !== 0) return byStatus;
  if (left.activity.updatedAt !== right.activity.updatedAt) {
    return left.activity.updatedAt < right.activity.updatedAt ? 1 : -1;
  }
  return 0;
}

export function filterChatActivityRows(
  rows: ChatActivityRow[],
  segment: ChatActivitySegment,
): ChatActivityRow[] {
  if (segment === "all") return rows;
  return rows.filter(
    (row) =>
      row.activity !== null &&
      chatActivitySegment(row.activity.status) === segment,
  );
}

export function countChatActivityRows(
  rows: ChatActivityRow[],
): ChatActivityCounts {
  const counts: ChatActivityCounts = {
    all: rows.length,
    attention: 0,
    running: 0,
    done: 0,
  };
  for (const row of rows) {
    if (row.activity === null) continue;
    counts[chatActivitySegment(row.activity.status)] += 1;
  }
  return counts;
}
