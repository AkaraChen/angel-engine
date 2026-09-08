import type { Project } from "@angel-engine/daemon-api/projects";
import type { WorkspaceMode } from "@/app/workspace/workspace-ui-store";

import is from "@sindresorhus/is";
import { isProjectWorkspaceMode } from "@/app/workspace/workspace-ui-store";

/**
 * What the sidebar's New Chat button starts. A draft route already shows the
 * composer, so the button is a no-op there; Schedule still needs to open one.
 */
export type WorkspaceNewChatTarget =
  | { project: Project; type: "project" }
  | { type: "none" }
  | { type: "standalone" };

export function resolveWorkspaceNewChatTarget({
  scheduleActive,
  projects,
  selectedChatId,
  selectedProjectId,
  workspaceMode,
}: {
  scheduleActive: boolean;
  projects: Project[];
  selectedChatId?: string;
  selectedProjectId?: string;
  workspaceMode: WorkspaceMode;
}): WorkspaceNewChatTarget {
  if (!scheduleActive && !is.nonEmptyString(selectedChatId)) {
    return { type: "none" };
  }

  if (isProjectWorkspaceMode(workspaceMode)) {
    const project =
      projects.find((candidate) => candidate.id === selectedProjectId) ??
      projects[0];
    if (project !== undefined) return { project, type: "project" };
  }

  return { type: "standalone" };
}
