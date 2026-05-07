import type {
  AppendMessage,
  CompleteAttachment,
  MessageStatus,
  ThreadMessage,
} from "@assistant-ui/react";
import { useSyncExternalStore } from "react";
import { assign, createActor, setup } from "xstate";

import { streamChatEvents } from "@/lib/chat-stream";
import type {
  Chat,
  ChatAttachmentInput,
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
  imageDataUrl,
  isChatToolAction,
  parseDataUrl,
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

type BaseChatRunSlot = {
  chatId?: string;
  config?: ChatRuntimeConfig;
  historyRevision: number;
  key: string;
  messages: EngineMessage[];
};

type IdleChatRunSlot = BaseChatRunSlot & {
  activeRun?: undefined;
  status: "idle";
};

type StreamingChatRunSlot = BaseChatRunSlot & {
  activeRun: ActiveRun;
  status: "streaming";
};

type ChatRunSlot = IdleChatRunSlot | StreamingChatRunSlot;

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

type ChatRunContext = Pick<ChatRunStore, "aliases" | "slots">;

type ChatRunEvent =
  | {
      input: InitializeSlotInput;
      messages: EngineMessage[];
      type: "slot.initialized";
    }
  | { slotKey: string; type: "run.cancelled" }
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

const chatRunMachine = setup({
  types: {} as {
    context: ChatRunContext;
    events: ChatRunEvent;
  },
}).createMachine({
  context: {
    aliases: {},
    slots: {},
  },
  id: "chatRunRegistry",
  initial: "ready",
  states: {
    ready: {
      on: {
        "assistant.replaced": {
          actions: assign(({ context, event }) =>
            replaceAssistantMessageContext(context, event),
          ),
        },
        "run.cancelled": {
          actions: assign(({ context, event }) =>
            cancelRunContext(context, event.slotKey),
          ),
        },
        "run.finished": {
          actions: assign(({ context, event }) =>
            finishRunContext(context, event),
          ),
        },
        "run.movedToChat": {
          actions: assign(({ context, event }) =>
            moveActiveRunToChatContext(context, event),
          ),
        },
        "run.started": {
          actions: assign(({ context, event }) =>
            startRunContext(context, event),
          ),
        },
        "slot.dropped": {
          actions: assign(({ context, event }) =>
            dropRunContext(context, event.slotKey),
          ),
        },
        "slot.initialized": {
          actions: assign(({ context, event }) =>
            initializeSlotContext(context, event.input, event.messages),
          ),
        },
        "slots.dropped": {
          actions: assign(() => ({ aliases: {}, slots: {} })),
        },
      },
    },
  },
});

const chatRunActor = createActor(chatRunMachine).start();
let cachedChatRunContext: ChatRunContext | undefined;
let cachedChatRunStore: ChatRunStore | undefined;

const chatRunActions: Omit<ChatRunStore, "aliases" | "slots"> = {
  cancelRun(slotKey) {
    const state = getChatRunContext();
    const slot = selectSlot(state, slotKey);
    const activeRun = slot?.activeRun;
    if (!activeRun) return;

    activeRun.cancelled = true;
    activeRun.abortController.abort();
    chatRunActor.send({ slotKey, type: "run.cancelled" });
  },
  dropAllRuns() {
    for (const slot of Object.values(getChatRunContext().slots)) {
      const activeRun = slot.activeRun;
      if (!activeRun) continue;
      activeRun.cancelled = true;
      activeRun.abortController.abort();
    }
    chatRunActor.send({ type: "slots.dropped" });
  },
  dropRun(slotKey) {
    const slot = selectSlot(getChatRunContext(), slotKey);
    if (slot?.activeRun) {
      slot.activeRun.cancelled = true;
      slot.activeRun.abortController.abort();
    }

    chatRunActor.send({ slotKey, type: "slot.dropped" });
  },
  initializeSlot(input) {
    chatRunActor.send({
      input,
      messages: input.historyMessages.map(historyMessageToEngineMessage),
      type: "slot.initialized",
    });
  },
  resolveElicitation(slotKey, payload, toolCallId) {
    const response = normalizeElicitationResponse(payload);
    if (!response) return;

    const slot = selectSlot(getChatRunContext(), slotKey);
    void slot?.activeRun?.streamController?.resolveElicitation({
      elicitationId: toolCallId,
      response,
    });
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
    chatRunActor.send({
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
    slotKey ? selectSlot(state, slotKey)?.status === "streaming" : false,
  );
}

export function useChatRunConfig(slotKey?: string) {
  return useChatRunStore((state) =>
    slotKey ? selectSlot(state, slotKey)?.config : undefined,
  );
}

export function cancelChatRun(slotKey: string) {
  chatRunActions.dropRun(slotKey);
}

export function cancelAllChatRuns() {
  chatRunActions.dropAllRuns();
}

function subscribeChatRunActor(onStoreChange: () => void) {
  const subscription = chatRunActor.subscribe(() => onStoreChange());
  return () => subscription.unsubscribe();
}

function getChatRunContext(): ChatRunContext {
  return chatRunActor.getSnapshot().context;
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

function initializeSlotContext(
  state: ChatRunContext,
  input: InitializeSlotInput,
  messages: EngineMessage[],
): Partial<ChatRunContext> {
  const resolvedKey = resolveSlotKey(state, input.slotKey);
  const existing = state.slots[resolvedKey];
  const isDraftSlot = !input.chatId;

  if (
    isDraftSlot &&
    state.aliases[input.slotKey] &&
    !isSlotStreaming(existing)
  ) {
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

  if (isSlotStreaming(existing)) {
    const nextChatId = input.chatId ?? existing.chatId;
    const nextConfig = input.config ?? existing.config;
    if (nextChatId === existing.chatId && nextConfig === existing.config) {
      return {};
    }

    return {
      slots: {
        ...state.slots,
        [resolvedKey]: {
          ...existing,
          chatId: nextChatId,
          config: nextConfig,
        },
      },
    };
  }

  if (
    existing &&
    existing.historyRevision === input.historyRevision &&
    existing.config === input.config &&
    existing.chatId === (input.chatId ?? existing.chatId)
  ) {
    return {};
  }

  return {
    slots: {
      ...state.slots,
      [resolvedKey]: createIdleSlot(resolvedKey, input, messages, existing),
    },
  };
}

function startRunContext(
  state: ChatRunContext,
  event: Extract<ChatRunEvent, { type: "run.started" }>,
): Partial<ChatRunContext> {
  const resolvedKey = resolveSlotKey(state, event.slotKey);
  const existing =
    state.slots[resolvedKey] ??
    createIdleSlot(resolvedKey, {
      historyRevision: 0,
      slotKey: resolvedKey,
    });
  const existingMessages = existing.activeRun
    ? markAssistantMessageCancelled(
        existing.messages,
        existing.activeRun.assistantMessageId,
      )
    : existing.messages;

  return {
    slots: {
      ...state.slots,
      [resolvedKey]: {
        ...existing,
        activeRun: event.activeRun,
        messages: [
          ...existingMessages,
          event.userMessage,
          event.assistantMessage,
        ],
        status: "streaming",
      },
    },
  };
}

function cancelRunContext(
  state: ChatRunContext,
  slotKey: string,
): Partial<ChatRunContext> {
  const resolvedKey = resolveSlotKey(state, slotKey);
  const slot = state.slots[resolvedKey];
  const activeRun = slot?.activeRun;
  if (!slot || !activeRun) return {};

  return {
    slots: {
      ...state.slots,
      [resolvedKey]: {
        ...slot,
        activeRun: undefined,
        messages: markAssistantMessageCancelled(
          slot.messages,
          activeRun.assistantMessageId,
        ),
        status: "idle",
      },
    },
  };
}

function dropRunContext(
  state: ChatRunContext,
  slotKey: string,
): Partial<ChatRunContext> {
  const resolvedKey = resolveSlotKey(state, slotKey);
  const slots = { ...state.slots };
  delete slots[resolvedKey];

  const aliases = { ...state.aliases };
  for (const [alias, target] of Object.entries(aliases)) {
    if (alias === slotKey || alias === resolvedKey || target === resolvedKey) {
      delete aliases[alias];
    }
  }

  return { aliases, slots };
}

function replaceAssistantMessageContext(
  state: ChatRunContext,
  event: Extract<ChatRunEvent, { type: "assistant.replaced" }>,
): Partial<ChatRunContext> {
  const resolvedKey = resolveSlotKey(state, event.slotKey);
  const slot = state.slots[resolvedKey];
  if (slot?.activeRun?.runId !== event.runId) return {};

  return {
    slots: {
      ...state.slots,
      [resolvedKey]: {
        ...slot,
        messages: slot.messages.map((item) =>
          item.id === event.assistantMessageId ? event.message : item,
        ),
      },
    },
  };
}

function moveActiveRunToChatContext(
  state: ChatRunContext,
  event: Extract<ChatRunEvent, { type: "run.movedToChat" }>,
): Partial<ChatRunContext> {
  const resolvedKey = resolveSlotKey(state, event.slotKey);
  const slot = state.slots[resolvedKey];
  if (slot?.activeRun?.runId !== event.runId) return {};

  if (resolvedKey === event.chat.id) {
    return {
      slots: {
        ...state.slots,
        [resolvedKey]: {
          ...slot,
          chatId: event.chat.id,
        },
      },
    };
  }

  const slots = { ...state.slots };
  const existingTarget = slots[event.chat.id];
  delete slots[resolvedKey];
  slots[event.chat.id] = {
    ...slot,
    chatId: event.chat.id,
    config: slot.config ?? existingTarget?.config,
    key: event.chat.id,
  };

  return {
    aliases: {
      ...state.aliases,
      [slot.activeRun.initialSlotKey]: event.chat.id,
      [resolvedKey]: event.chat.id,
    },
    slots,
  };
}

function finishRunContext(
  state: ChatRunContext,
  event: Extract<ChatRunEvent, { type: "run.finished" }>,
): Partial<ChatRunContext> {
  const resolvedKey = resolveSlotKey(state, event.slotKey);
  const slot = state.slots[resolvedKey];
  if (slot?.activeRun?.runId !== event.runId) return {};

  return {
    slots: {
      ...state.slots,
      [resolvedKey]: {
        ...slot,
        activeRun: undefined,
        chatId: event.result?.chatId ?? slot.chatId,
        config: event.result?.config ?? slot.config,
        status: "idle",
      },
    },
  };
}

function isSlotStreaming(slot?: ChatRunSlot): slot is ChatRunSlot & {
  activeRun: ActiveRun;
  status: "streaming";
} {
  return slot?.status === "streaming" && Boolean(slot.activeRun);
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
    key,
    messages,
    status: "idle",
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
  const slot = selectSlot(getChatRunContext(), slotKey);
  if (slot?.activeRun?.runId !== runId) return false;

  chatRunActor.send({
    assistantMessageId,
    message,
    runId,
    slotKey,
    type: "assistant.replaced",
  });
  return true;
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
  const slot = selectSlot(getChatRunContext(), slotKey);
  if (slot?.activeRun?.runId !== runId) return slotKey;

  chatRunActor.send({
    chat,
    runId,
    slotKey,
    type: "run.movedToChat",
  });
  return chat.id;
}

function getActiveRunMessages(slotKey: string, runId: string) {
  const state = getChatRunContext();
  const slot = selectSlot(state, slotKey);
  return slot?.activeRun?.runId === runId ? slot.messages : EMPTY_MESSAGES;
}

function finishRun(slotKey: string, runId: string, result?: ChatSendResult) {
  chatRunActor.send({
    result,
    runId,
    slotKey,
    type: "run.finished",
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
    content: accumulator.parts
      .map(cloneChatHistoryPart)
      .map(historyPartToEngineMessagePart) as EngineMessage["content"],
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
  } as EngineMessage;
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
      content: content.map(historyPartToEngineMessagePart),
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

  if (message.role === "system") {
    return {
      content: [{ text: chatPartsText(content, "text"), type: "text" }],
      createdAt: normalizedCreatedAt,
      id: message.id,
      metadata: {
        custom: {},
      },
      role: "system",
    } as EngineMessage;
  }

  const userMessage = userHistoryMessageContentToEngineMessage(
    message.id,
    content,
  );

  return {
    attachments: userMessage.attachments,
    content: userMessage.content,
    createdAt: normalizedCreatedAt,
    id: message.id,
    metadata: {
      custom: {},
    },
    role: "user",
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
  const contentParts = engineMessageContentToHistoryParts(message.content);
  const attachmentParts = engineMessageAttachmentsToHistoryParts(
    message.attachments,
    contentParts,
  );
  return {
    content: [...contentParts, ...attachmentParts],
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
      case "image": {
        const imagePart = imageHistoryPartFromDataUrl(
          part.image,
          part.filename ?? null,
        );
        return imagePart ? [imagePart] : [];
      }
      case "file":
        return [fileHistoryPartFromMessagePart(part)];
      default:
        return [];
    }
  });
}

function historyPartToEngineMessagePart(
  part: ChatHistoryMessagePart,
): ThreadMessage["content"][number] {
  if (part.type !== "image" && part.type !== "file") {
    return part as ThreadMessage["content"][number];
  }

  if (part.type === "file") {
    return {
      data: part.data,
      filename: part.filename ?? undefined,
      mimeType: part.mimeType,
      type: "file",
    } as ThreadMessage["content"][number];
  }

  return {
    filename: part.filename ?? undefined,
    image: part.image,
    type: "image",
  } as ThreadMessage["content"][number];
}

function userHistoryMessageContentToEngineMessage(
  messageId: string,
  parts: ChatHistoryMessagePart[],
): {
  attachments: CompleteAttachment[];
  content: ThreadMessage["content"];
} {
  const attachments: CompleteAttachment[] = [];
  const content: ThreadMessage["content"][number][] = [];

  for (const [index, part] of parts.entries()) {
    if (part.type === "image") {
      attachments.push(historyImagePartToAttachment(messageId, index, part));
      continue;
    }
    if (part.type === "file") {
      attachments.push(historyFilePartToAttachment(messageId, index, part));
      continue;
    }

    content.push(historyPartToEngineMessagePart(part));
  }

  return {
    attachments,
    content: content as ThreadMessage["content"],
  };
}

function historyImagePartToAttachment(
  messageId: string,
  index: number,
  part: Extract<ChatHistoryMessagePart, { type: "image" }>,
): CompleteAttachment {
  return {
    content: [
      {
        filename: part.filename,
        image: part.image,
        type: "image",
      },
    ],
    contentType: part.mimeType,
    id: `${messageId}-attachment-${index}`,
    name: part.filename ?? "image",
    status: { type: "complete" },
    type: "image",
  };
}

function historyFilePartToAttachment(
  messageId: string,
  index: number,
  part: Extract<ChatHistoryMessagePart, { type: "file" }>,
): CompleteAttachment {
  return {
    content: [
      {
        data: part.data,
        filename: part.filename,
        mimeType: part.mimeType,
        type: "file",
      },
    ],
    contentType: part.mimeType,
    id: `${messageId}-attachment-${index}`,
    name: part.filename ?? "file",
    status: { type: "complete" },
    type: "file",
  };
}

function imageHistoryPartFromDataUrl(
  image: string,
  filename: string | null,
  options?: { fallbackMimeType?: string },
): ChatHistoryMessagePart | undefined {
  const parsed = parseImageDataUrl(image);
  if (!parsed && !options?.fallbackMimeType?.startsWith("image/")) {
    return undefined;
  }

  return {
    filename: filename ?? undefined,
    image: parsed ? imageDataUrl(parsed.data, parsed.mimeType) : image,
    mimeType: parsed?.mimeType ?? options?.fallbackMimeType,
    type: "image",
  };
}

function fileHistoryPartFromMessagePart(
  part: Extract<ThreadMessage["content"][number], { type: "file" }>,
): ChatHistoryMessagePart {
  const parsed = parseDataUrl(part.data);
  const mimeType = parsed?.mimeType ?? part.mimeType;
  const data = parsed?.data ?? part.data;
  if (mimeType.startsWith("image/")) {
    return {
      filename: part.filename ?? undefined,
      image: imageDataUrl(data, mimeType),
      mimeType,
      type: "image",
    };
  }
  return {
    data,
    filename: part.filename ?? undefined,
    mimeType,
    type: "file",
  };
}

function engineMessageAttachmentsToHistoryParts(
  attachments: ThreadMessage["attachments"] | undefined,
  existingParts: ChatHistoryMessagePart[],
): ChatHistoryMessagePart[] {
  const existingKeys = new Set(existingParts.map(historyPartKey));
  const parts: ChatHistoryMessagePart[] = [];

  for (const attachment of attachments ?? []) {
    for (const part of attachment.content ?? []) {
      const input = attachmentInputFromMessagePart(part, attachment.name);
      if (!input) continue;
      const historyPart = attachmentInputToHistoryPart(input);
      const key = historyPartKey(historyPart);
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      parts.push(historyPart);
    }
  }

  return parts;
}

function getMessageText(message: Pick<ThreadMessage, "content">) {
  return message.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n")
    .trim();
}

function getMessageAttachments(
  message: Pick<ThreadMessage, "attachments" | "content">,
): ChatAttachmentInput[] {
  const inputs: ChatAttachmentInput[] = [];

  for (const attachment of message.attachments ?? []) {
    for (const part of attachment.content ?? []) {
      const input = attachmentInputFromMessagePart(part, attachment.name);
      if (input) inputs.push(input);
    }
  }

  for (const part of message.content) {
    const input = attachmentInputFromMessagePart(part);
    if (input) inputs.push(input);
  }

  return inputs;
}

function attachmentInputFromMessagePart(
  part: ThreadMessage["content"][number],
  fallbackName?: string,
): ChatAttachmentInput | undefined {
  if (part.type === "image") {
    const parsed = parseImageDataUrl(part.image);
    if (!parsed) return undefined;
    return {
      data: parsed.data,
      mimeType: parsed.mimeType,
      name: part.filename ?? fallbackName ?? null,
      type: "image",
    };
  }

  if (part.type === "file" && part.mimeType.startsWith("image/")) {
    const parsed = parseDataUrl(part.data);
    if (!parsed && part.data.startsWith("data:")) return undefined;
    return {
      data: parsed?.data ?? part.data,
      mimeType: parsed?.mimeType ?? part.mimeType,
      name: part.filename ?? fallbackName ?? null,
      type: "image",
    };
  }

  if (part.type === "file") {
    const parsed = parseDataUrl(part.data);
    if (!parsed && part.data.startsWith("data:")) return undefined;
    return {
      data: parsed?.data ?? part.data,
      mimeType: parsed?.mimeType ?? part.mimeType,
      name: part.filename ?? fallbackName ?? null,
      type: "file",
    };
  }

  return undefined;
}

function attachmentInputToHistoryPart(
  input: ChatAttachmentInput,
): ChatHistoryMessagePart {
  if (input.type === "image") {
    return {
      filename: input.name ?? undefined,
      image: imageDataUrl(input.data, input.mimeType),
      mimeType: input.mimeType,
      type: "image",
    };
  }

  return {
    data: input.data,
    filename: input.name ?? undefined,
    mimeType: input.mimeType,
    type: "file",
  };
}

function historyPartKey(part: ChatHistoryMessagePart) {
  if (part.type === "image") return `image:${part.image}`;
  if (part.type === "file") return `file:${part.mimeType}:${part.data}`;
  return `${part.type}:${JSON.stringify(part)}`;
}

function parseImageDataUrl(
  value: string,
): { data: string; mimeType: string } | undefined {
  const parsed = parseDataUrl(value);
  const mimeType = parsed?.mimeType ?? "";
  const data = parsed?.data ?? "";
  if (!mimeType.startsWith("image/") || !data) return undefined;
  return { data, mimeType };
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
