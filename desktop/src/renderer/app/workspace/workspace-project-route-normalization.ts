import type { Project } from "@angel-engine/daemon-api/projects";

import { projectDraftRoutePath } from "@/app/workspace/workspace-route-paths";

interface ResolveProjectDraftRedirectOptions {
  isDraftPage: boolean;
  isProjectMode: boolean;
  projects: Project[];
  projectsQuerySucceeded: boolean;
  requestedProjectId?: string;
  resolvedProjectId?: string;
}

export interface ProjectDraftRedirect {
  path: string;
  reason: "projectless" | "stale";
}

export function resolveProjectDraftRedirect({
  isDraftPage,
  isProjectMode,
  projects,
  projectsQuerySucceeded,
  requestedProjectId,
  resolvedProjectId,
}: ResolveProjectDraftRedirectOptions): ProjectDraftRedirect | undefined {
  const fallbackProject = projects[0];
  if (
    !isProjectMode ||
    !isDraftPage ||
    !projectsQuerySucceeded ||
    resolvedProjectId !== undefined ||
    fallbackProject === undefined
  ) {
    return undefined;
  }

  return {
    path: projectDraftRoutePath(fallbackProject.id),
    reason: requestedProjectId === undefined ? "projectless" : "stale",
  };
}
