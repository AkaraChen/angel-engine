import type { AgentRuntime, AgentValueOption } from "@/shared/agents";

import { createContext, useContext } from "react";

export interface ChatOptionsContextValue {
  canSetModel: boolean;
  canSetMode: boolean;
  canSetPermissionMode: boolean;
  canSetReasoningEffort: boolean;
  canSetRuntime: boolean;
  configLoading: boolean;
  model: string;
  modelOptionCount: number;
  modelOptions: AgentValueOption[];
  mode: string;
  modeOptionCount: number;
  modeOptions: AgentValueOption[];
  permissionMode: string;
  permissionModeOptionCount: number;
  permissionModeOptions: AgentValueOption[];
  reasoningEffort: string;
  reasoningEffortOptionCount: number;
  reasoningEffortOptions: AgentValueOption[];
  runtime: AgentRuntime;
  runtimeDisabledReason?: string;
  runtimeOptions: Array<{
    description?: string;
    label: string;
    value: AgentRuntime;
  }>;
  setModel: (model: string) => void;
  setMode: (mode: string) => Promise<void> | void;
  setPermissionMode: (mode: string) => Promise<void> | void;
  setReasoningEffort: (effort: string) => void;
  setRuntime: (runtime: AgentRuntime) => Promise<void> | void;
}

const ChatOptionsContext = createContext<ChatOptionsContextValue | null>(null);

export const ChatOptionsProvider = ChatOptionsContext.Provider;

export function useChatOptions(): ChatOptionsContextValue {
  const value = useContext(ChatOptionsContext);
  if (!value) {
    throw new Error("useChatOptions must be used inside ChatOptionsProvider.");
  }
  return value;
}
