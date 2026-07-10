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
import { normalizeElicitationResponse } from "./chat-run-parts";
import {
  isPermissionBypassEnabledForSlot,
  resolveSlotKey,
  selectSlot,
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
import { EMPTY_CHAT_ATTENTION, EMPTY_MESSAGES } from "./chat-run-types";

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
    const state = getChatRunContext();
    const slot = selectSlot(state, slotKey);
    const activeRun = slot?.activeRun;
    if (!activeRun) return;

    activeRun.cancelled = true;
    activeRun.abortController.abort();
    sendChatRunEvent({ slotKey, type: "run.cancelled" });
  },
  dropAllRuns() {
    for (const slot of Object.values(getChatRunContext().slots)) {
      const activeRun = slot.activeRun;
      if (!activeRun) continue;
      activeRun.cancelled = true;
      activeRun.abortController.abort();
    }
    sendChatRunEvent({ type: "slots.dropped" });
  },
  dropRun(slotKey) {
    const slot = selectSlot(getChatRunContext(), slotKey);
    if (slot?.activeRun) {
      slot.activeRun.cancelled = true;
      slot.activeRun.abortController.abort();
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
    activeRun?.resolveElicitationLocally?.(toolCallId, response);
    void activeRun?.streamController?.resolveElicitation({
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
      abortController: new AbortController(),
      assistantMessageId,
      autoApprovedPermissionIds: new Set(),
      cancelled: false,
      initialSlotKey: slotKey,
      runId,
      startedAt,
    };
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
      existing.activeRun.cancelled = true;
      existing.activeRun.abortController.abort();
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
      if (!activeRun.cancelled) {
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
      finishRun(completion.slotKey, runId, completion.result);
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
  return useChatRunStore(
    (state) => selectSlot(state, slotKey)?.messages ?? EMPTY_MESSAGES,
  );
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
  return useChatRunStore(
    (state) => state.attentions[chatId] ?? EMPTY_CHAT_ATTENTION,
  );
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
