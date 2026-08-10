import type {
  Chat,
  ChatActiveRunSnapshot,
  ChatRunObserverEvent,
  ChatRunStartInput,
} from "@angel-engine/daemon-api/chat";
import type {
  ActiveRun,
  AssistantAccumulator,
  ChatRunContext,
  ChatRunStore,
  StartRunInput,
  StartRunOptions,
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

/** The store's actions outside React. Hooks and the module wrappers below both read from here. */
export const chatRunActions: Omit<ChatRunStore, keyof ChatRunContext> = {
  attachToActiveRun(chatId, callbacks) {
    void attachToActiveRun(chatId, callbacks);
  },
  cancelRun(slotKey) {
    const slot = selectSlot(getChatRunContext(), slotKey);
    if (!slot?.activeRun) return;

    // Stop is the only observer-facing cancellation: it ends the daemon run,
    // then the slot machine's `streaming` exit detaches this observer.
    void stopDaemonRun(slot.activeRun.runId);
    sendChatRunEvent({ slotKey, type: "run.cancelled" });
  },
  dropAllRuns() {
    for (const slot of Object.values(getChatRunContext().slots)) {
      const activeRun = slot.activeRun;
      if (!activeRun) continue;
      // Dropping happens when the chats themselves are gone, so the runs must
      // die with them rather than keep executing headless in the daemon.
      void stopDaemonRun(activeRun.runId);
      cancelRunHandles(activeRun.runId);
    }
    sendChatRunEvent({ type: "slots.dropped" });
  },
  dropRun(slotKey) {
    const slot = selectSlot(getChatRunContext(), slotKey);
    if (slot?.activeRun) {
      void stopDaemonRun(slot.activeRun.runId);
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
    void handles?.resolveElicitation?.({
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
    const chatId = selectSlot(getChatRunContext(), slotKey)?.chatId ?? slotKey;
    const result = await getApiClient().chats.setMode({ chatId, mode });
    sendChatRunEvent({
      chat: result.chat,
      config: result.config,
      slotKey,
      type: "slot.configUpdated",
    });
    return result.config;
  },
  async setPermissionMode(slotKey, mode) {
    const chatId = selectSlot(getChatRunContext(), slotKey)?.chatId ?? slotKey;
    const result = await getApiClient().chats.setPermissionMode({
      chatId,
      mode,
    });
    sendChatRunEvent({
      chat: result.chat,
      config: result.config,
      slotKey,
      type: "slot.configUpdated",
    });
    return result.config;
  },
  async startRun({ callbacks, input, message, slotKey }) {
    const prompt = getMessageText(message);
    const attachments = getMessageAttachments(message);
    if (!prompt && attachments.length === 0) return;

    // create-before-run: a chat always exists before its first run starts, so
    // the run's slot is keyed by the real chat id from the very first event.
    const isDraft = !is.nonEmptyString(input.chatId);
    const draftConfig = isDraft
      ? selectSlot(getChatRunContext(), slotKey)?.config
      : undefined;
    const createdChat = isDraft ? await createChatForRun(input) : undefined;
    const chatId = createdChat?.id ?? input.chatId;
    if (!is.nonEmptyString(chatId)) return;

    const runSlotKey = chatId;
    const assistantMessageId = createId("assistant");
    const runId = createId("run");
    const startedAt = performance.now();
    const activeRun: ActiveRun = { assistantMessageId, runId, startedAt };
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

    const existing = selectSlot(getChatRunContext(), runSlotKey);
    if (existing?.activeRun) {
      // The daemon allows one run per chat, so the replaced run must end
      // before the new one is reserved.
      await stopDaemonRun(existing.activeRun.runId);
      cancelRunHandles(existing.activeRun.runId);
      disposeRunHandles(existing.activeRun.runId);
    }
    sendChatRunEvent({
      activeRun,
      assistantMessage,
      chatId,
      config: draftConfig,
      slotKey: runSlotKey,
      type: "run.started",
      userMessage,
    });
    // Announced only once the slot is streaming: the callback navigates to the
    // new chat, and the destination must already show the run.
    if (createdChat) callbacks?.onChatCreated?.(createdChat);

    const startInput: ChatRunStartInput = {
      attachments,
      chatId,
      mode: input.mode,
      model: input.model,
      permissionMode: input.permissionMode,
      reasoningEffort: input.reasoningEffort,
      text: prompt,
    };
    handles.resolveElicitation = (elicitationInput) =>
      getApiClient()
        .chatRuns.resolveElicitation(runId, elicitationInput)
        .then((): undefined => undefined);

    const completion = await consumeRunStream({
      activeRun,
      accumulator,
      handles,
      observe: (signal) =>
        getApiClient().chatRuns.start(runId, startInput, signal),
      slotKey: runSlotKey,
    });
    await settleRun({ callbacks, completion, handles, runId, runSlotKey });
  },
};

/**
 * `POST /api/chats` before `POST /api/chat-runs/:runId`. Prewarm rides on
 * creation, so a prewarmed session is claimed here rather than silently
 * dropped, and the chat id exists before the first run event arrives.
 */
async function createChatForRun(input: StartRunOptions): Promise<Chat> {
  return getApiClient().chats.create({
    creationLocation: input.creationLocation,
    cwd: input.cwd,
    model: input.model,
    mode: input.mode,
    permissionMode: input.permissionMode,
    prewarmId: input.prewarmId,
    projectId: input.projectId,
    reasoningEffort: input.reasoningEffort,
    runtime: input.runtime,
    title: input.title,
    worktreeSetupApproval: input.worktreeSetupApproval,
  });
}

/**
 * Reattaches to a run the daemon is still executing — after a chat switch, a
 * renderer reload, or a window reopening. The snapshot rebuilds the in-flight
 * turn; nothing is replayed from a journal.
 */
const attaching = new Set<string>();

async function attachToActiveRun(
  chatId: string,
  callbacks?: StartRunInput["callbacks"],
) {
  if (!is.nonEmptyString(chatId) || attaching.has(chatId)) return;
  if (selectSlot(getChatRunContext(), chatId)?.activeRun) return;

  attaching.add(chatId);
  try {
    const { run } = await getApiClient().chatRuns.active(chatId);
    if (run === null) return;
    if (selectSlot(getChatRunContext(), chatId)?.activeRun) return;

    const runId = run.runId;
    const startedAt = performance.now();
    const activeRun: ActiveRun = {
      assistantMessageId: run.assistantMessage.id,
      runId,
      startedAt,
    };
    const handles = createRunHandles(runId);
    const accumulator: AssistantAccumulator = {
      chunkCount: 0,
      createdAt: run.assistantMessage.createdAt,
      parts: [],
      status: { type: "running" },
    };
    handles.resolveElicitation = (elicitationInput) =>
      getApiClient()
        .chatRuns.resolveElicitation(runId, elicitationInput)
        .then((): undefined => undefined);
    sendChatRunEvent({
      activeRun,
      assistantMessage: createAssistantMessage(
        activeRun.assistantMessageId,
        accumulator,
        startedAt,
      ),
      chatId,
      slotKey: chatId,
      type: "run.started",
      userMessage: historyMessageToEngineMessage(run.userMessage),
    });

    const completion = await consumeRunStream({
      activeRun,
      accumulator,
      handles,
      observe: (signal) => observeFrom(run, signal),
      slotKey: chatId,
    });
    await settleRun({
      callbacks,
      completion,
      handles,
      runId,
      runSlotKey: chatId,
    });
  } catch {
    // A daemon that is down or a run that ended between the two calls simply
    // leaves the slot idle; the chat's persisted history still renders.
  } finally {
    attaching.delete(chatId);
  }
}

/**
 * Replays the snapshot already read from `active-run` before attaching, so the
 * observer contract ("snapshot first") holds without a second round trip.
 */
async function* observeFrom(
  snapshot: ChatActiveRunSnapshot,
  signal: AbortSignal,
): AsyncIterable<ChatRunObserverEvent> {
  yield { snapshot, type: "snapshot" };
  for await (const message of getApiClient().chatRuns.observe(
    snapshot.runId,
    signal,
  )) {
    yield message;
  }
}

async function settleRun({
  callbacks,
  completion,
  handles,
  runId,
  runSlotKey,
}: {
  callbacks?: StartRunInput["callbacks"];
  completion: Awaited<ReturnType<typeof consumeRunStream>>;
  handles: ReturnType<typeof createRunHandles>;
  runId: string;
  runSlotKey: string;
}) {
  const finalMessages = getActiveRunMessages(runSlotKey, runId);
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
        callbacks?.onChatMessagesUpdated?.(runSlotKey, historyMessages);
      }
    }
  } finally {
    finishRun(
      runSlotKey,
      runId,
      completion.assistantMessage,
      completion.result,
    );
    disposeRunHandles(runId);
  }
}

/** Ends a daemon-owned run. The only calls are Stop and chat teardown. */
function stopDaemonRun(runId: string) {
  return getApiClient()
    .chatRuns.stop(runId)
    .then((): undefined => undefined)
    .catch((): undefined => undefined);
}

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

export function useActiveChatRunCount() {
  return useChatRunStore(
    (state) =>
      Object.values(state.slots).filter((slot) => slot.status === "streaming")
        .length,
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
