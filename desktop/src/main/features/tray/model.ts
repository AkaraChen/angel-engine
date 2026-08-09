import type { ChatActivity } from "@angel-engine/daemon-api/chat";

/** Cap menu length so the tray dropdown stays scannable. */
export const TRAY_MENU_SESSION_LIMIT = 15;

export type TraySessionStatus = ChatActivity["status"];

export interface TraySessionItem {
  chatId: string;
  projectId: string | null;
  status: TraySessionStatus;
  title: string;
}

const STATUS_ORDER: Record<TraySessionStatus, number> = {
  waiting_for_you: 0,
  stuck: 1,
  failed: 2,
  running: 3,
  done: 4,
};

export function countNeedsYou(
  activities: readonly Pick<ChatActivity, "status">[],
): number {
  let count = 0;
  for (const activity of activities) {
    if (activity.status === "waiting_for_you") count += 1;
  }
  return count;
}

/** Menu-bar badge text; empty when nothing needs the user. */
export function trayBadgeLabel(count: number): string {
  if (count <= 0) return "";
  if (count > 99) return "99+";
  return String(count);
}

/**
 * Prefer sessions that still need a glance: needs-you first, then stuck/failed
 * and running. Terminal "done" rows stay last and drop first when capped.
 */
export function selectTrayActivities(
  activities: readonly ChatActivity[],
  limit = TRAY_MENU_SESSION_LIMIT,
): ChatActivity[] {
  return [...activities]
    .sort((left, right) => {
      const byStatus = STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
      if (byStatus !== 0) return byStatus;
      return right.updatedAt.localeCompare(left.updatedAt);
    })
    .slice(0, Math.max(0, limit));
}

export function sortTraySessions(
  sessions: readonly TraySessionItem[],
): TraySessionItem[] {
  return [...sessions].sort((left, right) => {
    const byStatus = STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
    if (byStatus !== 0) return byStatus;
    return left.title.localeCompare(right.title);
  });
}

export function fleetStatusI18nKey(status: TraySessionStatus): string {
  switch (status) {
    case "waiting_for_you":
      return "fleet.status.waitingForYou";
    case "running":
      return "fleet.status.running";
    case "stuck":
      return "fleet.status.stuck";
    case "failed":
      return "fleet.status.failed";
    case "done":
      return "fleet.status.done";
  }
}
