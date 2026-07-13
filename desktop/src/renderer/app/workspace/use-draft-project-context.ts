import type { Project } from "@angel-engine/daemon-api/projects";

import is from "@sindresorhus/is";
import { useMemo } from "react";
import { getProjectDisplayName } from "@/app/workspace/workspace-display";

export interface DraftProjectContext {
  id?: string;
  name?: string;
  path?: string;
  project?: Project;
}

export function useDraftProjectContext(
  projects: Project[],
  projectId?: string,
): DraftProjectContext {
  return useMemo(() => {
    const project = is.nonEmptyString(projectId)
      ? projects.find((item) => item.id === projectId)
      : undefined;
    const path = project?.path;

    return {
      id: project?.id,
      name: is.nonEmptyString(path) ? getProjectDisplayName(path) : undefined,
      path,
      project,
    };
  }, [projectId, projects]);
}
