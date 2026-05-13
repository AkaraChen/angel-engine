import type {
  AppendMessage,
  CompleteAttachment,
  MessageStatus,
  ThreadMessage,
} from "@assistant-ui/react";
import { useSyncExternalStore } from "react";
import { assign, createActor, setup } from "xstate";

import { streamChatEvents } from "@/features/chat/api/chat-stream";
import { getApiClient } from "@/platform/api-client";
import type {
  Chat,
  ChatAttachmentInput,
  ChatElicitation,
  ChatElicitationResponse,
  ChatHistoryMessage,
  ChatHistoryMessagePart,
  ChatPlanData,
  ChatRuntimeConfig,
  ChatSendInput,
  ChatSendResult,
  ChatStreamController,
  ChatToolAction,
  ChatToolActionPhase,
} from "@/shared/chat";
import {
  appendChatTextPart,
  chatPlanPartName,
  chatPartsText,
  chatToolActionToPart,
  cloneChatPlanData,
  cloneChatHistoryPart,
  imageDataUrl,
  isChatElicitationData,
  isChatPlanData,
  isChatPlanPart,
  isTerminalChatToolPhase,
  isChatToolAction,
  normalizeChatPlanMessages,
  parseDataUrl,
  upsertChatElicitationPart,
} from "@/shared/chat";

const STREAM_FLUSH_MIN_CHARS = 24;
const STREAM_FLUSH_MAX_MS = 80;
const EMPTY_MESSAGES: EngineMessage[] = [];
const EMPTY_CHAT_ATTENTION: ChatAttentionState = {
  completed: false,
  needsInput: false,
};
const COMPLETED_CHAT_ATTENTION: ChatAttentionState = {
  completed: true,
  needsInput: false,
};
const NEEDS_INPUT_CHAT_ATTENTION: ChatAttentionState = {
  completed: false,
  needsInput: true,
};
const COMPLETED_AND_NEEDS_INPUT_CHAT_ATTENTION: ChatAttentionState = {
  completed: true,
  needsInput: true,
};
const ALLOW_PERMISSION_RESPONSE: ChatElicitationResponse = { type: "allow" };
type LocallyResolvedElicitationPhase = "cancelled" | "resolved:Answers";
const LOCAL_ELICITATION_PHASE_BY_RESPONSE_TYPE = {
  allow: "resolved:Answers",
  allowForSession: "resolved:Answers",
  answers: "resolved:Answers",
  cancel: "cancelled",
  deny: "cancelled",
  dynamicToolResult: "resolved:Answers",
  externalComplete: "resolved:Answers",
  raw: "resolved:Answers",
} satisfies Record<
  ChatElicitationResponse["type"],
  LocallyResolvedElicitationPhase
>;
const OPTIMISTIC_TOOL_PHASE_BY_ELICITATION_RESPONSE_TYPE = {
  allow: "running",
  allowForSession: "running",
  answers: "running",
  cancel: "cancelled",
  deny: "declined",
  dynamicToolResult: "running",
  externalComplete: "running",
  raw: "running",
} satisfies Record<ChatElicitationResponse["type"], ChatToolActionPhase>;

export type EngineMessage = ThreadMessage;

type ActiveRun = {
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
};

type BaseChatRunSlot = {
  chatId?: string;
  config?: ChatRuntimeConfig;
  historyRevision: number;
  key: string;
  messages: EngineMessage[];
  permissionBypassEnabled: boolean;
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

export type ChatAttentionState = {
  completed: boolean;
  needsInput: boolean;
};

type ChatAttentionKind = keyof ChatAttentionState;

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
  activeChatId?: string;
  aliases: Record<string, string>;
  attentions: Record<string, ChatAttentionState>;
  cancelRun: (slotKey: string) => void;
  dropAllRuns: () => void;
  dropRun: (slotKey: string) => void;
  enablePermissionBypass: (slotKey: string) => void;
  initializeSlot: (input: InitializeSlotInput) => void;
  resolveElicitation: (
    slotKey: string,
    payload: unknown,
    toolCallId: string,
    elicitationId?: string,
  ) => void;
  setActiveChatId: (chatId?: string) => void;
  setMode: (slotKey: string, mode: string) => Promise<ChatRuntimeConfig>;
  slots: Record<string, ChatRunSlot>;
  startRun: (input: StartRunInput) => Promise<void>;
};

type ChatRunContext = Pick<
  ChatRunStore,
  "activeChatId" | "aliases" | "attentions" | "slots"
>;

type ChatRunEvent =
  | { chatId?: string; type: "activeChat.changed" }
  | { chatId: string; kind: ChatAttentionKind; type: "attention.marked" }
  | {
      input: InitializeSlotInput;
      messages: EngineMessage[];
      type: "slot.initialized";
    }
  | { slotKey: string; type: "run.cancelled" }
  | { slotKey: string; type: "slot.permissionBypassEnabled" }
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

const chatRunMachine = setup({
  types: {} as {
    context: ChatRunContext;
    events: ChatRunEvent;
  },
}).createMachine({
  context: {
    activeChatId: undefined,
    aliases: {},
    attentions: {},
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
        "activeChat.changed": {
          actions: assign(({ context, event }) =>
            setActiveChatIdContext(context, event.chatId),
          ),
        },
        "attention.marked": {
          actions: assign(({ context, event }) =>
            markAttentionContext(context, event),
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
        "slot.configUpdated": {
          actions: assign(({ context, event }) =>
            updateSlotConfigContext(context, event),
          ),
        },
        "slot.permissionBypassEnabled": {
          actions: assign(({ context, event }) =>
            enablePermissionBypassContext(context, event.slotKey),
          ),
        },
        "slot.initialized": {
          actions: assign(({ context, event }) =>
            initializeSlotContext(context, event.input, event.messages),
          ),
        },
        "slots.dropped": {
          actions: assign(() => ({
            activeChatId: undefined,
            aliases: {},
            attentions: {},
            slots: {},
          })),
        },
      },
    },
  },
});

const chatRunActor = createActor(chatRunMachine).start();
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
  enablePermissionBypass(slotKey) {
    chatRunActor.send({ slotKey, type: "slot.permissionBypassEnabled" });
  },
  initializeSlot(input) {
    chatRunActor.send({
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
    chatRunActor.send({
      chatId: chatId || undefined,
      type: "activeChat.changed",
    });
  },
  async setMode(slotKey, mode) {
    const state = getChatRunContext();
    const resolvedKey = resolveSlotKey(state, slotKey);
    const slot = state.slots[resolvedKey];
    const chatId = slot?.chatId ?? resolvedKey;
    const result = await getApiClient().chats.setMode({ chatId, mode });
    chatRunActor.send({
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

function setActiveChatIdContext(
  state: ChatRunContext,
  chatId: string | undefined,
): Partial<ChatRunContext> {
  const resolvedChatId = chatId ? resolveSlotKey(state, chatId) : undefined;
  const attentions = resolvedChatId
    ? removeAttention(state.attentions, resolvedChatId, chatId)
    : state.attentions;
  if (
    state.activeChatId === resolvedChatId &&
    attentions === state.attentions
  ) {
    return {};
  }

  return {
    activeChatId: resolvedChatId,
    attentions,
  };
}

function markAttentionContext(
  state: ChatRunContext,
  event: Extract<ChatRunEvent, { type: "attention.marked" }>,
): Partial<ChatRunContext> {
  const chatId = resolveSlotKey(state, event.chatId);
  const previous = state.attentions[chatId] ?? EMPTY_CHAT_ATTENTION;
  if (previous[event.kind]) return {};

  return {
    attentions: {
      ...state.attentions,
      [chatId]: {
        ...previous,
        [event.kind]: true,
      },
    },
  };
}

function summarizeChatAttention(state: ChatRunContext): ChatAttentionState {
  let completed = false;
  let needsInput = false;
  for (const [chatId, attention] of Object.entries(state.attentions)) {
    if (chatId === state.activeChatId) continue;
    completed ||= attention.completed;
    needsInput ||= attention.needsInput;
    if (completed && needsInput) break;
  }

  if (completed && needsInput) return COMPLETED_AND_NEEDS_INPUT_CHAT_ATTENTION;
  if (completed) return COMPLETED_CHAT_ATTENTION;
  if (needsInput) return NEEDS_INPUT_CHAT_ATTENTION;
  return EMPTY_CHAT_ATTENTION;
}

function removeAttention(
  attentions: Record<string, ChatAttentionState>,
  ...chatIds: Array<string | undefined>
) {
  const ids = chatIds.filter((chatId): chatId is string => Boolean(chatId));
  if (ids.length === 0 || !ids.some((chatId) => attentions[chatId])) {
    return attentions;
  }

  const next = { ...attentions };
  for (const chatId of ids) {
    delete next[chatId];
  }
  return next;
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
        [input.slotKey]: createIdleSlot(
          input.slotKey,
          input,
          normalizeEnginePlanMessages(messages),
        ),
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
      [resolvedKey]: createIdleSlot(
        resolvedKey,
        input,
        normalizeEnginePlanMessages(messages),
        existing,
      ),
    },
  };
}

function enablePermissionBypassContext(
  state: ChatRunContext,
  slotKey: string,
): Partial<ChatRunContext> {
  const resolvedKey = resolveSlotKey(state, slotKey);
  const existing =
    state.slots[resolvedKey] ??
    createIdleSlot(resolvedKey, {
      historyRevision: 0,
      slotKey: resolvedKey,
    });
  if (existing.permissionBypassEnabled) return {};

  return {
    slots: {
      ...state.slots,
      [resolvedKey]: {
        ...existing,
        permissionBypassEnabled: true,
      },
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
        messages: normalizeEnginePlanMessages([
          ...existingMessages,
          event.userMessage,
          event.assistantMessage,
        ]),
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

  return {
    aliases,
    attentions: removeAttention(state.attentions, resolvedKey, slotKey),
    slots,
  };
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
        messages: normalizeEnginePlanMessages(
          slot.messages.map((item) =>
            item.id === event.assistantMessageId ? event.message : item,
          ),
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

function updateSlotConfigContext(
  state: ChatRunContext,
  event: Extract<ChatRunEvent, { type: "slot.configUpdated" }>,
): Partial<ChatRunContext> {
  const resolvedKey = resolveSlotKey(state, event.slotKey);
  const existing =
    state.slots[resolvedKey] ??
    createIdleSlot(resolvedKey, {
      chatId: event.chat.id,
      historyRevision: 0,
      slotKey: resolvedKey,
    });

  return {
    slots: {
      ...state.slots,
      [resolvedKey]: {
        ...existing,
        chatId: event.chat.id,
        config: event.config,
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
    permissionBypassEnabled: existing?.permissionBypassEnabled ?? false,
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
  activeRun.resolveElicitationLocally = (elicitationId, response) => {
    resolveElicitationPartLocally(accumulator.parts, elicitationId, response);
    dirty = true;
    void flush();
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
        } else {
          mergeFinalResultParts(accumulator.parts, event.result.content);
        }
        markChatAttention(event.result.chatId, "completed");
        dirty = true;
        if (!(await flush())) break;
        continue;
      }

      accumulator.chunkCount += 1;
      let autoApprovedPermission = false;
      if (event.type === "elicitation") {
        upsertElicitationPart(accumulator.parts, event.elicitation);
        autoApprovedPermission = autoApprovePermissionElicitation({
          activeRun,
          elicitation: event.elicitation,
          parts: accumulator.parts,
          slotKey: currentSlotKey,
        });
        if (!autoApprovedPermission && event.elicitation.phase === "open") {
          markChatAttention(currentSlotKey, "needsInput");
        }
      } else if (event.type === "tool") {
        upsertToolActionPart(accumulator.parts, event.action);
        autoApprovedPermission = autoApprovePermissionToolAction({
          action: event.action,
          activeRun,
          parts: accumulator.parts,
          slotKey: currentSlotKey,
        });
        if (
          !autoApprovedPermission &&
          event.action.phase === "awaitingDecision"
        ) {
          markChatAttention(currentSlotKey, "needsInput");
        }
      } else if (event.type === "toolDelta") {
        appendToolActionDeltaPart(accumulator.parts, event.action);
      } else if (event.type === "plan") {
        upsertTurnPlanPartAtEnd(accumulator.parts, event.plan);
      } else {
        appendChatTextPart(accumulator.parts, event.part, event.text);
        pendingDeltaChars += event.text.length;
      }
      dirty = true;
      if (
        autoApprovedPermission ||
        event.type === "elicitation" ||
        (event.type === "tool" && event.action.phase === "awaitingDecision")
      ) {
        if (!(await flush())) break;
        continue;
      }

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

function autoApprovePermissionElicitation({
  activeRun,
  elicitation,
  parts,
  slotKey,
}: {
  activeRun: ActiveRun;
  elicitation: ChatElicitation;
  parts: ChatHistoryMessagePart[];
  slotKey: string;
}) {
  if (!isPermissionElicitation(elicitation)) return false;
  if (isPlanApprovalElicitation(elicitation, parts)) return false;
  if (!shouldAutoApprovePermission(activeRun, slotKey, elicitation.id)) {
    return false;
  }

  resolveElicitationPartLocally(
    parts,
    elicitation.id,
    ALLOW_PERMISSION_RESPONSE,
  );
  sendAutoPermissionApproval(activeRun, elicitation.id);
  return true;
}

function autoApprovePermissionToolAction({
  action,
  activeRun,
  parts,
  slotKey,
}: {
  action: ChatToolAction;
  activeRun: ActiveRun;
  parts: ChatHistoryMessagePart[];
  slotKey: string;
}) {
  if (action.phase !== "awaitingDecision") return false;
  if (isPlanApprovalToolAction(action)) return false;
  const elicitation = chatElicitationFromAction(action);
  if (!isPermissionElicitation(elicitation)) return false;
  const elicitationId = action.elicitationId ?? action.id;
  if (!shouldAutoApprovePermission(activeRun, slotKey, elicitationId)) {
    return false;
  }

  markToolActionPermissionApprovedLocally(parts, action.id);
  sendAutoPermissionApproval(activeRun, elicitationId);
  return true;
}

function shouldAutoApprovePermission(
  activeRun: ActiveRun,
  slotKey: string,
  elicitationId: string,
) {
  if (!activeRun.streamController) return false;
  if (!isPermissionBypassEnabledForSlot(getChatRunContext(), slotKey)) {
    return false;
  }
  if (activeRun.autoApprovedPermissionIds.has(elicitationId)) return false;

  activeRun.autoApprovedPermissionIds.add(elicitationId);
  return true;
}

function sendAutoPermissionApproval(
  activeRun: ActiveRun,
  elicitationId: string,
) {
  void activeRun.streamController
    ?.resolveElicitation({
      elicitationId,
      response: ALLOW_PERMISSION_RESPONSE,
    })
    .catch((): undefined => undefined);
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
          content: message.content.map(cancelAssistantMessagePart),
          status: { reason: "cancelled", type: "incomplete" },
        } as EngineMessage)
      : message,
  );
}

function cancelAssistantMessagePart(
  part: EngineMessage["content"][number],
): EngineMessage["content"][number] {
  if (
    part.type === "tool-call" &&
    isChatToolAction(part.artifact) &&
    !isTerminalChatToolPhase(part.artifact.phase)
  ) {
    return {
      ...part,
      artifact: {
        ...part.artifact,
        phase: "cancelled",
      },
    };
  }

  if (
    part.type === "data" &&
    part.name === "elicitation" &&
    isChatElicitationData(part.data) &&
    !isClosedElicitationPhase(part.data.phase)
  ) {
    return {
      ...part,
      data: {
        ...part.data,
        phase: "cancelled",
      },
    };
  }

  return part;
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

function markChatAttention(
  chatId: string | undefined,
  kind: ChatAttentionKind,
) {
  if (!chatId) return;
  const state = getChatRunContext();
  const resolvedChatId = resolveSlotKey(state, chatId);
  if (!shouldMarkChatAttention(state, resolvedChatId)) return;

  chatRunActor.send({
    chatId: resolvedChatId,
    kind,
    type: "attention.marked",
  });
}

function shouldMarkChatAttention(state: ChatRunContext, chatId: string) {
  return isRendererWindowVisible() && state.activeChatId !== chatId;
}

function isRendererWindowVisible() {
  return document.visibilityState === "visible";
}

function selectSlot(
  state: Pick<ChatRunStore, "aliases" | "slots">,
  key: string,
) {
  return state.slots[resolveSlotKey(state, key)];
}

function selectActiveRunForElicitation(
  state: Pick<ChatRunStore, "aliases" | "slots">,
  slotKey: string,
  toolCallId: string,
  elicitationId?: string,
) {
  const slot = selectSlot(state, slotKey);
  if (slot?.activeRun) return slot.activeRun;

  const ids = new Set(
    [toolCallId, elicitationId].filter((id): id is string => Boolean(id)),
  );
  for (const candidate of Object.values(state.slots)) {
    if (!candidate.activeRun) continue;
    if (slotHasOpenElicitation(candidate, ids)) {
      return candidate.activeRun;
    }
  }

  return undefined;
}

function slotHasOpenElicitation(slot: ChatRunSlot, ids: Set<string>) {
  return slot.messages.some((message) =>
    engineMessageContentToHistoryParts(message.content).some((part) =>
      partMatchesOpenElicitation(part, ids),
    ),
  );
}

function partMatchesOpenElicitation(
  part: ChatHistoryMessagePart,
  ids: Set<string>,
) {
  if (part.type === "data" && part.name === "elicitation") {
    return (
      part.data.phase === "open" &&
      (ids.has(part.data.id) ||
        Boolean(part.data.actionId && ids.has(part.data.actionId)))
    );
  }

  if (part.type !== "tool-call" || !isChatToolAction(part.artifact)) {
    return false;
  }

  return (
    part.artifact.phase === "awaitingDecision" &&
    (ids.has(part.toolCallId) ||
      ids.has(part.artifact.id) ||
      Boolean(
        part.artifact.elicitationId && ids.has(part.artifact.elicitationId),
      ))
  );
}

function isPermissionBypassEnabledForSlot(
  state: Pick<ChatRunStore, "aliases" | "slots">,
  key: string,
) {
  return selectSlot(state, key)?.permissionBypassEnabled ?? false;
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

function normalizeEnginePlanMessages(
  messages: EngineMessage[],
): EngineMessage[] {
  const locations = enginePlanPartLocations(messages);
  if (locations.length === 0) return messages;

  const latestByKind = new Map<string, (typeof locations)[number]>();
  for (const location of locations) {
    latestByKind.set(location.kind, location);
  }

  return messages.map((message, messageIndex) => {
    const hasPlan = locations.some(
      (location) => location.messageIndex === messageIndex,
    );
    if (!hasPlan) return message;

    return {
      ...message,
      content: message.content.map((part, partIndex) => {
        if (!isEnginePlanPart(part)) return part;
        const kind = chatPlanKind(part.data);
        const kindLocations = locations.filter(
          (location) => location.kind === kind,
        );

        const locationIndex = kindLocations.findIndex(
          (location) =>
            location.messageIndex === messageIndex &&
            location.partIndex === partIndex,
        );
        if (locationIndex === -1) return part;

        const presentation = enginePlanPresentationForLocation(
          locationIndex,
          latestByKind.get(kind),
          { messageIndex, partIndex },
        );

        return {
          ...part,
          name: chatPlanPartName(part.data),
          data: {
            ...cloneChatPlanData(part.data),
            presentation,
          },
        };
      }) as EngineMessage["content"],
    } as EngineMessage;
  });
}

function enginePlanPartLocations(messages: EngineMessage[]) {
  const locations: Array<{
    kind: string;
    messageIndex: number;
    partIndex: number;
  }> = [];
  messages.forEach((message, messageIndex) => {
    message.content.forEach((part, partIndex) => {
      if (isEnginePlanPart(part)) {
        locations.push({
          kind: chatPlanKind(part.data),
          messageIndex,
          partIndex,
        });
      }
    });
  });
  return locations;
}

function enginePlanPresentationForLocation(
  locationIndex: number,
  latest: { messageIndex: number; partIndex: number } | undefined,
  current: { messageIndex: number; partIndex: number },
): ChatPlanData["presentation"] {
  if (
    latest &&
    latest.messageIndex === current.messageIndex &&
    latest.partIndex === current.partIndex
  ) {
    return null;
  }

  if (locationIndex === 0) return "created";
  return "updated";
}

function isEnginePlanPart(
  part: EngineMessage["content"][number],
): part is EngineMessage["content"][number] & {
  data: ChatPlanData;
  name: "plan" | "todo";
  type: "data";
} {
  return (
    part.type === "data" &&
    ((part as { name?: unknown }).name === "plan" ||
      (part as { name?: unknown }).name === "todo") &&
    isChatPlanData((part as { data?: unknown }).data)
  );
}

function upsertToolActionPart(
  parts: ChatHistoryMessagePart[],
  action: ChatToolAction,
) {
  const questionElicitation = questionElicitationFromAction(action);
  if (questionElicitation) {
    upsertElicitationPart(parts, questionElicitation);
    return;
  }

  const elicitationActionId = elicitationBackingActionId(action);
  if (elicitationActionId) {
    removeBackingHostCapabilityPart(parts, elicitationActionId);
  } else if (
    isEmptyHostCapabilityAction(action) &&
    parts.some((part) => partReferencesElicitationAction(part, action.id))
  ) {
    return;
  }

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

function appendToolActionDeltaPart(
  parts: ChatHistoryMessagePart[],
  action: ChatToolAction,
) {
  const index = parts.findIndex(
    (part) => part.type === "tool-call" && part.toolCallId === action.id,
  );

  if (index === -1) {
    upsertToolActionPart(parts, action);
    return;
  }

  const previous = parts[index];
  if (previous.type !== "tool-call" || !isChatToolAction(previous.artifact)) {
    upsertToolActionPart(parts, action);
    return;
  }

  const output = [
    ...(previous.artifact.output ?? []),
    ...(action.output ?? []),
  ];
  upsertToolActionPart(parts, {
    ...previous.artifact,
    ...action,
    output,
    outputText: `${previous.artifact.outputText ?? ""}${action.outputText ?? ""}`,
  });
}

function mergeFinalResultParts(
  parts: ChatHistoryMessagePart[],
  finalParts: ChatHistoryMessagePart[],
) {
  for (const part of finalParts) {
    if (isChatPlanPart(part)) {
      upsertTurnPlanPartAtEnd(parts, part.data);
    } else if (part.type === "data" && part.name === "elicitation") {
      upsertElicitationPart(parts, part.data);
    } else if (part.type === "tool-call") {
      upsertToolActionPart(parts, part.artifact);
    }
  }
}

function upsertTurnPlanPartAtEnd(
  parts: ChatHistoryMessagePart[],
  plan: ChatPlanData,
) {
  const nextPart: ChatHistoryMessagePart = {
    data: cloneChatPlanData(plan),
    name: chatPlanPartName(plan),
    type: "data",
  };
  const index = parts.findIndex(
    (part) =>
      isChatPlanPart(part) && chatPlanKind(part.data) === chatPlanKind(plan),
  );
  if (index !== -1) parts.splice(index, 1);
  parts.push(nextPart);
}

function chatPlanKind(plan: ChatPlanData) {
  return plan.kind ?? "review";
}

function upsertElicitationPart(
  parts: ChatHistoryMessagePart[],
  elicitation: ChatElicitation,
) {
  if (elicitation.actionId) {
    removeBackingHostCapabilityPart(parts, elicitation.actionId);
  }
  upsertChatElicitationPart(
    parts,
    preserveResolvedElicitationPhase(parts, elicitation),
  );
}

function preserveResolvedElicitationPhase(
  parts: ChatHistoryMessagePart[],
  elicitation: ChatElicitation,
) {
  if (elicitation.phase !== "open") return elicitation;
  const previous = parts.find(
    (part) =>
      part.type === "data" &&
      part.name === "elicitation" &&
      part.data.id === elicitation.id,
  );
  if (
    previous?.type !== "data" ||
    previous.name !== "elicitation" ||
    !isClosedElicitationPhase(previous.data.phase)
  ) {
    return elicitation;
  }
  return {
    ...elicitation,
    phase: previous.data.phase,
  };
}

function resolveElicitationPartLocally(
  parts: ChatHistoryMessagePart[],
  elicitationId: string,
  response: ChatElicitationResponse,
) {
  const phase = LOCAL_ELICITATION_PHASE_BY_RESPONSE_TYPE[response.type];
  for (const part of parts) {
    if (
      part.type === "data" &&
      part.name === "elicitation" &&
      part.data.id === elicitationId
    ) {
      part.data = {
        ...part.data,
        phase,
      };
    }
    if (
      part.type === "tool-call" &&
      part.toolCallId === elicitationId &&
      isChatToolAction(part.artifact) &&
      part.artifact.phase === "awaitingDecision"
    ) {
      part.artifact = {
        ...part.artifact,
        phase:
          OPTIMISTIC_TOOL_PHASE_BY_ELICITATION_RESPONSE_TYPE[response.type],
      };
    }
  }
}

function markToolActionPermissionApprovedLocally(
  parts: ChatHistoryMessagePart[],
  actionId: string,
) {
  const index = parts.findIndex(
    (part) => part.type === "tool-call" && part.toolCallId === actionId,
  );
  const part = parts[index];
  if (part?.type !== "tool-call" || !isChatToolAction(part.artifact)) return;

  parts[index] = {
    ...part,
    artifact: {
      ...part.artifact,
      phase: "running",
    },
  };
}

function removeBackingHostCapabilityPart(
  parts: ChatHistoryMessagePart[],
  actionId: string,
) {
  const index = parts.findIndex(
    (part) =>
      part.type === "tool-call" &&
      part.toolCallId === actionId &&
      part.artifact.kind === "hostCapability" &&
      isEmptyHostCapabilityAction(part.artifact),
  );
  if (index !== -1) parts.splice(index, 1);
}

function partReferencesElicitationAction(
  part: ChatHistoryMessagePart,
  actionId: string,
) {
  if (part.type === "data" && part.name === "elicitation") {
    return part.data.actionId === actionId;
  }
  return (
    part.type === "tool-call" &&
    part.artifact.kind === "elicitation" &&
    elicitationBackingActionId(part.artifact) === actionId
  );
}

function elicitationBackingActionId(action: ChatToolAction) {
  if (action.kind !== "elicitation" || !action.rawInput) return undefined;
  try {
    const parsed: unknown = JSON.parse(action.rawInput);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as Partial<ChatElicitation>).actionId === "string"
    ) {
      return (parsed as Partial<ChatElicitation>).actionId ?? undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function questionElicitationFromAction(
  action: ChatToolAction,
): ChatElicitation | undefined {
  const elicitation = chatElicitationFromAction(action);
  if (
    elicitation &&
    (elicitation.kind === "userInput" ||
      (elicitation.questions?.length ?? 0) > 0)
  ) {
    return {
      ...elicitation,
      phase: elicitationPhaseFromAction(
        action.phase,
        elicitation.phase,
        actionHasOutput(action),
      ),
    };
  }
  return undefined;
}

function chatElicitationFromAction(
  action: ChatToolAction,
): ChatElicitation | undefined {
  if (!action.rawInput) return undefined;
  try {
    const parsed: unknown = JSON.parse(action.rawInput);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as Partial<ChatElicitation>).id === "string" &&
      typeof (parsed as Partial<ChatElicitation>).kind === "string"
    ) {
      return parsed as ChatElicitation;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function isPermissionElicitation(
  elicitation?: ChatElicitation,
): elicitation is ChatElicitation {
  return (
    elicitation?.kind === "approval" ||
    elicitation?.kind === "permissionProfile"
  );
}

function isPlanApprovalElicitation(
  elicitation: ChatElicitation,
  parts: ChatHistoryMessagePart[],
) {
  const actionId = elicitation.actionId ?? elicitation.id;
  return parts.some(
    (part) =>
      part.type === "tool-call" &&
      part.artifact.id === actionId &&
      isPlanApprovalToolAction(part.artifact),
  );
}

function isPlanApprovalToolAction(action: ChatToolAction) {
  return action.kind === "plan";
}

function elicitationPhaseFromAction(
  actionPhase: string | undefined,
  fallback: string,
  hasOutput: boolean,
) {
  if (hasOutput) return "resolved:Answers";
  switch (actionPhase) {
    case "completed":
      return "resolved:Answers";
    case "cancelled":
    case "declined":
    case "failed":
      return "cancelled";
    case "awaitingDecision":
      return "open";
    default:
      return fallback;
  }
}

function actionHasOutput(action: ChatToolAction) {
  return Boolean(
    action.outputText || action.output?.some((output) => output.text),
  );
}

function isClosedElicitationPhase(phase: string) {
  return phase === "cancelled" || phase.startsWith("resolved:");
}

function isEmptyHostCapabilityAction(action: ChatToolAction) {
  return (
    action.kind === "hostCapability" &&
    !action.error &&
    !action.outputText &&
    !(action.output ?? []).some((output) => output.text)
  );
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
  return normalizeChatPlanMessages(
    messages
      .map(engineMessageToHistoryMessage)
      .filter((message) => message.content.length > 0),
  );
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
        return part.text ? [{ ...part }] : [];
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
      case "data":
        if (
          (part.name === "plan" || part.name === "todo") &&
          isChatPlanData(part.data)
        ) {
          return [
            {
              data: part.data,
              name: chatPlanPartName(part.data),
              type: "data",
            },
          ];
        }
        if (part.name === "elicitation" && isChatElicitationData(part.data)) {
          return [{ data: part.data, name: "elicitation", type: "data" }];
        }
        return [];
      default:
        return [];
    }
  });
}

function historyPartToEngineMessagePart(
  part: ChatHistoryMessagePart,
): ThreadMessage["content"][number] {
  if (part.type === "data") {
    return {
      data: part.data,
      name: part.name,
      type: "data",
    } as ThreadMessage["content"][number];
  }

  if (part.type !== "image" && part.type !== "file") {
    return part as ThreadMessage["content"][number];
  }

  if (part.type === "file") {
    return {
      data: part.data,
      filename: part.filename ?? undefined,
      ...(part.mention ? { mention: part.mention } : {}),
      mimeType: part.mimeType,
      ...(part.path ? { path: part.path } : {}),
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
        ...(part.mention ? { mention: true } : {}),
        mimeType: part.mimeType,
        ...(part.path ? { path: part.path } : {}),
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
    mention: messagePartMention(part),
    mimeType,
    path: messagePartPath(part),
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
    .join("\n");
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
  if (part.type === "file" && messagePartMention(part)) {
    const path = messagePartPath(part);
    if (!path) return undefined;
    return {
      mimeType: part.mimeType,
      name: part.filename ?? fallbackName ?? null,
      path,
      type: "fileMention",
    };
  }

  if (part.type === "image") {
    const parsed = parseImageDataUrl(part.image);
    if (!parsed) return undefined;
    return {
      data: parsed.data,
      mimeType: parsed.mimeType,
      name: part.filename ?? fallbackName ?? null,
      path: messagePartPath(part),
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
      path: messagePartPath(part),
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
      path: messagePartPath(part),
      type: "file",
    };
  }

  return undefined;
}

function messagePartPath(part: ThreadMessage["content"][number]) {
  const path = (
    part as ThreadMessage["content"][number] & {
      path?: unknown;
    }
  ).path;
  return typeof path === "string" && path ? path : null;
}

function messagePartMention(part: ThreadMessage["content"][number]) {
  return (
    (
      part as ThreadMessage["content"][number] & {
        mention?: unknown;
      }
    ).mention === true
  );
}

function attachmentInputToHistoryPart(
  input: ChatAttachmentInput,
): ChatHistoryMessagePart {
  if (input.type === "fileMention") {
    return {
      data: input.path,
      filename: input.name ?? undefined,
      mention: true,
      mimeType: input.mimeType ?? "application/octet-stream",
      path: input.path,
      type: "file",
    };
  }

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
