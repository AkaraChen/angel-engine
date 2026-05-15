import type {
  AppendMessage,
  AssistantRuntime,
  ExternalStoreAdapter,
  ThreadMessage,
} from "@assistant-ui/react";
import type { Chat, ChatHistoryMessage, ChatRuntimeConfig } from "@shared/chat";
import type { EngineMessage } from "@/features/chat/state/chat-run-store";

import { useExternalStoreRuntime } from "@assistant-ui/react";
import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
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
  historyMessages: ChatHistoryMessage[];
  historyRevision: number;
  model?: string;
  mode?: string;
  onChatCreated?: (chat: Chat) => void;
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
  historyMessages,
  historyRevision,
  model,
  mode,
  onChatCreated,
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
  const startRun = useChatRunStore((state) => state.startRun);
  const cancelRunForSlot = useChatRunStore((state) => state.cancelRun);
  const resolveElicitation = useChatRunStore(
    (state) => state.resolveElicitation,
  );
  const latestOptionsRef = useRef({
    chatId,
    model,
    mode,
    onChatCreated,
    onChatUpdated,
    prewarmId,
    projectId,
    permissionMode,
    reasoningEffort,
    runtime,
  });

  latestOptionsRef.current = {
    chatId,
    model,
    mode,
    onChatCreated,
    onChatUpdated,
    prewarmId,
    projectId,
    permissionMode,
    reasoningEffort,
    runtime,
  };

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
      const runConfig = message.runConfig?.custom;
      const modeOverride =
        typeof runConfig?.mode === "string" ? runConfig.mode : undefined;
      await startRun({
        callbacks: {
          onChatCreated: latestOptionsRef.current.onChatCreated,
          onChatUpdated: latestOptionsRef.current.onChatUpdated,
        },
        input: {
          chatId: latestOptionsRef.current.chatId,
          model: latestOptionsRef.current.model,
          mode: modeOverride ?? latestOptionsRef.current.mode,
          permissionMode: latestOptionsRef.current.permissionMode,
          prewarmId: latestOptionsRef.current.prewarmId,
          projectId: latestOptionsRef.current.projectId ?? undefined,
          reasoningEffort: latestOptionsRef.current.reasoningEffort,
          runtime: latestOptionsRef.current.runtime,
        },
        message,
        slotKey,
      });
    },
    [slotKey, startRun],
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
