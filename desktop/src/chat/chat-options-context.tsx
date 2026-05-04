import { createContext, useContext } from 'react';

import type { AgentRuntime, AgentValueOption } from '@/shared/agents';

export type ChatOptionsContextValue = {
  configLoading: boolean;
  model: string;
  modelOptions: AgentValueOption[];
  mode: string;
  modeOptions: AgentValueOption[];
  reasoningEffort: string;
  reasoningEffortOptions: AgentValueOption[];
  runtime: AgentRuntime;
  runtimeLocked: boolean;
  setModel: (model: string) => void;
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
