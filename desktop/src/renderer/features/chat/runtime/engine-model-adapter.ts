import type {
  Chat,
  ChatCreationLocation,
  ChatHistoryMessage,
  ChatRuntimeConfig,
} from "@angel-engine/daemon-api/chat";
import type {
  AppendMessage,
  AssistantRuntime,
  ExternalStoreAdapter,
  ThreadMessage,
} from "@assistant-ui/react";
import type { EngineMessage } from "@/features/chat/state/chat-run-store";

import is from "@sindresorhus/is";
import { useExternalStoreRuntime } from "@assistant-ui/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { useSendChatMessage } from "@/features/chat/runtime/use-send-chat-message";
import {
  useChatRunIsRunning,
  useChatRunMessages,
  useChatRunStore,
} from "@/features/chat/state/chat-run-store";

type EngineRuntimeAdapters = NonNullable<
  ExternalStoreAdapter<EngineMessage>["adapters"]
>;

export interface EngineRuntimeOptions {
  adapters: EngineRuntimeAdapters;
  chatId?: string;
  creationLocation?: ChatCreationLocation;
  historyMessages: ChatHistoryMessage[];
  historyRevision: number;
  model?: string;
  mode?: string;
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
  prewarmId?: string;
  projectId?: string | null;
  permissionMode?: string;
  reasoningEffort?: string;
  runtime?: string;
  runtimeConfig?: ChatRuntimeConfig;
  slotKey: string;
}

export function useEngineRuntime({
  adapters,
  chatId,
  creationLocation,
  historyMessages,
  historyRevision,
  model,
  mode,
  onChatCreated,
  onChatMessagesUpdated,
  onChatUpdated,
  prewarmId,
  projectId,
  permissionMode,
  reasoningEffort,
  runtime,
  runtimeConfig,
  slotKey,
}: EngineRuntimeOptions): AssistantRuntime {
  const messages = useChatRunMessages(slotKey);
  const isRunning = useChatRunIsRunning(slotKey);
  const initializeSlot = useChatRunStore((state) => state.initializeSlot);
  const attachToActiveRun = useChatRunStore((state) => state.attachToActiveRun);
  const cancelRunForSlot = useChatRunStore((state) => state.cancelRun);
  const resolveElicitation = useChatRunStore(
    (state) => state.resolveElicitation,
  );

  const sendChatMessage = useSendChatMessage(slotKey, {
    chatId,
    creationLocation,
    model,
    mode,
    onChatCreated,
    onChatMessagesUpdated,
    onChatUpdated,
    permissionMode,
    prewarmId,
    projectId,
    reasoningEffort,
    runtime,
  });

  useLayoutEffect(() => {
    initializeSlot({
      chatId,
      config: runtimeConfig,
      historyMessages,
      historyRevision,
      slotKey,
    });
  }, [
    chatId,
    historyMessages,
    historyRevision,
    initializeSlot,
    runtimeConfig,
    slotKey,
  ]);

  // Mounting a chat — first open, chat switch back, renderer reload — attaches
  // an observer to whatever run the daemon is still executing. Unmounting only
  // detaches; the run keeps going.
  const attachCallbacksRef = useRef({ onChatMessagesUpdated, onChatUpdated });
  attachCallbacksRef.current = { onChatMessagesUpdated, onChatUpdated };
  useEffect(() => {
    if (!is.nonEmptyString(chatId)) return;
    attachToActiveRun(chatId, {
      onChatMessagesUpdated: (...args) =>
        attachCallbacksRef.current.onChatMessagesUpdated?.(...args),
      onChatUpdated: (...args) =>
        attachCallbacksRef.current.onChatUpdated?.(...args),
    });
  }, [attachToActiveRun, chatId]);

  const cancelRun = useCallback(async () => {
    cancelRunForSlot(slotKey);
  }, [cancelRunForSlot, slotKey]);

  const resumeToolCall = useCallback(
    ({ payload, toolCallId }: { payload: unknown; toolCallId: string }) => {
      resolveElicitation(slotKey, payload, toolCallId);
    },
    [resolveElicitation, slotKey],
  );

  const runMessage = useCallback(
    async (message: AppendMessage) => {
      await sendChatMessage.sendAppendMessage(message);
    },
    [sendChatMessage],
  );

  const store = useMemo<ExternalStoreAdapter<ThreadMessage>>(
    () => ({
      adapters,
      isRunning,
      messages,
      onCancel: cancelRun,
      onResumeToolCall: resumeToolCall,
      onNew: runMessage,
    }),
    [adapters, cancelRun, isRunning, messages, resumeToolCall, runMessage],
  );

  return useExternalStoreRuntime(store);
}
