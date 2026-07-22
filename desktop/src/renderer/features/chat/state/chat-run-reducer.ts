import type {
  ChatAttentionState,
  ChatRunContext,
  ChatRunSlot,
  ChatRunStore,
  EngineMessage,
} from "./chat-run-types";
import { isChatToolAction } from "@angel-engine/daemon-api/chat";
import is from "@sindresorhus/is";
import { engineMessageContentToHistoryParts } from "./chat-run-history";
import {
  engineMessageHasPlanParts,
  normalizeEnginePlanMessages,
} from "./chat-run-plan";
import {
  COMPLETED_AND_NEEDS_INPUT_CHAT_ATTENTION,
  COMPLETED_CHAT_ATTENTION,
  EMPTY_CHAT_ATTENTION,
  NEEDS_INPUT_CHAT_ATTENTION,
} from "./chat-run-types";

export function setActiveChatIdContext(
  state: ChatRunContext,
  chatId: string | undefined,
): Partial<ChatRunContext> {
  const resolvedChatId = is.nonEmptyString(chatId)
    ? resolveSlotKey(state, chatId)
    : undefined;
  const completedChats = is.nonEmptyString(resolvedChatId)
    ? removeCompleted(state.completedChats, resolvedChatId, chatId)
    : state.completedChats;
  if (
    state.activeChatId === resolvedChatId &&
    completedChats === state.completedChats
  ) {
    return {};
  }

  return {
    activeChatId: resolvedChatId,
    completedChats,
  };
}

export function markChatCompletedContext(
  state: ChatRunContext,
  chatId: string,
): Partial<ChatRunContext> {
  const resolvedChatId = resolveSlotKey(state, chatId);
  if (state.completedChats[resolvedChatId]) return {};

  return {
    completedChats: {
      ...state.completedChats,
      [resolvedChatId]: true,
    },
  };
}

export function summarizeChatAttention(
  state: ChatRunContext,
): ChatAttentionState {
  const completed = Object.keys(state.completedChats).some(
    (chatId) => chatId !== state.activeChatId,
  );
  const needsInput = Object.entries(state.slots).some(
    ([key, slot]) => key !== state.activeChatId && slotNeedsInput(slot),
  );

  if (completed && needsInput) return COMPLETED_AND_NEEDS_INPUT_CHAT_ATTENTION;
  if (completed) return COMPLETED_CHAT_ATTENTION;
  if (needsInput) return NEEDS_INPUT_CHAT_ATTENTION;
  return EMPTY_CHAT_ATTENTION;
}

export function chatAttentionForChat(
  state: ChatRunContext,
  chatId: string,
): ChatAttentionState {
  const resolvedChatId = resolveSlotKey(state, chatId);
  const completed = state.completedChats[resolvedChatId] === true;
  const slot = state.slots[resolvedChatId];
  const needsInput = slot !== undefined && slotNeedsInput(slot);

  if (completed && needsInput) return COMPLETED_AND_NEEDS_INPUT_CHAT_ATTENTION;
  if (completed) return COMPLETED_CHAT_ATTENTION;
  if (needsInput) return NEEDS_INPUT_CHAT_ATTENTION;
  return EMPTY_CHAT_ATTENTION;
}

export function removeCompleted(
  completedChats: Record<string, true>,
  ...chatIds: Array<string | undefined>
) {
  const ids = chatIds.filter(is.nonEmptyString);
  if (
    ids.length === 0 ||
    !ids.some((chatId) => completedChats[chatId] !== undefined)
  ) {
    return completedChats;
  }

  const next = { ...completedChats };
  for (const chatId of ids) {
    delete next[chatId];
  }
  return next;
}

export function selectSlot(
  state: Pick<ChatRunStore, "draftRedirects" | "slots">,
  key: string,
) {
  return getChatRunSlot(state.slots, resolveSlotKey(state, key));
}

function getChatRunSlot(slots: Record<string, ChatRunSlot>, key: string) {
  return Object.hasOwn(slots, key) ? slots[key] : undefined;
}

export function isPermissionBypassEnabledForSlot(
  state: Pick<ChatRunStore, "draftRedirects" | "slots">,
  key: string,
) {
  return selectSlot(state, key)?.permissionBypassEnabled ?? false;
}

export function resolveSlotKey(
  state: Pick<ChatRunStore, "draftRedirects" | "slots">,
  key: string,
) {
  if (Object.hasOwn(state.slots, key)) return key;
  return state.draftRedirects[key] ?? key;
}

const combinedMessagesCache = new WeakMap<ChatRunSlot, EngineMessage[]>();

/**
 * The transcript including the in-flight assistant message. Cached per slot
 * snapshot; plan normalization runs only when the streaming message actually
 * carries plan parts.
 */
export function slotMessagesWithStreaming(slot: ChatRunSlot): EngineMessage[] {
  if (slot.streamingAssistant === undefined) return slot.messages;

  const cached = combinedMessagesCache.get(slot);
  if (cached !== undefined) return cached;

  const combined = [...slot.messages, slot.streamingAssistant];
  const result = engineMessageHasPlanParts(slot.streamingAssistant)
    ? normalizeEnginePlanMessages(combined)
    : combined;
  combinedMessagesCache.set(slot, result);
  return result;
}

const slotNeedsInputCache = new WeakMap<ChatRunSlot, boolean>();

/**
 * Whether a slot is waiting on the user: a streaming run with an open
 * elicitation or a tool action awaiting a decision. Derived from the
 * transcript, so it clears itself the moment the input is resolved.
 */
export function slotNeedsInput(slot: ChatRunSlot): boolean {
  if (slot.status !== "streaming") return false;

  const cached = slotNeedsInputCache.get(slot);
  if (cached !== undefined) return cached;

  const needsInput = slotMessagesWithStreaming(slot).some((message) =>
    engineMessageContentToHistoryParts(message.content).some(
      partAwaitsUserInput,
    ),
  );
  slotNeedsInputCache.set(slot, needsInput);
  return needsInput;
}

function partAwaitsUserInput(
  part: ReturnType<typeof engineMessageContentToHistoryParts>[number],
): boolean {
  if (part.type === "data" && part.name === "elicitation") {
    return part.data.phase === "open";
  }
  return (
    part.type === "tool-call" &&
    isChatToolAction(part.artifact) &&
    part.artifact.phase === "awaitingDecision"
  );
}
