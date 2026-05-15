import type { ChatAvailableCommand } from "@shared/chat";

import { createContext, useContext } from "react";

export interface ChatEnvironmentContextValue {
  availableCommands: ChatAvailableCommand[];
  availableCommandsLoading: boolean;
  isProjectChat: boolean;
  projectId?: string | null;
  projectPath?: string;
}

const EMPTY_COMMANDS: ChatAvailableCommand[] = [];

const ChatEnvironmentContext = createContext<ChatEnvironmentContextValue>({
  availableCommands: EMPTY_COMMANDS,
  availableCommandsLoading: false,
  isProjectChat: false,
});

export const ChatEnvironmentProvider = ChatEnvironmentContext.Provider;

export function useChatEnvironment(): ChatEnvironmentContextValue {
  return useContext(ChatEnvironmentContext);
}
