import type { Chat, ChatHistoryMessage, ChatRuntimeConfig } from "@shared/chat";

export const EMPTY_MESSAGES: ChatHistoryMessage[] = [];

export interface DraftAgentConfig {
  model?: string;
  mode?: string;
  permissionMode?: string;
  reasoningEffort?: string;
}

export type ChatUpdateHandler = (
  chat: Chat,
  messages?: ChatHistoryMessage[],
  config?: ChatRuntimeConfig,
) => void;

export const EMPTY_DRAFT_AGENT_CONFIG: DraftAgentConfig = {};
