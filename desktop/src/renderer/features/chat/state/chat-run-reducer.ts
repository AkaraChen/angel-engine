import type { ChatElicitationResponse } from "@angel-engine/daemon-api/chat";
import type {
  ActiveRun,
  ChatAttentionState,
  ChatRunContext,
  ChatRunEvent,
  ChatRunSlot,
  ChatRunStore,
  EngineMessage,
  InitializeSlotInput,
} from "./chat-run-types";
import is from "@sindresorhus/is";
import { markAssistantMessageCancelled } from "./chat-run-assistant";
import { normalizeEnginePlanMessages } from "./chat-run-plan";
import {
  COMPLETED_AND_NEEDS_INPUT_CHAT_ATTENTION,
  COMPLETED_CHAT_ATTENTION,
  EMPTY_CHAT_ATTENTION,
  EMPTY_MESSAGES,
  NEEDS_INPUT_CHAT_ATTENTION,
} from "./chat-run-types";

export function setActiveChatIdContext(
  state: ChatRunContext,
  chatId: string | undefined,
): Partial<ChatRunContext> {
  const resolvedChatId = is.nonEmptyString(chatId)
    ? resolveSlotKey(state, chatId)
    : undefined;
  const attentions = is.nonEmptyString(resolvedChatId)
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

export function markAttentionContext(
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

export function summarizeChatAttention(
  state: ChatRunContext,
): ChatAttentionState {
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

export function removeAttention(
  attentions: Record<string, ChatAttentionState>,
  ...chatIds: Array<string | undefined>
) {
  const ids = chatIds.filter(is.nonEmptyString);
  if (
    ids.length === 0 ||
    !ids.some((chatId) => attentions[chatId] !== undefined)
  ) {
    return attentions;
  }

  const next = { ...attentions };
  for (const chatId of ids) {
    delete next[chatId];
  }
  return next;
}

export function initializeSlotContext(
  state: ChatRunContext,
  input: InitializeSlotInput,
  messages: EngineMessage[],
): Partial<ChatRunContext> {
  const resolvedKey = resolveSlotKey(state, input.slotKey);
  const existing = getChatRunSlot(state.slots, resolvedKey);
  const isDraftSlot = !is.nonEmptyString(input.chatId);

  if (isDraftSlot && is.nonEmptyString(state.aliases[input.slotKey])) {
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
    existing !== undefined &&
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

export function enablePermissionBypassContext(
  state: ChatRunContext,
  slotKey: string,
  response: ChatElicitationResponse,
): Partial<ChatRunContext> {
  const resolvedKey = resolveSlotKey(state, slotKey);
  const existing =
    state.slots[resolvedKey] ??
    createIdleSlot(resolvedKey, {
      historyRevision: 0,
      slotKey: resolvedKey,
    });

  return {
    slots: {
      ...state.slots,
      [resolvedKey]: {
        ...existing,
        permissionBypassEnabled: true,
        permissionBypassResponse: response,
      },
    },
  };
}

export function startRunContext(
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

export function cancelRunContext(
  state: ChatRunContext,
  slotKey: string,
): Partial<ChatRunContext> {
  const resolvedKey = resolveSlotKey(state, slotKey);
  const slot = getChatRunSlot(state.slots, resolvedKey);
  const activeRun = slot?.activeRun;
  if (slot === undefined || activeRun === undefined) return {};

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

export function dropRunContext(
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

export function replaceAssistantMessageContext(
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

export function moveActiveRunToChatContext(
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

export function finishRunContext(
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

export function updateSlotConfigContext(
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
    permissionBypassResponse: existing?.permissionBypassResponse,
    status: "idle",
  };
}

export function selectSlot(
  state: Pick<ChatRunStore, "aliases" | "slots">,
  key: string,
) {
  return getChatRunSlot(state.slots, resolveSlotKey(state, key));
}

function getChatRunSlot(slots: Record<string, ChatRunSlot>, key: string) {
  return Object.hasOwn(slots, key) ? slots[key] : undefined;
}

export function isPermissionBypassEnabledForSlot(
  state: Pick<ChatRunStore, "aliases" | "slots">,
  key: string,
) {
  return selectSlot(state, key)?.permissionBypassEnabled ?? false;
}

export function resolveSlotKey(
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
