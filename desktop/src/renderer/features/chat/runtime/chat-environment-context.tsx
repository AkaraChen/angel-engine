import type {
  ChatAvailableCommand,
  ChatAvailableSkill,
} from "@angel-engine/daemon-api/chat";

import { createContext, use } from "react";

export interface ChatEnvironmentContextValue {
  availableCommands: ChatAvailableCommand[];
  availableCommandsLoading: boolean;
  availableSkills: ChatAvailableSkill[];
  availableSkillsLoading: boolean;
  cwd?: string;
  isProjectChat: boolean;
  projectId?: string | null;
  projectPath?: string;
}

const EMPTY_COMMANDS: ChatAvailableCommand[] = [];
const EMPTY_SKILLS: ChatAvailableSkill[] = [];

const ChatEnvironmentContext = createContext<ChatEnvironmentContextValue>({
  availableCommands: EMPTY_COMMANDS,
  availableCommandsLoading: false,
  availableSkills: EMPTY_SKILLS,
  availableSkillsLoading: false,
  isProjectChat: false,
});

export const ChatEnvironmentProvider = ChatEnvironmentContext.Provider;

export function useChatEnvironment(): ChatEnvironmentContextValue {
  return use(ChatEnvironmentContext);
}
