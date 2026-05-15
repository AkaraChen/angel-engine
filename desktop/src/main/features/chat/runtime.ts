import type {
  Chat,
  ChatCreateInput,
  ChatElicitationResponse,
  ChatLoadResult,
  ChatPrewarmInput,
  ChatPrewarmResult,
  ChatRuntimeConfig,
  ChatRuntimeConfigInput,
  ChatSendInput,
  ChatSendResult,
  ChatSetModeInput,
  ChatSetModeResult,
  ChatSetPermissionModeInput,
  ChatSetPermissionModeResult,
  ChatSetRuntimeInput,
  ChatStreamEvent,
} from "../../../shared/chat";

export interface ChatStreamControls {
  setResolveElicitation?: (
    handler: (
      elicitationId: string,
      response: ChatElicitationResponse,
    ) => Promise<void>,
  ) => void;
}

export interface ChatRuntime {
  closeChatSession: (chatId?: string) => void;
  createChatFromInput: (input: ChatCreateInput) => Chat;
  inspectChatRuntimeConfig: (
    input: ChatRuntimeConfigInput,
  ) => Promise<ChatRuntimeConfig>;
  loadChatSession: (chatId: string) => Promise<ChatLoadResult>;
  prewarmChat: (input: ChatPrewarmInput) => Promise<ChatPrewarmResult>;
  sendChat: (input: ChatSendInput) => Promise<ChatSendResult>;
  setChatMode: (input: ChatSetModeInput) => Promise<ChatSetModeResult>;
  setChatPermissionMode: (
    input: ChatSetPermissionModeInput,
  ) => Promise<ChatSetPermissionModeResult>;
  setChatRuntime: (input: ChatSetRuntimeInput) => Chat;
  streamChat: (
    input: ChatSendInput,
    onEvent: (event: ChatStreamEvent) => void,
    abortSignal: AbortSignal,
    controls?: ChatStreamControls,
  ) => Promise<ChatSendResult>;
}
