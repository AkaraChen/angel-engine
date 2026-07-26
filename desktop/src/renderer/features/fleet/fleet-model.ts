import type {
  Chat,
  ChatActivity,
  ChatActivityStatus,
} from "@angel-engine/daemon-api/chat";
import type { Project } from "@angel-engine/daemon-api/projects";

import is from "@sindresorhus/is";
import { getProjectDisplayName } from "@/app/workspace/workspace-display";
import { workspaceToolRootName } from "@/app/workspace/workspace-file-display";
import { chatWorktreeCwd } from "@/features/chat/worktree-grouping";

/** Row grouping shown on the page. `attention` covers everything the user owns. */
export type FleetGroup = "attention" | "running" | "done";

export type FleetSegment = "all" | FleetGroup;

export const FLEET_SEGMENTS: FleetSegment[] = [
  "all",
  "attention",
  "running",
  "done",
];

/** Sentinel project filter values; real values are project ids. */
export const FLEET_PROJECT_FILTER_ALL = "all";
export const FLEET_PROJECT_FILTER_STANDALONE = "standalone";

export interface FleetRow {
  chat: Chat;
  chatId: string;
  group: FleetGroup;
  /** Present only when the daemon reported a failure message. */
  failureMessage?: string;
  projectId?: string;
  projectName?: string;
  runId: string;
  runtime: string;
  status: ChatActivityStatus;
  /** Set while the row still holds an unread `done`/`failed` marker. */
  terminalAttentionId?: string;
  title: string;
  updatedAt: string;
  /** Set when the chat runs in a worktree other than the project root. */
  worktreeName?: string;
}

export interface FleetCounts {
  all: number;
  attention: number;
  done: number;
  running: number;
}

export interface FleetProjectOption {
  label: string;
  value: string;
}

/**
 * Fleet ordering is a product decision, not a daemon one: whatever the user
 * still owns comes first, then what is merely in flight.
 */
const STATUS_ORDER: Record<ChatActivityStatus, number> = {
  waiting_for_you: 0,
  failed: 1,
  stuck: 2,
  running: 3,
  done: 4,
};

const STATUS_GROUP: Record<ChatActivityStatus, FleetGroup> = {
  waiting_for_you: "attention",
  failed: "attention",
  stuck: "attention",
  running: "running",
  done: "done",
};

function fleetGroupForStatus(status: ChatActivityStatus): FleetGroup {
  return STATUS_GROUP[status];
}

/**
 * The marker an opened row can acknowledge. Only a terminal run leaves one
 * behind: a running or waiting row disappears on its own once the run moves on.
 */
export function terminalAttentionId(
  activity: ChatActivity,
): string | undefined {
  return activity.status === "done" || activity.status === "failed"
    ? activity.attentionId
    : undefined;
}

/**
 * Joins the daemon activity projection with chat/project metadata. The status
 * is taken verbatim from the daemon — the renderer never re-derives it, so an
 * explicitly stopped run simply has no row rather than a `failed` one.
 */
export function buildFleetRows({
  activities,
  chats,
  projects,
}: {
  activities: ChatActivity[];
  chats: Chat[];
  projects: Project[];
}): FleetRow[] {
  const chatsById = new Map(chats.map((chat) => [chat.id, chat]));
  const projectsById = new Map(
    projects.map((project) => [project.id, project]),
  );
  const rows: FleetRow[] = [];

  for (const activity of activities) {
    const chat = chatsById.get(activity.chatId);
    // A chat the client has not loaded (or an archived one) has nothing to
    // open, so it stays out of the overview instead of rendering a blank row.
    if (chat === undefined || chat.archived) continue;

    const project = is.nonEmptyString(chat.projectId)
      ? projectsById.get(chat.projectId)
      : undefined;
    const worktreeCwd = chatWorktreeCwd(chat, project?.path);

    rows.push({
      chat,
      chatId: activity.chatId,
      group: fleetGroupForStatus(activity.status),
      failureMessage:
        activity.status === "failed" ? activity.failure.message : undefined,
      projectId: project?.id,
      projectName:
        project === undefined ? undefined : getProjectDisplayName(project.path),
      runId: activity.runId,
      runtime: chat.runtime,
      status: activity.status,
      terminalAttentionId: terminalAttentionId(activity),
      title: chat.title,
      updatedAt: activity.updatedAt,
      worktreeName: is.nonEmptyString(worktreeCwd)
        ? workspaceToolRootName(worktreeCwd)
        : undefined,
    });
  }

  return rows.sort(compareFleetRows);
}

function compareFleetRows(left: FleetRow, right: FleetRow): number {
  const byStatus = STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
  if (byStatus !== 0) return byStatus;
  if (left.updatedAt !== right.updatedAt) {
    return left.updatedAt < right.updatedAt ? 1 : -1;
  }
  return left.chatId < right.chatId ? -1 : left.chatId > right.chatId ? 1 : 0;
}

export function filterFleetRows(
  rows: FleetRow[],
  { projectFilter, segment }: { projectFilter: string; segment: FleetSegment },
): FleetRow[] {
  return rows.filter(
    (row) =>
      (segment === "all" || row.group === segment) &&
      matchesProjectFilter(row, projectFilter),
  );
}

function matchesProjectFilter(row: FleetRow, projectFilter: string): boolean {
  if (projectFilter === FLEET_PROJECT_FILTER_ALL) return true;
  if (projectFilter === FLEET_PROJECT_FILTER_STANDALONE) {
    return row.projectId === undefined;
  }
  return row.projectId === projectFilter;
}

/** Segment counts always reflect the active project filter, never the segment. */
export function countFleetRows(rows: FleetRow[]): FleetCounts {
  const counts: FleetCounts = { all: 0, attention: 0, done: 0, running: 0 };
  for (const row of rows) {
    counts.all += 1;
    counts[row.group] += 1;
  }
  return counts;
}

/**
 * Only projects that actually have activity are offered, so the filter never
 * lists options that would empty the page.
 */
export function fleetProjectOptions(
  rows: FleetRow[],
  labels: { allProjects: string; standalone: string },
): FleetProjectOption[] {
  const projectLabels = new Map<string, string>();
  let hasStandalone = false;

  for (const row of rows) {
    if (row.projectId === undefined) {
      hasStandalone = true;
      continue;
    }
    projectLabels.set(row.projectId, row.projectName ?? row.projectId);
  }

  const options: FleetProjectOption[] = [
    { label: labels.allProjects, value: FLEET_PROJECT_FILTER_ALL },
  ];
  const sorted = [...projectLabels.entries()].sort((left, right) =>
    left[1].localeCompare(right[1]),
  );
  for (const [value, label] of sorted) options.push({ label, value });
  if (hasStandalone) {
    options.push({
      label: labels.standalone,
      value: FLEET_PROJECT_FILTER_STANDALONE,
    });
  }

  return options;
}

/** Keeps a removed project from stranding the page on an empty filter. */
export function resolveFleetProjectFilter(
  projectFilter: string,
  options: FleetProjectOption[],
): string {
  return options.some((option) => option.value === projectFilter)
    ? projectFilter
    : FLEET_PROJECT_FILTER_ALL;
}

export function groupFleetRows(
  rows: FleetRow[],
): Array<{ group: FleetGroup; rows: FleetRow[] }> {
  const groups: FleetGroup[] = ["attention", "running", "done"];
  return groups
    .map((group) => ({
      group,
      rows: rows.filter((row) => row.group === group),
    }))
    .filter((section) => section.rows.length > 0);
}
