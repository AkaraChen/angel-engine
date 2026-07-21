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
} from "@angel-engine/daemon-api/chat";
import type { Effect } from "effect";
import type { Db } from "../../platform/db";
import type { DaemonError } from "../../platform/errors";

export interface ChatStreamControls {
  setResolveElicitation?: (
    handler: (
      elicitationId: string,
      response: ChatElicitationResponse,
    ) => Promise<void>,
  ) => void;
}

/**
 * The chat engine's operation surface. Every operation is an Effect that fails
 * with `DaemonError`; the transport runs them on the daemon runtime.
 */
export interface ChatRuntime {
  closeChatSession: (chatId?: string) => Effect.Effect<void>;
  createChatFromInput: (
    input: ChatCreateInput,
  ) => Effect.Effect<Chat, DaemonError, Db>;
  inspectChatRuntimeConfig: (
    input: ChatRuntimeConfigInput,
  ) => Effect.Effect<ChatRuntimeConfig, DaemonError, Db>;
  loadChatSession: (
    chatId: string,
  ) => Effect.Effect<ChatLoadResult, DaemonError, Db>;
  prewarmChat: (
    input: ChatPrewarmInput,
  ) => Effect.Effect<ChatPrewarmResult, DaemonError, Db>;
  sendChat: (
    input: ChatSendInput,
  ) => Effect.Effect<ChatSendResult, DaemonError, Db>;
  setChatMode: (
    input: ChatSetModeInput,
  ) => Effect.Effect<ChatSetModeResult, DaemonError, Db>;
  setChatPermissionMode: (
    input: ChatSetPermissionModeInput,
  ) => Effect.Effect<ChatSetPermissionModeResult, DaemonError, Db>;
  setChatRuntime: (
    input: ChatSetRuntimeInput,
  ) => Effect.Effect<Chat, DaemonError, Db>;
  streamChat: (
    input: ChatSendInput,
    onEvent: (event: ChatStreamEvent) => void,
    abortSignal: AbortSignal,
    controls?: ChatStreamControls,
  ) => Effect.Effect<ChatSendResult, DaemonError, Db>;
}
