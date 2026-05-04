import { createContext, useContext } from 'react';

import type { AgentRuntime } from '@/shared/agents';

export type ChatOptionsContextValue = {
  mode: string;
  reasoningEffort: string;
  runtime: AgentRuntime;
  runtimeLocked: boolean;
  setMode: (mode: string) => void;
  setReasoningEffort: (effort: string) => void;
  setRuntime: (runtime: AgentRuntime) => void;
};

const ChatOptionsContext = createContext<ChatOptionsContextValue | null>(null);

export const ChatOptionsProvider = ChatOptionsContext.Provider;

export function useChatOptions() {
  const value = useContext(ChatOptionsContext);
  if (!value) {
    throw new Error('useChatOptions must be used inside ChatOptionsProvider.');
  }
  return value;
}
