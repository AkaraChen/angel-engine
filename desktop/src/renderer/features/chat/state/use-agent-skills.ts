import type { ChatAvailableSkill } from "@shared/chat";

import { useQuery } from "@tanstack/react-query";
import { agentSkillsQueryOptions } from "@/features/chat/api/queries";
import { useApi } from "@/platform/use-api";

const EMPTY_SKILLS: ChatAvailableSkill[] = [];

export interface UseAgentSkillsInput {
  projectPath?: string;
  runtime?: string;
}

/**
 * Skills discovered from the JS-registered skill directories on disk (no agent
 * process involved), scoped to the project when one is associated.
 */
export function useAgentSkills({ projectPath, runtime }: UseAgentSkillsInput) {
  const api = useApi();
  const skillsQuery = useQuery(
    agentSkillsQueryOptions({
      api,
      projectPath: projectPath ?? null,
      runtime: runtime ?? null,
    }),
  );

  return {
    availableSkills: skillsQuery.data ?? EMPTY_SKILLS,
    availableSkillsLoading: skillsQuery.isLoading,
  };
}
