import { createContext, useContext } from "react";

import type { AgentRuntime, AgentValueOption } from "@/shared/agents";

export type ChatOptionsContextValue = {
  canSetModel: boolean;
  canSetMode: boolean;
  canSetReasoningEffort: boolean;
  canSetRuntime: boolean;
  configLoading: boolean;
  model: string;
  modelOptions: AgentValueOption[];
  mode: string;
  modeOptions: AgentValueOption[];
  reasoningEffort: string;
  reasoningEffortOptions: AgentValueOption[];
  runtime: AgentRuntime;
  runtimeDisabledReason?: string;
  setModel: (model: string) => void;
  setMode: (mode: string) => Promise<void> | void;
  setReasoningEffort: (effort: string) => void;
  setRuntime: (runtime: AgentRuntime) => Promise<void> | void;
};

const ChatOptionsContext = createContext<ChatOptionsContextValue | null>(null);

export const ChatOptionsProvider = ChatOptionsContext.Provider;

export function useChatOptions(): ChatOptionsContextValue {
  const value = useContext(ChatOptionsContext);
  if (!value) {
    throw new Error("useChatOptions must be used inside ChatOptionsProvider.");
  }
  return value;
}
