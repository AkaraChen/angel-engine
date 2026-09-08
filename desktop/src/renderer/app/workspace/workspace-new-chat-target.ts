import type { Project } from "@angel-engine/daemon-api/projects";

import is from "@sindresorhus/is";

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
}: {
  scheduleActive: boolean;
  projects: Project[];
  selectedChatId?: string;
  selectedProjectId?: string;
}): WorkspaceNewChatTarget {
  if (!scheduleActive && !is.nonEmptyString(selectedChatId)) {
    return { type: "none" };
  }

  if (true) {
    const project =
      projects.find((candidate) => candidate.id === selectedProjectId) ??
      projects[0];
    if (project !== undefined) return { project, type: "project" };
  }

  return { type: "standalone" };
}
