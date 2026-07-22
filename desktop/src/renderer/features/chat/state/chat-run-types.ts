import type {
  Chat,
  ChatElicitationResponse,
  ChatHistoryMessage,
  ChatHistoryMessagePart,
  ChatRuntimeConfig,
  ChatSendInput,
  ChatSendResult,
} from "@angel-engine/daemon-api/chat";
import type {
  AppendMessage,
  MessageStatus,
  ThreadMessage,
} from "@assistant-ui/react";

export type EngineMessage = ThreadMessage;

/**
 * Serializable metadata of an in-flight run. Effectful handles (abort
 * controller, stream controller, ...) live in `chat-run-handles.ts`, keyed by
 * `runId`.
 */
export interface ActiveRun {
  assistantMessageId: string;
  initialSlotKey: string;
  runId: string;
  startedAt: number;
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
  streamingAssistant?: undefined;
};

type StreamingChatRunSlot = BaseChatRunSlot & {
  activeRun: ActiveRun;
  status: "streaming";
  /**
   * The in-flight assistant message. Kept out of `messages` so stream deltas
   * replace one field while the transcript array stays reference-stable; it
   * merges into `messages` when the run finishes or cancels.
   */
  streamingAssistant: EngineMessage;
};

export type ChatRunSlot = IdleChatRunSlot | StreamingChatRunSlot;

/**
 * Consumer-facing attention view. `completed` is event-marked; `needsInput`
 * is derived from slot content (an open elicitation in a streaming slot), so
 * it has a single source of truth and clears itself when input arrives.
 */
export interface ChatAttentionState {
  completed: boolean;
  needsInput: boolean;
}

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
  /** Chats (excluding the active one) whose background run completed. */
  completedChats: Record<string, true>;
  /**
   * Single-hop redirects from a retired draft slot key to the chat id its run
   * moved to. A slot re-keys at most once (draft -> chat id), so no chains.
   */
  draftRedirects: Record<string, string>;
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
  startRun: (input: StartRunInput) => Promise<void>;
}

export type ChatRunContext = Pick<
  ChatRunStore,
  "activeChatId" | "completedChats" | "draftRedirects" | "slots"
>;

export type ChatRunEvent =
  | { chatId?: string; type: "activeChat.changed" }
  | { chatId: string; type: "chat.completed" }
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
  | {
      chat: Chat;
      initialSlotKey: string;
      runId: string;
      slotKey: string;
      type: "run.movedToChat";
    }
  | {
      assistantMessage: EngineMessage;
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
