import type {
  Chat,
  ChatElicitationResponse,
  ChatHistoryMessage,
  ChatHistoryMessagePart,
  ChatRuntimeConfig,
  ChatSendInput,
  ChatSendResult,
  ChatStreamController,
} from "@angel-engine/daemon-api/chat";
import type {
  AppendMessage,
  MessageStatus,
  ThreadMessage,
} from "@assistant-ui/react";

export type EngineMessage = ThreadMessage;

export interface ActiveRun {
  abortController: AbortController;
  assistantMessageId: string;
  autoApprovedPermissionIds: Set<string>;
  cancelled: boolean;
  initialSlotKey: string;
  resolveElicitationLocally?: (
    elicitationId: string,
    response: ChatElicitationResponse,
  ) => void;
  runId: string;
  startedAt: number;
  streamController?: ChatStreamController;
}

interface BaseChatRunSlot {
  chatId?: string;
  config?: ChatRuntimeConfig;
  historyRevision: number;
  key: string;
  messages: EngineMessage[];
  permissionBypassEnabled: boolean;
  permissionBypassResponse: ChatElicitationResponse | undefined;
}

type IdleChatRunSlot = BaseChatRunSlot & {
  activeRun?: undefined;
  status: "idle";
};

type StreamingChatRunSlot = BaseChatRunSlot & {
  activeRun: ActiveRun;
  status: "streaming";
};

export type ChatRunSlot = IdleChatRunSlot | StreamingChatRunSlot;

export interface ChatAttentionState {
  completed: boolean;
  needsInput: boolean;
}

export type ChatAttentionKind = keyof ChatAttentionState;

export interface AssistantAccumulator {
  chunkCount: number;
  error?: string;
  parts: ChatHistoryMessagePart[];
  result?: ChatSendResult;
  status: MessageStatus;
}

export interface AssistantMaterializationCache {
  engineParts: EngineMessage["content"];
}

export interface RunCompletion {
  assistantMessage: EngineMessage;
  result?: ChatSendResult;
  slotKey: string;
}

export interface InitializeSlotInput {
  chatId?: string;
  config?: ChatRuntimeConfig;
  historyMessages: ChatHistoryMessage[];
  historyRevision: number;
  slotKey: string;
}

export interface StartRunInput {
  callbacks?: {
    onChatCreated?: (chat: Chat) => void;
    onChatMessagesUpdated?: (
      chatId: string,
      messages: ChatHistoryMessage[],
      config?: ChatRuntimeConfig,
    ) => void;
    onChatUpdated?: (
      chat: Chat,
      messages?: ChatHistoryMessage[],
      config?: ChatRuntimeConfig,
    ) => void;
  };
  input: Omit<ChatSendInput, "text">;
  message: AppendMessage;
  slotKey: string;
}

export interface ChatRunStore {
  activeChatId?: string;
  aliases: Record<string, string>;
  attentions: Record<string, ChatAttentionState>;
  cancelRun: (slotKey: string) => void;
  dropAllRuns: () => void;
  dropRun: (slotKey: string) => void;
  enablePermissionBypass: (
    slotKey: string,
    response: ChatElicitationResponse,
  ) => void;
  initializeSlot: (input: InitializeSlotInput) => void;
  resolveElicitation: (
    slotKey: string,
    payload: unknown,
    toolCallId: string,
    elicitationId?: string,
  ) => void;
  setActiveChatId: (chatId?: string) => void;
  setMode: (slotKey: string, mode: string) => Promise<ChatRuntimeConfig>;
  setPermissionMode: (
    slotKey: string,
    mode: string,
  ) => Promise<ChatRuntimeConfig>;
  slots: Record<string, ChatRunSlot>;
  startRun: (input: StartRunInput) => Promise<boolean>;
}

export type ChatRunContext = Pick<
  ChatRunStore,
  "activeChatId" | "aliases" | "attentions" | "slots"
>;

export type ChatRunEvent =
  | { chatId?: string; type: "activeChat.changed" }
  | { chatId: string; kind: ChatAttentionKind; type: "attention.marked" }
  | {
      input: InitializeSlotInput;
      messages: EngineMessage[];
      type: "slot.initialized";
    }
  | { slotKey: string; type: "run.cancelled" }
  | {
      response: ChatElicitationResponse;
      slotKey: string;
      type: "slot.permissionBypassEnabled";
    }
  | {
      chat: Chat;
      config: ChatRuntimeConfig;
      slotKey: string;
      type: "slot.configUpdated";
    }
  | { slotKey: string; type: "slot.dropped" }
  | { type: "slots.dropped" }
  | {
      activeRun: ActiveRun;
      assistantMessage: EngineMessage;
      slotKey: string;
      type: "run.started";
      userMessage: EngineMessage;
    }
  | {
      assistantMessageId: string;
      message: EngineMessage;
      runId: string;
      slotKey: string;
      type: "assistant.replaced";
    }
  | { chat: Chat; runId: string; slotKey: string; type: "run.movedToChat" }
  | {
      result?: ChatSendResult;
      runId: string;
      slotKey: string;
      type: "run.finished";
    };

export const EMPTY_MESSAGES: EngineMessage[] = [];
export const EMPTY_CHAT_ATTENTION: ChatAttentionState = {
  completed: false,
  needsInput: false,
};
export const COMPLETED_CHAT_ATTENTION: ChatAttentionState = {
  completed: true,
  needsInput: false,
};
export const NEEDS_INPUT_CHAT_ATTENTION: ChatAttentionState = {
  completed: false,
  needsInput: true,
};
export const COMPLETED_AND_NEEDS_INPUT_CHAT_ATTENTION: ChatAttentionState = {
  completed: true,
  needsInput: true,
};
