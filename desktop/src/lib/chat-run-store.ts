import type {
  AppendMessage,
  MessageStatus,
  ThreadMessage,
} from "@assistant-ui/react";
import { create } from "zustand";

import { streamChatEvents } from "@/lib/chat-stream";
import type {
  Chat,
  ChatElicitationResponse,
  ChatHistoryMessage,
  ChatHistoryMessagePart,
  ChatRuntimeConfig,
  ChatSendInput,
  ChatSendResult,
  ChatStreamController,
  ChatToolAction,
} from "@/shared/chat";
import {
  appendChatTextPart,
  chatPartsText,
  chatToolActionToPart,
  cloneChatHistoryPart,
  isChatToolAction,
} from "@/shared/chat";

const STREAM_FLUSH_MIN_CHARS = 24;
const STREAM_FLUSH_MAX_MS = 80;
const EMPTY_MESSAGES: EngineMessage[] = [];

export type EngineMessage = ThreadMessage;

type ActiveRun = {
  abortController: AbortController;
  assistantMessageId: string;
  cancelled: boolean;
  initialSlotKey: string;
  runId: string;
  startedAt: number;
  streamController?: ChatStreamController;
};

type ChatRunSlot = {
  activeRun?: ActiveRun;
  chatId?: string;
  config?: ChatRuntimeConfig;
  historyRevision: number;
  isRunning: boolean;
  key: string;
  messages: EngineMessage[];
};

type AssistantAccumulator = {
  chunkCount: number;
  error?: string;
  parts: ChatHistoryMessagePart[];
  result?: ChatSendResult;
  status: MessageStatus;
};

type RunCompletion = {
  assistantMessage: EngineMessage;
  result?: ChatSendResult;
  slotKey: string;
};

type InitializeSlotInput = {
  chatId?: string;
  config?: ChatRuntimeConfig;
  historyMessages: ChatHistoryMessage[];
  historyRevision: number;
  slotKey: string;
};

type StartRunInput = {
  callbacks?: {
    onChatCreated?: (chat: Chat) => void;
    onChatUpdated?: (
      chat: Chat,
      messages?: ChatHistoryMessage[],
      config?: ChatRuntimeConfig,
    ) => void;
  };
  input: Omit<ChatSendInput, "text">;
  message: AppendMessage;
  slotKey: string;
};

type ChatRunStore = {
  aliases: Record<string, string>;
  cancelRun: (slotKey: string) => void;
  dropAllRuns: () => void;
  dropRun: (slotKey: string) => void;
  initializeSlot: (input: InitializeSlotInput) => void;
  resolveElicitation: (
    slotKey: string,
    payload: unknown,
    toolCallId: string,
  ) => void;
  slots: Record<string, ChatRunSlot>;
  startRun: (input: StartRunInput) => Promise<void>;
};

export const useChatRunStore = create<ChatRunStore>((set, get) => ({
  aliases: {},
  cancelRun(slotKey) {
    const state = get();
    const resolvedKey = resolveSlotKey(state, slotKey);
    const slot = state.slots[resolvedKey];
    const activeRun = slot?.activeRun;
    if (!slot || !activeRun) return;

    activeRun.cancelled = true;
    activeRun.abortController.abort();
    set({
      slots: {
        ...state.slots,
        [resolvedKey]: {
          ...slot,
          activeRun: undefined,
          isRunning: false,
          messages: markAssistantMessageCancelled(
            slot.messages,
            activeRun.assistantMessageId,
          ),
        },
      },
    });
  },
  dropAllRuns() {
    for (const slot of Object.values(get().slots)) {
      const activeRun = slot.activeRun;
      if (!activeRun) continue;
      activeRun.cancelled = true;
      activeRun.abortController.abort();
    }
    set({ aliases: {}, slots: {} });
  },
  dropRun(slotKey) {
    const state = get();
    const resolvedKey = resolveSlotKey(state, slotKey);
    const slot = state.slots[resolvedKey];
    if (slot?.activeRun) {
      slot.activeRun.cancelled = true;
      slot.activeRun.abortController.abort();
    }

    const slots = { ...state.slots };
    delete slots[resolvedKey];

    const aliases = { ...state.aliases };
    for (const [alias, target] of Object.entries(aliases)) {
      if (
        alias === slotKey ||
        alias === resolvedKey ||
        target === resolvedKey
      ) {
        delete aliases[alias];
      }
    }

    set({ aliases, slots });
  },
  initializeSlot(input) {
    const messages = input.historyMessages.map(historyMessageToEngineMessage);
    set((state) => {
      const resolvedKey = resolveSlotKey(state, input.slotKey);
      const existing = state.slots[resolvedKey];
      const isDraftSlot = !input.chatId;

      if (isDraftSlot && state.aliases[input.slotKey] && !existing?.isRunning) {
        const aliases = { ...state.aliases };
        delete aliases[input.slotKey];
        return {
          aliases,
          slots: {
            ...state.slots,
            [input.slotKey]: createIdleSlot(input.slotKey, input, messages),
          },
        };
      }

      if (existing?.isRunning) {
        const nextChatId = input.chatId ?? existing.chatId;
        const nextConfig = input.config ?? existing.config;
        if (nextChatId === existing.chatId && nextConfig === existing.config) {
          return state;
        }

        const nextSlot = {
          ...existing,
          chatId: nextChatId,
          config: nextConfig,
        };
        return {
          slots: {
            ...state.slots,
            [resolvedKey]: nextSlot,
          },
        };
      }

      if (
        existing &&
        existing.historyRevision === input.historyRevision &&
        existing.config === input.config &&
        existing.chatId === (input.chatId ?? existing.chatId)
      ) {
        return state;
      }

      return {
        slots: {
          ...state.slots,
          [resolvedKey]: createIdleSlot(resolvedKey, input, messages, existing),
        },
      };
    });
  },
  resolveElicitation(slotKey, payload, toolCallId) {
    const response = normalizeElicitationResponse(payload);
    if (!response) return;

    const slot = selectSlot(get(), slotKey);
    void slot?.activeRun?.streamController?.resolveElicitation({
      elicitationId: toolCallId,
      response,
    });
  },
  slots: {},
  async startRun({ callbacks, input, message, slotKey }) {
    const prompt = getMessageText(message);
    if (!prompt) return;

    const assistantMessageId = createId("assistant");
    const runId = createId("run");
    const startedAt = performance.now();
    const activeRun: ActiveRun = {
      abortController: new AbortController(),
      assistantMessageId,
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

    set((state) => {
      const resolvedKey = resolveSlotKey(state, slotKey);
      const existing =
        state.slots[resolvedKey] ??
        createIdleSlot(resolvedKey, {
          historyRevision: 0,
          slotKey: resolvedKey,
        });
      if (existing.activeRun) {
        existing.activeRun.cancelled = true;
        existing.activeRun.abortController.abort();
      }
      const existingMessages = existing.activeRun
        ? markAssistantMessageCancelled(
            existing.messages,
            existing.activeRun.assistantMessageId,
          )
        : existing.messages;
      runSlotKey = resolvedKey;

      return {
        slots: {
          ...state.slots,
          [resolvedKey]: {
            ...existing,
            activeRun,
            isRunning: true,
            messages: [...existingMessages, userMessage, assistantMessage],
          },
        },
      };
    });

    const completion = await consumeRunStream({
      activeRun,
      accumulator,
      input: {
        ...input,
        text: prompt,
      },
      onChatCreated: callbacks?.onChatCreated,
      slotKey: runSlotKey,
    });
    const finalMessages = getActiveRunMessages(completion.slotKey, runId);

    try {
      if (!activeRun.cancelled && completion.result) {
        callbacks?.onChatUpdated?.(
          completion.result.chat,
          engineMessagesToHistoryMessages(finalMessages),
          completion.result.config,
        );
      }
    } finally {
      finishRun(completion.slotKey, runId, completion.result);
    }
  },
}));

export function useChatRunMessages(slotKey: string) {
  return useChatRunStore(
    (state) => selectSlot(state, slotKey)?.messages ?? EMPTY_MESSAGES,
  );
}

export function useChatRunIsRunning(slotKey?: string) {
  return useChatRunStore((state) =>
    slotKey ? Boolean(selectSlot(state, slotKey)?.isRunning) : false,
  );
}

export function useChatRunConfig(slotKey?: string) {
  return useChatRunStore((state) =>
    slotKey ? selectSlot(state, slotKey)?.config : undefined,
  );
}

export function cancelChatRun(slotKey: string) {
  useChatRunStore.getState().dropRun(slotKey);
}

export function cancelAllChatRuns() {
  useChatRunStore.getState().dropAllRuns();
}

function createIdleSlot(
  key: string,
  input: Pick<
    InitializeSlotInput,
    "chatId" | "config" | "historyRevision" | "slotKey"
  >,
  messages: EngineMessage[] = EMPTY_MESSAGES,
  existing?: ChatRunSlot,
): ChatRunSlot {
  return {
    chatId: input.chatId ?? existing?.chatId,
    config: input.config ?? existing?.config,
    historyRevision: input.historyRevision,
    isRunning: false,
    key,
    messages,
  };
}

async function consumeRunStream({
  activeRun,
  accumulator,
  input,
  onChatCreated,
  slotKey,
}: {
  activeRun: ActiveRun;
  accumulator: AssistantAccumulator;
  input: ChatSendInput;
  onChatCreated?: (chat: Chat) => void;
  slotKey: string;
}): Promise<RunCompletion> {
  let currentSlotKey = slotKey;
  let dirty = false;
  let pendingDeltaChars = 0;
  let lastFlushAt = performance.now();
  let currentAssistantMessage = createAssistantMessage(
    activeRun.assistantMessageId,
    accumulator,
    activeRun.startedAt,
  );

  const flush = async () => {
    if (!dirty) return true;

    const nextAssistantMessage = createAssistantMessage(
      activeRun.assistantMessageId,
      accumulator,
      activeRun.startedAt,
    );
    const flushed = replaceAssistantMessage(
      currentSlotKey,
      activeRun.runId,
      activeRun.assistantMessageId,
      nextAssistantMessage,
    );
    if (!flushed) return false;

    currentAssistantMessage = nextAssistantMessage;
    dirty = false;
    pendingDeltaChars = 0;
    lastFlushAt = performance.now();
    await yieldToRendererTask();
    return true;
  };

  try {
    for await (const event of streamChatEvents(
      input,
      activeRun.abortController.signal,
      (controller) => {
        activeRun.streamController = controller;
      },
    )) {
      if (activeRun.cancelled || event.type === "done") break;

      if (event.type === "chat") {
        currentSlotKey = moveActiveRunToChat(
          currentSlotKey,
          event.chat,
          activeRun.runId,
        );
        onChatCreated?.(event.chat);
        continue;
      }

      if (event.type === "error") {
        accumulator.error = event.message;
        accumulator.status = {
          error: event.message,
          reason: "error",
          type: "incomplete",
        };
        accumulator.parts = [
          {
            text: `Backend chat failed: ${event.message}`,
            type: "text",
          },
        ];
        dirty = true;
        await flush();
        return {
          assistantMessage: currentAssistantMessage,
          result: accumulator.result,
          slotKey: currentSlotKey,
        };
      }

      if (event.type === "result") {
        accumulator.result = event.result;
        if (accumulator.parts.length === 0) {
          accumulator.parts = event.result.content.map(cloneChatHistoryPart);
        }
        dirty = true;
        if (!(await flush())) break;
        continue;
      }

      accumulator.chunkCount += 1;
      if (event.type === "tool") {
        upsertToolActionPart(accumulator.parts, event.action);
      } else {
        appendChatTextPart(accumulator.parts, event.part, event.text);
        pendingDeltaChars += event.text.length;
      }
      dirty = true;

      const now = performance.now();
      if (
        pendingDeltaChars >= STREAM_FLUSH_MIN_CHARS ||
        now - lastFlushAt >= STREAM_FLUSH_MAX_MS
      ) {
        if (!(await flush())) break;
      }
    }

    accumulator.status = activeRun.cancelled
      ? { reason: "cancelled", type: "incomplete" }
      : { reason: "stop", type: "complete" };
    dirty = true;
    await flush();
  } catch (error) {
    if (activeRun.abortController.signal.aborted) {
      accumulator.status = { reason: "cancelled", type: "incomplete" };
      dirty = true;
      await flush();
      return {
        assistantMessage: currentAssistantMessage,
        result: accumulator.result,
        slotKey: currentSlotKey,
      };
    }

    const message = getErrorMessage(error);
    accumulator.error = message;
    accumulator.status = {
      error: message,
      reason: "error",
      type: "incomplete",
    };
    accumulator.parts = [
      {
        text: `Backend chat failed: ${message}`,
        type: "text",
      },
    ];
    dirty = true;
    await flush();
  }

  return {
    assistantMessage: currentAssistantMessage,
    result: accumulator.result,
    slotKey: currentSlotKey,
  };
}

function replaceAssistantMessage(
  slotKey: string,
  runId: string,
  assistantMessageId: string,
  message: EngineMessage,
) {
  let replaced = false;
  useChatRunStore.setState((state) => {
    const resolvedKey = resolveSlotKey(state, slotKey);
    const slot = state.slots[resolvedKey];
    if (slot?.activeRun?.runId !== runId) return state;

    replaced = true;
    return {
      slots: {
        ...state.slots,
        [resolvedKey]: {
          ...slot,
          messages: slot.messages.map((item) =>
            item.id === assistantMessageId ? message : item,
          ),
        },
      },
    };
  });
  return replaced;
}

function markAssistantMessageCancelled(
  messages: EngineMessage[],
  assistantMessageId: string,
): EngineMessage[] {
  return messages.map((message) =>
    message.id === assistantMessageId
      ? ({
          ...message,
          status: { reason: "cancelled", type: "incomplete" },
        } as EngineMessage)
      : message,
  );
}

function moveActiveRunToChat(slotKey: string, chat: Chat, runId: string) {
  let nextSlotKey = slotKey;
  useChatRunStore.setState((state) => {
    const resolvedKey = resolveSlotKey(state, slotKey);
    const slot = state.slots[resolvedKey];
    if (slot?.activeRun?.runId !== runId) return state;

    nextSlotKey = chat.id;
    if (resolvedKey === chat.id) {
      return {
        slots: {
          ...state.slots,
          [resolvedKey]: {
            ...slot,
            chatId: chat.id,
          },
        },
      };
    }

    const slots = { ...state.slots };
    const existingTarget = slots[chat.id];
    delete slots[resolvedKey];
    slots[chat.id] = {
      ...slot,
      chatId: chat.id,
      config: slot.config ?? existingTarget?.config,
      key: chat.id,
    };

    return {
      aliases: {
        ...state.aliases,
        [slot.activeRun.initialSlotKey]: chat.id,
        [resolvedKey]: chat.id,
      },
      slots,
    };
  });
  return nextSlotKey;
}

function getActiveRunMessages(slotKey: string, runId: string) {
  const state = useChatRunStore.getState();
  const slot = selectSlot(state, slotKey);
  return slot?.activeRun?.runId === runId ? slot.messages : EMPTY_MESSAGES;
}

function finishRun(slotKey: string, runId: string, result?: ChatSendResult) {
  useChatRunStore.setState((state) => {
    const resolvedKey = resolveSlotKey(state, slotKey);
    const slot = state.slots[resolvedKey];
    if (slot?.activeRun?.runId !== runId) return state;

    return {
      slots: {
        ...state.slots,
        [resolvedKey]: {
          ...slot,
          activeRun: undefined,
          chatId: result?.chatId ?? slot.chatId,
          config: result?.config ?? slot.config,
          isRunning: false,
        },
      },
    };
  });
}

function selectSlot(
  state: Pick<ChatRunStore, "aliases" | "slots">,
  key: string,
) {
  return state.slots[resolveSlotKey(state, key)];
}

function resolveSlotKey(
  state: Pick<ChatRunStore, "aliases" | "slots">,
  key: string,
) {
  let current = key;
  const seen = new Set<string>();

  while (state.aliases[current] && !seen.has(current)) {
    seen.add(current);
    current = state.aliases[current];
  }

  return current;
}

function upsertToolActionPart(
  parts: ChatHistoryMessagePart[],
  action: ChatToolAction,
) {
  const nextPart = chatToolActionToPart(action);
  const index = parts.findIndex(
    (part) =>
      part.type === "tool-call" && part.toolCallId === nextPart.toolCallId,
  );

  if (index === -1) {
    parts.push(nextPart);
    return;
  }

  parts[index] = nextPart;
}

function normalizeElicitationResponse(
  payload: unknown,
): ChatElicitationResponse | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const response = payload as Partial<ChatElicitationResponse>;

  switch (response.type) {
    case "allow":
    case "allowForSession":
    case "deny":
    case "cancel":
    case "externalComplete":
      return { type: response.type };
    case "answers":
      return Array.isArray(response.answers)
        ? {
            answers: response.answers
              .filter(
                (answer) =>
                  answer &&
                  typeof answer === "object" &&
                  typeof answer.id === "string" &&
                  typeof answer.value === "string",
              )
              .map((answer) => ({ id: answer.id, value: answer.value })),
            type: "answers",
          }
        : undefined;
    case "dynamicToolResult":
      return typeof response.success === "boolean"
        ? { success: response.success, type: "dynamicToolResult" }
        : undefined;
    case "raw":
      return typeof response.value === "string"
        ? { type: "raw", value: response.value }
        : undefined;
    default:
      return undefined;
  }
}

function createAssistantMessage(
  id: string,
  accumulator: AssistantAccumulator,
  startedAt: number,
): EngineMessage {
  const text = chatPartsText(accumulator.parts, "text");
  const toolCallCount = accumulator.parts.filter(
    (part) => part.type === "tool-call",
  ).length;

  return {
    content: accumulator.parts.map(cloneChatHistoryPart),
    createdAt: new Date(),
    id,
    metadata: {
      custom: {
        model: accumulator.result?.model ?? "angel-engine-client",
        turnId: accumulator.result?.turnId,
      },
      steps: [],
      timing: {
        streamStartTime: startedAt,
        tokenCount: Math.max(1, Math.round(text.length / 4)),
        toolCallCount,
        totalChunks: Math.max(1, accumulator.chunkCount),
        totalStreamTime: performance.now() - startedAt,
      },
      unstable_annotations: [],
      unstable_data: [],
      unstable_state: null,
    },
    role: "assistant",
    status: accumulator.status,
  };
}

function appendMessageToEngineMessage(
  message: AppendMessage,
  id: string,
): EngineMessage {
  return {
    ...message,
    attachments: message.attachments,
    content: message.content,
    createdAt: new Date(),
    id,
    metadata: message.metadata,
    role: message.role,
    status: message.status,
  } as EngineMessage;
}

function historyMessageToEngineMessage(
  message: ChatHistoryMessage,
): EngineMessage {
  const createdAt = message.createdAt ? new Date(message.createdAt) : undefined;
  const normalizedCreatedAt =
    createdAt && Number.isFinite(createdAt.getTime()) ? createdAt : new Date();
  const content = message.content.map(cloneChatHistoryPart);

  if (message.role === "assistant") {
    return {
      content,
      createdAt: normalizedCreatedAt,
      id: message.id,
      metadata: {
        custom: {},
        steps: [],
        unstable_annotations: [],
        unstable_data: [],
        unstable_state: null,
      },
      role: "assistant",
      status: {
        reason: "stop",
        type: "complete",
      },
    } as EngineMessage;
  }

  return {
    attachments: [],
    content:
      message.role === "system"
        ? [{ text: chatPartsText(content, "text"), type: "text" }]
        : content,
    createdAt: normalizedCreatedAt,
    id: message.id,
    metadata: {
      custom: {},
    },
    role: message.role,
  } as EngineMessage;
}

function engineMessagesToHistoryMessages(
  messages: EngineMessage[],
): ChatHistoryMessage[] {
  return messages
    .map(engineMessageToHistoryMessage)
    .filter((message) => message.content.length > 0);
}

function engineMessageToHistoryMessage(
  message: EngineMessage,
): ChatHistoryMessage {
  return {
    content: engineMessageContentToHistoryParts(message.content),
    createdAt: message.createdAt?.toISOString(),
    id: message.id,
    role: message.role,
  };
}

function engineMessageContentToHistoryParts(
  content: ThreadMessage["content"],
): ChatHistoryMessagePart[] {
  return content.flatMap((part) => {
    switch (part.type) {
      case "reasoning":
      case "text":
        return part.text.trim() ? [{ ...part }] : [];
      case "tool-call":
        return isChatToolAction(part.artifact)
          ? [cloneChatHistoryPart(chatToolActionToPart(part.artifact))]
          : [];
      default:
        return [];
    }
  });
}

function getMessageText(message: Pick<ThreadMessage, "content">) {
  return message.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n")
    .trim();
}

function yieldToRendererTask() {
  if (typeof MessageChannel === "function") {
    return new Promise<void>((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        channel.port2.close();
        resolve();
      };
      channel.port2.postMessage(undefined);
    });
  }

  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function createId(prefix: string) {
  const id =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${id}`;
}
