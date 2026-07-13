import type { Chat } from "@angel-engine/daemon-api/chat";

import is from "@sindresorhus/is";

export const NO_PROJECT_FILTER = "__none__";

export type TimeFilter = "all" | "today" | "7d" | "30d" | "90d";

export const timeFilterOptions: Array<{ labelKey: string; value: TimeFilter }> =
  [
    { labelKey: "settings.archived.timeAll", value: "all" },
    { labelKey: "settings.archived.timeToday", value: "today" },
    { labelKey: "settings.archived.timeLast7Days", value: "7d" },
    { labelKey: "settings.archived.timeLast30Days", value: "30d" },
    { labelKey: "settings.archived.timeLast90Days", value: "90d" },
  ];

export function chatMatchesProjectFilter(chat: Chat, projectFilter: string) {
  if (projectFilter === "all") return true;
  if (projectFilter === NO_PROJECT_FILTER) {
    return !is.nonEmptyString(chat.projectId);
  }
  return chat.projectId === projectFilter;
}

export function chatMatchesTimeFilter(chat: Chat, timeFilter: TimeFilter) {
  const cutoff = timeFilterCutoff(timeFilter);
  if (!cutoff) return true;

  const updatedAt = Date.parse(chat.updatedAt);
  return Number.isFinite(updatedAt) && updatedAt >= cutoff.getTime();
}

function timeFilterCutoff(timeFilter: TimeFilter) {
  const now = new Date();
  switch (timeFilter) {
    case "today": {
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
    case "7d":
      return daysAgo(7, now);
    case "30d":
      return daysAgo(30, now);
    case "90d":
      return daysAgo(90, now);
    case "all":
      return null;
  }
}

function daysAgo(days: number, now: Date) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
