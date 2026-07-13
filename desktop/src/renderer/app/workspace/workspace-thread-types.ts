import type { AgentRuntime } from "@angel-engine/daemon-api/agents";
import type {
  Chat,
  ChatHistoryMessage,
  ChatRuntimeConfig,
} from "@angel-engine/daemon-api/chat";

export const EMPTY_MESSAGES: ChatHistoryMessage[] = [];

export interface DraftAgentConfig {
  model?: string;
  mode?: string;
  permissionMode?: string;
  reasoningEffort?: string;
}

export interface ChatRunOrigin {
  config?: DraftAgentConfig;
  isDraft: boolean;
  runtime?: AgentRuntime;
  runtimePageKey: string;
}

export type ChatUpdateHandler = (
  chat: Chat,
  messages?: ChatHistoryMessage[],
  config?: ChatRuntimeConfig,
  origin?: ChatRunOrigin,
) => void;

export type ChatMessagesUpdateHandler = (
  chatId: string,
  messages: ChatHistoryMessage[],
  config?: ChatRuntimeConfig,
) => void;

export const EMPTY_DRAFT_AGENT_CONFIG: DraftAgentConfig = {};
