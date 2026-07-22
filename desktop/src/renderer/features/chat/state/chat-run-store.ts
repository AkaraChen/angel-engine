import type {
  ActiveRun,
  AssistantAccumulator,
  ChatRunContext,
  ChatRunStore,
} from "./chat-run-types";
import is from "@sindresorhus/is";
import { useSyncExternalStore } from "react";
import { getApiClient } from "@/platform/api-client";
import { createAssistantMessage } from "./chat-run-assistant";
import { getMessageAttachments } from "./chat-run-attachments";
import {
  appendMessageToEngineMessage,
  engineMessagesToHistoryMessages,
  getMessageText,
  historyMessageToEngineMessage,
} from "./chat-run-history";
import {
  cancelRunHandles,
  createRunHandles,
  disposeRunHandles,
  getRunHandles,
} from "./chat-run-handles";
import { normalizeElicitationResponse } from "./chat-run-parts";
import {
  chatAttentionForChat,
  isPermissionBypassEnabledForSlot,
  resolveSlotKey,
  selectSlot,
  slotMessagesWithStreaming,
  summarizeChatAttention,
} from "./chat-run-reducer";
import {
  finishRun,
  getActiveRunMessages,
  getChatRunContext,
  selectActiveRunForElicitation,
  sendChatRunEvent,
  subscribeChatRunActor,
} from "./chat-run-registry";
import { consumeRunStream } from "./chat-run-stream";
import { EMPTY_MESSAGES } from "./chat-run-types";

export {
  createAssistantMessage,
  materializeAssistantMessage,
} from "./chat-run-assistant";
export { appendToolActionDeltaPart } from "./chat-run-parts";
export { normalizeEnginePlanMessages } from "./chat-run-plan";
export type {
  AssistantMaterializationCache,
  ChatAttentionState,
  EngineMessage,
} from "./chat-run-types";

let cachedChatRunContext: ChatRunContext | undefined;
let cachedChatRunStore: ChatRunStore | undefined;

const chatRunActions: Omit<ChatRunStore, keyof ChatRunContext> = {
  cancelRun(slotKey) {
    const slot = selectSlot(getChatRunContext(), slotKey);
    if (!slot?.activeRun) return;

    // The slot machine's `streaming` exit action aborts the stream handles.
    sendChatRunEvent({ slotKey, type: "run.cancelled" });
  },
  dropAllRuns() {
    for (const slot of Object.values(getChatRunContext().slots)) {
      const activeRun = slot.activeRun;
      if (!activeRun) continue;
      cancelRunHandles(activeRun.runId);
    }
    sendChatRunEvent({ type: "slots.dropped" });
  },
  dropRun(slotKey) {
    const slot = selectSlot(getChatRunContext(), slotKey);
    if (slot?.activeRun) {
      cancelRunHandles(slot.activeRun.runId);
    }

    sendChatRunEvent({ slotKey, type: "slot.dropped" });
  },
  enablePermissionBypass(slotKey, response) {
    sendChatRunEvent({
      response,
      slotKey,
      type: "slot.permissionBypassEnabled",
    });
  },
  initializeSlot(input) {
    sendChatRunEvent({
      input,
      messages: input.historyMessages.map(historyMessageToEngineMessage),
      type: "slot.initialized",
    });
  },
  resolveElicitation(slotKey, payload, toolCallId, elicitationId) {
    const response = normalizeElicitationResponse(payload);
    if (!response) return;

    const activeRun = selectActiveRunForElicitation(
      getChatRunContext(),
      slotKey,
      toolCallId,
      elicitationId,
    );
    const handles = activeRun ? getRunHandles(activeRun.runId) : undefined;
    handles?.resolveElicitationLocally?.(toolCallId, response);
    void handles?.streamController?.resolveElicitation({
      elicitationId: elicitationId ?? toolCallId,
      response,
    });
  },
  setActiveChatId(chatId) {
    sendChatRunEvent({
      chatId: is.nonEmptyString(chatId) ? chatId : undefined,
      type: "activeChat.changed",
    });
  },
  async setMode(slotKey, mode) {
    const state = getChatRunContext();
    const resolvedKey = resolveSlotKey(state, slotKey);
    const slot = state.slots[resolvedKey];
    const chatId = slot?.chatId ?? resolvedKey;
    const result = await getApiClient().chats.setMode({ chatId, mode });
    sendChatRunEvent({
      chat: result.chat,
      config: result.config,
      slotKey: resolvedKey,
      type: "slot.configUpdated",
    });
    return result.config;
  },
  async setPermissionMode(slotKey, mode) {
    const state = getChatRunContext();
    const resolvedKey = resolveSlotKey(state, slotKey);
    const slot = state.slots[resolvedKey];
    const chatId = slot?.chatId ?? resolvedKey;
    const result = await getApiClient().chats.setPermissionMode({
      chatId,
      mode,
    });
    sendChatRunEvent({
      chat: result.chat,
      config: result.config,
      slotKey: resolvedKey,
      type: "slot.configUpdated",
    });
    return result.config;
  },
  async startRun({ callbacks, input, message, slotKey }) {
    const prompt = getMessageText(message);
    const attachments = getMessageAttachments(message);
    if (!prompt && attachments.length === 0) return;

    const assistantMessageId = createId("assistant");
    const runId = createId("run");
    const startedAt = performance.now();
    const activeRun: ActiveRun = {
      assistantMessageId,
      initialSlotKey: slotKey,
      runId,
      startedAt,
    };
    const handles = createRunHandles(runId);
    const accumulator: AssistantAccumulator = {
      chunkCount: 0,
      parts: [],
      status: { type: "running" },
    };
    const assistantMessage = createAssistantMessage(
      assistantMessageId,
      accumulator,
      startedAt,
    );
    const userMessage = appendMessageToEngineMessage(message, createId("user"));
    let runSlotKey = slotKey;

    const state = getChatRunContext();
    const resolvedKey = resolveSlotKey(state, slotKey);
    const existing = state.slots[resolvedKey];
    if (existing?.activeRun) {
      cancelRunHandles(existing.activeRun.runId);
      disposeRunHandles(existing.activeRun.runId);
    }
    runSlotKey = resolvedKey;
    sendChatRunEvent({
      activeRun,
      assistantMessage,
      slotKey,
      type: "run.started",
      userMessage,
    });

    const completion = await consumeRunStream({
      activeRun,
      accumulator,
      handles,
      input: {
        ...input,
        attachments,
        text: prompt,
      },
      onChatCreated: callbacks?.onChatCreated,
      slotKey: runSlotKey,
    });
    const finalMessages = getActiveRunMessages(completion.slotKey, runId);
    const historyMessages = engineMessagesToHistoryMessages(finalMessages);

    try {
      if (!handles.cancelled) {
        if (completion.result) {
          callbacks?.onChatUpdated?.(
            completion.result.chat,
            historyMessages,
            completion.result.config,
          );
        } else {
          callbacks?.onChatMessagesUpdated?.(
            completion.slotKey,
            historyMessages,
          );
        }
      }
    } finally {
      finishRun(
        completion.slotKey,
        runId,
        completion.assistantMessage,
        completion.result,
      );
      disposeRunHandles(runId);
    }
  },
};

export function useChatRunStore<T>(selector: (state: ChatRunStore) => T): T {
  return useSyncExternalStore(
    subscribeChatRunActor,
    () => selector(getChatRunStore()),
    () => selector(getChatRunStore()),
  );
}

export function useChatRunMessages(slotKey: string) {
  return useChatRunStore((state) => {
    const slot = selectSlot(state, slotKey);
    return slot ? slotMessagesWithStreaming(slot) : EMPTY_MESSAGES;
  });
}

export function useChatRunIsRunning(slotKey?: string) {
  return useChatRunStore((state) =>
    is.nonEmptyString(slotKey)
      ? selectSlot(state, slotKey)?.status === "streaming"
      : false,
  );
}

export function useChatRunConfig(slotKey?: string) {
  return useChatRunStore((state) =>
    is.nonEmptyString(slotKey) ? selectSlot(state, slotKey)?.config : undefined,
  );
}

export function useChatAttention(chatId: string) {
  return useChatRunStore((state) => chatAttentionForChat(state, chatId));
}

export function useChatAttentionSummary() {
  return useChatRunStore((state) => summarizeChatAttention(state));
}

export function useChatPermissionBypassEnabled(slotKey: string) {
  return useChatRunStore((state) =>
    isPermissionBypassEnabledForSlot(state, slotKey),
  );
}

export function cancelChatRun(slotKey: string) {
  chatRunActions.dropRun(slotKey);
}

export function cancelAllChatRuns() {
  chatRunActions.dropAllRuns();
}

export function setActiveChatRunId(chatId?: string) {
  chatRunActions.setActiveChatId(chatId);
}

function getChatRunStore(): ChatRunStore {
  const context = getChatRunContext();
  if (cachedChatRunContext === context && cachedChatRunStore) {
    return cachedChatRunStore;
  }

  cachedChatRunContext = context;
  cachedChatRunStore = {
    ...context,
    ...chatRunActions,
  };
  return cachedChatRunStore;
}

function createId(prefix: string) {
  const id =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${id}`;
}
