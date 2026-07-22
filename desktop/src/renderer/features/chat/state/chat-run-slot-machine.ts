import type { Chat, ChatRuntimeConfig } from "@angel-engine/daemon-api/chat";
import type {
  ActiveRun,
  ChatRunSlot,
  EngineMessage,
  InitializeSlotInput,
} from "./chat-run-types";

import { assign, setup } from "xstate";
import { markAssistantMessageCancelled } from "./chat-run-assistant";
import { cancelRunHandles } from "./chat-run-handles";
import { normalizeEnginePlanMessages } from "./chat-run-plan";
import { EMPTY_MESSAGES } from "./chat-run-types";

/** Slot-scoped events, addressed to one slot actor by the registry. */
export type ChatRunSlotEvent =
  | {
      input: InitializeSlotInput;
      messages: EngineMessage[];
      type: "slot.refresh";
    }
  | { chat: Chat; config: ChatRuntimeConfig; type: "slot.configUpdated" }
  | {
      response: NonNullable<ChatRunSlot["permissionBypassResponse"]>;
      type: "slot.permissionBypassEnabled";
    }
  | {
      activeRun: ActiveRun;
      assistantMessage: EngineMessage;
      type: "run.started";
      userMessage: EngineMessage;
    }
  | { message: EngineMessage; runId: string; type: "assistant.replaced" }
  | {
      chatId: string;
      config?: ChatRuntimeConfig;
      runId: string;
      type: "chat.bound";
    }
  | {
      assistantMessage: EngineMessage;
      chatId?: string;
      config?: ChatRuntimeConfig;
      runId: string;
      type: "run.finished";
    }
  | { type: "run.cancelled" };

export interface ChatRunSlotContext {
  activeRun?: ActiveRun;
  chatId?: string;
  config?: ChatRuntimeConfig;
  historyRevision: number;
  key: string;
  messages: EngineMessage[];
  permissionBypassEnabled: boolean;
  permissionBypassResponse: ChatRunSlot["permissionBypassResponse"];
  streamingAssistant?: EngineMessage;
}

export interface ChatRunSlotInput {
  chatId?: string;
  config?: ChatRuntimeConfig;
  historyRevision: number;
  key: string;
  messages?: EngineMessage[];
}

function mergeCancelledStreaming(context: ChatRunSlotContext): EngineMessage[] {
  if (
    context.streamingAssistant === undefined ||
    context.activeRun === undefined
  ) {
    return context.messages;
  }
  return markAssistantMessageCancelled(
    [...context.messages, context.streamingAssistant],
    context.activeRun.assistantMessageId,
  );
}

/**
 * One conversation surface. The `idle`/`streaming` statechart is the real
 * per-slot lifecycle: streaming-only events (`assistant.replaced`,
 * `run.finished`, `chat.bound`) are accepted only in `streaming` and only for
 * the active run's id, so stale stream events die here instead of being
 * guarded in every reducer.
 */
export const chatRunSlotMachine = setup({
  guards: {
    isActiveRun: ({ context }, params: { runId: string }) =>
      context.activeRun?.runId === params.runId,
  },
  types: {
    context: {} as ChatRunSlotContext,
    events: {} as ChatRunSlotEvent,
    input: {} as ChatRunSlotInput,
  },
}).createMachine({
  context: ({ input }) => ({
    chatId: input.chatId,
    config: input.config,
    historyRevision: input.historyRevision,
    key: input.key,
    messages: input.messages ?? EMPTY_MESSAGES,
    permissionBypassEnabled: false,
    permissionBypassResponse: undefined,
  }),
  id: "chatRunSlot",
  initial: "idle",
  on: {
    "slot.configUpdated": {
      actions: assign(({ event }) => ({
        chatId: event.chat.id,
        config: event.config,
      })),
    },
    "slot.permissionBypassEnabled": {
      actions: assign(({ event }) => ({
        permissionBypassEnabled: true,
        permissionBypassResponse: event.response,
      })),
    },
  },
  states: {
    idle: {
      on: {
        "run.started": {
          actions: assign(({ context, event }) => ({
            activeRun: event.activeRun,
            messages: normalizeEnginePlanMessages([
              ...context.messages,
              event.userMessage,
            ]),
            streamingAssistant: event.assistantMessage,
          })),
          target: "streaming",
        },
        "slot.refresh": {
          actions: assign(({ context, event }) => {
            if (
              context.historyRevision === event.input.historyRevision &&
              context.config === event.input.config &&
              context.chatId === (event.input.chatId ?? context.chatId)
            ) {
              return {};
            }
            return {
              chatId: event.input.chatId ?? context.chatId,
              config: event.input.config ?? context.config,
              historyRevision: event.input.historyRevision,
              messages: normalizeEnginePlanMessages(event.messages),
            };
          }),
        },
      },
    },
    streaming: {
      // Leaving `streaming` for any reason (finish, cancel, replacement run)
      // aborts the run's stream: interruption is owned by the statechart.
      exit: ({ context }) => {
        if (context.activeRun) cancelRunHandles(context.activeRun.runId);
      },
      on: {
        "assistant.replaced": {
          actions: assign(({ event }) => ({
            streamingAssistant: event.message,
          })),
          guard: {
            params: ({ event }) => ({ runId: event.runId }),
            type: "isActiveRun",
          },
        },
        "chat.bound": {
          actions: assign(({ context, event }) => ({
            chatId: event.chatId,
            config: context.config ?? event.config,
          })),
          guard: {
            params: ({ event }) => ({ runId: event.runId }),
            type: "isActiveRun",
          },
        },
        "run.cancelled": {
          actions: assign(({ context }) => ({
            activeRun: undefined,
            messages: normalizeEnginePlanMessages(
              mergeCancelledStreaming(context),
            ),
            streamingAssistant: undefined,
          })),
          target: "idle",
        },
        "run.finished": {
          actions: assign(({ context, event }) => ({
            activeRun: undefined,
            chatId: event.chatId ?? context.chatId,
            config: event.config ?? context.config,
            messages: normalizeEnginePlanMessages([
              ...context.messages,
              event.assistantMessage,
            ]),
            streamingAssistant: undefined,
          })),
          guard: {
            params: ({ event }) => ({ runId: event.runId }),
            type: "isActiveRun",
          },
          target: "idle",
        },
        "run.started": {
          // A new run over a streaming slot cancels the previous one first;
          // re-entering fires the exit action, aborting the replaced stream.
          actions: assign(({ context, event }) => ({
            activeRun: event.activeRun,
            messages: normalizeEnginePlanMessages([
              ...mergeCancelledStreaming(context),
              event.userMessage,
            ]),
            streamingAssistant: event.assistantMessage,
          })),
          reenter: true,
          target: "streaming",
        },
        "slot.refresh": {
          // While streaming, only late-arriving identity/config may merge in.
          actions: assign(({ context, event }) => ({
            chatId: event.input.chatId ?? context.chatId,
            config: event.input.config ?? context.config,
          })),
        },
      },
    },
  },
});
