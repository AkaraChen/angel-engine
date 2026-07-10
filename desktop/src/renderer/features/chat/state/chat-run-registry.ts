import type {
  Chat,
  ChatHistoryMessagePart,
  ChatSendResult,
} from "@shared/chat";
import type {
  ChatAttentionKind,
  ChatRunContext,
  ChatRunEvent,
  ChatRunSlot,
  ChatRunStore,
  EngineMessage,
} from "./chat-run-types";
import { isChatToolAction } from "@shared/chat";
import is from "@sindresorhus/is";
import { assign, createActor, setup } from "xstate";
import { engineMessageContentToHistoryParts } from "./chat-run-history";
import {
  cancelRunContext,
  dropRunContext,
  enablePermissionBypassContext,
  finishRunContext,
  initializeSlotContext,
  markAttentionContext,
  moveActiveRunToChatContext,
  replaceAssistantMessageContext,
  resolveSlotKey,
  selectSlot,
  setActiveChatIdContext,
  startRunContext,
  updateSlotConfigContext,
} from "./chat-run-reducer";
import { EMPTY_MESSAGES } from "./chat-run-types";

const chatRunMachine = setup({
  types: {
    context: {} as ChatRunContext,
    events: {} as ChatRunEvent,
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
            enablePermissionBypassContext(
              context,
              event.slotKey,
              event.response,
            ),
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

export function subscribeChatRunActor(onStoreChange: () => void) {
  const subscription = chatRunActor.subscribe(() => onStoreChange());
  return () => subscription.unsubscribe();
}

export function getChatRunContext(): ChatRunContext {
  return chatRunActor.getSnapshot().context;
}

export function sendChatRunEvent(event: ChatRunEvent) {
  chatRunActor.send(event);
}

export function replaceAssistantMessage(
  slotKey: string,
  runId: string,
  assistantMessageId: string,
  message: EngineMessage,
) {
  const slot = selectSlot(getChatRunContext(), slotKey);
  if (slot?.activeRun?.runId !== runId) return false;

  sendChatRunEvent({
    assistantMessageId,
    message,
    runId,
    slotKey,
    type: "assistant.replaced",
  });
  return true;
}

export function moveActiveRunToChat(
  slotKey: string,
  chat: Chat,
  runId: string,
) {
  const slot = selectSlot(getChatRunContext(), slotKey);
  if (slot?.activeRun?.runId !== runId) return slotKey;

  sendChatRunEvent({
    chat,
    runId,
    slotKey,
    type: "run.movedToChat",
  });
  return chat.id;
}

export function getActiveRunMessages(slotKey: string, runId: string) {
  const state = getChatRunContext();
  const slot = selectSlot(state, slotKey);
  return slot?.activeRun?.runId === runId ? slot.messages : EMPTY_MESSAGES;
}

export function finishRun(
  slotKey: string,
  runId: string,
  result?: ChatSendResult,
) {
  sendChatRunEvent({
    result,
    runId,
    slotKey,
    type: "run.finished",
  });
}

export function markChatAttention(
  chatId: string | undefined,
  kind: ChatAttentionKind,
) {
  if (!is.nonEmptyString(chatId)) return;
  const state = getChatRunContext();
  const resolvedChatId = resolveSlotKey(state, chatId);
  if (!shouldMarkChatAttention(state, resolvedChatId)) return;

  sendChatRunEvent({
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

export function selectActiveRunForElicitation(
  state: Pick<ChatRunStore, "aliases" | "slots">,
  slotKey: string,
  toolCallId: string,
  elicitationId?: string,
) {
  const slot = selectSlot(state, slotKey);
  if (slot?.activeRun !== undefined) return slot.activeRun;

  const ids = new Set([toolCallId, elicitationId].filter(is.nonEmptyString));
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
        (is.nonEmptyString(part.data.actionId) && ids.has(part.data.actionId)))
    );
  }

  if (part.type !== "tool-call" || !isChatToolAction(part.artifact)) {
    return false;
  }

  return (
    part.artifact.phase === "awaitingDecision" &&
    (ids.has(part.toolCallId) ||
      ids.has(part.artifact.id) ||
      (is.nonEmptyString(part.artifact.elicitationId) &&
        ids.has(part.artifact.elicitationId)))
  );
}
