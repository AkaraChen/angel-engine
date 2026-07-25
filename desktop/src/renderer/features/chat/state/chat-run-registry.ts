import type { ActorRefFrom, SnapshotFrom } from "xstate";
import type {
  ChatHistoryMessagePart,
  ChatSendResult,
} from "@angel-engine/daemon-api/chat";
import type {
  ChatRunContext,
  ChatRunEvent,
  ChatRunSlot,
  ChatRunStore,
  EngineMessage,
} from "./chat-run-types";
import { isChatToolAction } from "@angel-engine/daemon-api/chat";
import is from "@sindresorhus/is";
import { assign, createActor, enqueueActions, setup } from "xstate";
import { engineMessageContentToHistoryParts } from "./chat-run-history";
import {
  markChatCompletedContext,
  removeCompleted,
  selectSlot,
  setActiveChatIdContext,
  slotMessagesWithStreaming,
} from "./chat-run-reducer";
import { chatRunSlotMachine } from "./chat-run-slot-machine";
import { EMPTY_MESSAGES } from "./chat-run-types";

type ChatRunSlotRef = ActorRefFrom<typeof chatRunSlotMachine>;

interface ChatRunRegistryContext {
  activeChatId?: string;
  completedChats: Record<string, true>;
  slotRefs: Record<string, ChatRunSlotRef>;
}

/**
 * The registry machine owns cross-slot concerns (attention, active chat) and
 * spawns one `chatRunSlotMachine` actor per conversation surface. Slot-scoped
 * events are forwarded to the owning child; the child's `idle`/`streaming`
 * statechart guards them.
 *
 * Slots are keyed by the real chat id from the first run onward: a chat is
 * created before its run starts, so there is no draft-key rewrite to track.
 */
const chatRunMachine = setup({
  actors: {
    slot: chatRunSlotMachine,
  },
  types: {
    context: {} as ChatRunRegistryContext,
    events: {} as ChatRunEvent,
  },
}).createMachine({
  context: {
    activeChatId: undefined,
    completedChats: {},
    slotRefs: {},
  },
  id: "chatRunRegistry",
  initial: "ready",
  states: {
    ready: {
      on: {
        "activeChat.changed": {
          actions: assign(({ context, event }) =>
            setActiveChatIdContext(contextForAttention(context), event.chatId),
          ),
        },
        "assistant.replaced": {
          actions: enqueueActions(({ context, enqueue, event }) => {
            const ref = context.slotRefs[event.slotKey];
            if (!ref) return;
            enqueue.sendTo(ref, {
              message: event.message,
              runId: event.runId,
              type: "assistant.replaced",
            });
          }),
        },
        "chat.completed": {
          actions: assign(({ context, event }) =>
            markChatCompletedContext(
              contextForAttention(context),
              event.chatId,
            ),
          ),
        },
        "run.cancelled": {
          actions: enqueueActions(({ context, enqueue, event }) => {
            const ref = context.slotRefs[event.slotKey];
            if (!ref) return;
            enqueue.sendTo(ref, { type: "run.cancelled" });
          }),
        },
        "run.finished": {
          actions: enqueueActions(({ context, enqueue, event }) => {
            const ref = context.slotRefs[event.slotKey];
            if (!ref) return;
            enqueue.sendTo(ref, {
              assistantMessage: event.assistantMessage,
              chatId: event.result?.chatId,
              config: event.result?.config,
              runId: event.runId,
              type: "run.finished",
            });
          }),
        },
        "run.started": {
          actions: enqueueActions(({ context, enqueue, event }) => {
            const slotKey = event.slotKey;
            if (!context.slotRefs[slotKey]) {
              // A run started from a draft lands on a slot the renderer has
              // not mounted yet, so the seed carries the chat identity and the
              // config the draft had already resolved.
              enqueue.assign(({ context: current, spawn }) => ({
                slotRefs: {
                  ...current.slotRefs,
                  [slotKey]: spawn("slot", {
                    input: {
                      chatId: event.chatId,
                      config: event.config,
                      historyRevision: 0,
                      key: slotKey,
                    },
                  }),
                },
              }));
            }
            enqueue.sendTo(
              ({ context: current }) => current.slotRefs[slotKey],
              {
                activeRun: event.activeRun,
                assistantMessage: event.assistantMessage,
                chatId: event.chatId,
                config: event.config,
                type: "run.started",
                userMessage: event.userMessage,
              },
            );
          }),
        },
        "slot.configUpdated": {
          actions: enqueueActions(({ context, enqueue, event }) => {
            const resolvedKey = event.slotKey;
            if (!context.slotRefs[resolvedKey]) {
              enqueue.assign(({ context: current, spawn }) => ({
                slotRefs: {
                  ...current.slotRefs,
                  [resolvedKey]: spawn("slot", {
                    input: {
                      chatId: event.chat.id,
                      historyRevision: 0,
                      key: resolvedKey,
                    },
                  }),
                },
              }));
            }
            enqueue.sendTo(
              ({ context: current }) => current.slotRefs[resolvedKey],
              {
                chat: event.chat,
                config: event.config,
                type: "slot.configUpdated",
              },
            );
          }),
        },
        "slot.dropped": {
          actions: enqueueActions(({ context, enqueue, event }) => {
            const resolvedKey = event.slotKey;
            const ref = context.slotRefs[resolvedKey];
            if (ref) enqueue.stopChild(ref);
            enqueue.assign(({ context: current }) => {
              const slotRefs = { ...current.slotRefs };
              delete slotRefs[resolvedKey];
              return {
                completedChats: removeCompleted(
                  current.completedChats,
                  resolvedKey,
                ),
                slotRefs,
              };
            });
          }),
        },
        "slot.initialized": {
          actions: enqueueActions(({ context, enqueue, event }) => {
            const input = event.input;
            const resolvedKey = input.slotKey;
            const ref = context.slotRefs[resolvedKey];
            if (ref) {
              enqueue.sendTo(ref, {
                input,
                messages: event.messages,
                type: "slot.refresh",
              });
              return;
            }
            enqueue.assign(({ context: current, spawn }) => ({
              slotRefs: {
                ...current.slotRefs,
                [resolvedKey]: spawn("slot", {
                  input: {
                    chatId: input.chatId,
                    config: input.config,
                    historyRevision: input.historyRevision,
                    key: resolvedKey,
                    messages: event.messages,
                  },
                }),
              },
            }));
          }),
        },
        "slot.permissionBypassEnabled": {
          actions: enqueueActions(({ context, enqueue, event }) => {
            const resolvedKey = event.slotKey;
            if (!context.slotRefs[resolvedKey]) {
              enqueue.assign(({ context: current, spawn }) => ({
                slotRefs: {
                  ...current.slotRefs,
                  [resolvedKey]: spawn("slot", {
                    input: { historyRevision: 0, key: resolvedKey },
                  }),
                },
              }));
            }
            enqueue.sendTo(
              ({ context: current }) => current.slotRefs[resolvedKey],
              {
                response: event.response,
                type: "slot.permissionBypassEnabled",
              },
            );
          }),
        },
        "slots.dropped": {
          actions: enqueueActions(({ context, enqueue }) => {
            for (const ref of Object.values(context.slotRefs)) {
              enqueue.stopChild(ref);
            }
            enqueue.assign({
              activeChatId: undefined,
              completedChats: {},
              slotRefs: {},
            });
          }),
        },
      },
    },
  },
});

const chatRunActor = createActor(chatRunMachine).start();

// -- Aggregation: the registry context plus each child snapshot materialize
// -- into the flat ChatRunContext the selectors consume. Slots are cached per
// -- child snapshot so unchanged slots stay reference-stable.

const listeners = new Set<() => void>();
const childSubscriptions = new Map<
  string,
  { ref: ChatRunSlotRef; unsubscribe: () => void }
>();
let cachedContext: ChatRunContext | undefined;
const materializedSlots = new WeakMap<
  SnapshotFrom<typeof chatRunSlotMachine>,
  ChatRunSlot
>();

function notifyListeners() {
  cachedContext = undefined;
  for (const listener of listeners) listener();
}

function syncChildSubscriptions() {
  const slotRefs = chatRunActor.getSnapshot().context.slotRefs;
  for (const [key, subscription] of childSubscriptions) {
    if (slotRefs[key] === subscription.ref) continue;
    subscription.unsubscribe();
    childSubscriptions.delete(key);
  }
  for (const [key, ref] of Object.entries(slotRefs)) {
    if (childSubscriptions.get(key)?.ref === ref) continue;
    const subscription = ref.subscribe(() => notifyListeners());
    childSubscriptions.set(key, {
      ref,
      unsubscribe: () => subscription.unsubscribe(),
    });
  }
}

chatRunActor.subscribe(() => {
  syncChildSubscriptions();
  notifyListeners();
});

function materializeSlot(key: string, ref: ChatRunSlotRef): ChatRunSlot {
  const snapshot = ref.getSnapshot();
  const cached = materializedSlots.get(snapshot);
  if (cached && cached.key === key) return cached;

  const context = snapshot.context;
  const base = {
    chatId: context.chatId,
    config: context.config,
    historyRevision: context.historyRevision,
    key,
    messages: context.messages,
    permissionBypassEnabled: context.permissionBypassEnabled,
    permissionBypassResponse: context.permissionBypassResponse,
  };
  const slot: ChatRunSlot =
    snapshot.matches("streaming") &&
    context.activeRun !== undefined &&
    context.streamingAssistant !== undefined
      ? {
          ...base,
          activeRun: context.activeRun,
          status: "streaming",
          streamingAssistant: context.streamingAssistant,
        }
      : { ...base, status: "idle" };
  materializedSlots.set(snapshot, slot);
  return slot;
}

export function subscribeChatRunActor(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

export function getChatRunContext(): ChatRunContext {
  if (cachedContext) return cachedContext;

  const registry = chatRunActor.getSnapshot().context;
  const slots: Record<string, ChatRunSlot> = {};
  for (const [key, ref] of Object.entries(registry.slotRefs)) {
    slots[key] = materializeSlot(key, ref);
  }
  cachedContext = {
    activeChatId: registry.activeChatId,
    completedChats: registry.completedChats,
    slots,
  };
  return cachedContext;
}

export function sendChatRunEvent(event: ChatRunEvent) {
  chatRunActor.send(event);
}

function contextForAttention(context: ChatRunRegistryContext): ChatRunContext {
  return {
    activeChatId: context.activeChatId,
    completedChats: context.completedChats,
    slots: getChatRunContext().slots,
  };
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

export function getActiveRunMessages(slotKey: string, runId: string) {
  const state = getChatRunContext();
  const slot = selectSlot(state, slotKey);
  return slot?.activeRun?.runId === runId
    ? slotMessagesWithStreaming(slot)
    : EMPTY_MESSAGES;
}

export function finishRun(
  slotKey: string,
  runId: string,
  assistantMessage: EngineMessage,
  result?: ChatSendResult,
) {
  sendChatRunEvent({
    assistantMessage,
    result,
    runId,
    slotKey,
    type: "run.finished",
  });
}

export function markChatCompleted(chatId: string | undefined) {
  if (!is.nonEmptyString(chatId)) return;
  const state = getChatRunContext();
  if (!shouldMarkChatCompleted(state, chatId)) return;

  sendChatRunEvent({
    chatId,
    type: "chat.completed",
  });
}

function shouldMarkChatCompleted(state: ChatRunContext, chatId: string) {
  return isRendererWindowVisible() && state.activeChatId !== chatId;
}

function isRendererWindowVisible() {
  return document.visibilityState === "visible";
}

export function selectActiveRunForElicitation(
  state: Pick<ChatRunStore, "slots">,
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
  return slotMessagesWithStreaming(slot).some((message) =>
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
