import type { AgentSkillsInput } from "@angel-engine/daemon-api/agents";
import { homedir } from "node:os";

import path from "node:path";

import { listAgentSkillsFromDirs } from "@angel-engine/client-napi";
import {
  AGENT_OPTIONS,
  isBuiltinAgentRuntime,
} from "@angel-engine/daemon-api/agents";

export interface AgentSkillDiscoveryRequest {
  globalDirs: string[];
  projectPath?: string | null;
  projectRelativeDirs: string[];
}

export function createAgentSkillDiscoveryRequest(
  input: AgentSkillsInput,
  homeDirectory = homedir(),
): AgentSkillDiscoveryRequest | null {
  if (!isBuiltinAgentRuntime(input.runtime)) {
    return null;
  }

  const rules = AGENT_OPTIONS.find(
    (agent) => agent.id === input.runtime,
  )?.skillDirectories;
  if (!rules) {
    return null;
  }

  return {
    globalDirs: rules.globalDirs.map((dir) =>
      expandHomePath(dir, homeDirectory),
    ),
    projectPath: input.projectPath ?? null,
    projectRelativeDirs: rules.projectRelativeDirs,
  };
}

export function listSkillsForAgent(input: AgentSkillsInput) {
  const request = createAgentSkillDiscoveryRequest(input);
  return request ? listAgentSkillsFromDirs(request) : [];
}

function expandHomePath(value: string, homeDirectory: string): string {
  if (value === "~") {
    return homeDirectory;
  }
  if (value.startsWith("~/")) {
    return path.join(homeDirectory, value.slice(2));
  }
  return value;
}
