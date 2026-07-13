import type {
  Chat,
  ChatElicitation,
  ChatElicitationResponse,
  ChatHistoryMessagePart,
  ChatSendInput,
  ChatToolAction,
} from "@angel-engine/daemon-api/chat";
import type {
  ActiveRun,
  AssistantAccumulator,
  AssistantMaterializationCache,
  RunCompletion,
} from "./chat-run-types";
import {
  appendChatTextPart,
  cloneChatHistoryPart,
  isTerminalChatToolPhase,
} from "@angel-engine/daemon-api/chat";
import { streamChatEvents } from "@/features/chat/api/chat-stream";
import {
  createAssistantMessage,
  materializeAssistantMessage,
} from "./chat-run-assistant";
import {
  appendToolActionDeltaPart,
  chatElicitationFromAction,
  isPermissionElicitation,
  isPlanApprovalElicitation,
  isPlanApprovalToolAction,
  markToolActionPermissionApprovedLocally,
  resolveElicitationPartLocally,
  upsertElicitationPart,
  upsertToolActionPart,
  upsertTurnPlanPartAtEnd,
} from "./chat-run-parts";
import { selectSlot } from "./chat-run-reducer";
import {
  getChatRunContext,
  markChatAttention,
  moveActiveRunToChat,
  replaceAssistantMessage,
} from "./chat-run-registry";

const STREAM_FLUSH_MIN_CHARS = 24;
const STREAM_FLUSH_MAX_MS = 80;
const ALLOW_PERMISSION_RESPONSE: ChatElicitationResponse = { type: "allow" };

export async function consumeRunStream({
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
  const assistantMaterializationCache: AssistantMaterializationCache = {
    engineParts: currentAssistantMessage.content,
  };
  let minDirtyIndex = accumulator.parts.length;
  const markDirty = (index?: number) => {
    dirty = true;
    if (index !== undefined) {
      minDirtyIndex = Math.min(minDirtyIndex, index);
    }
  };

  const flush = async () => {
    if (!dirty) return true;

    const nextAssistantMessage = materializeAssistantMessage(
      activeRun.assistantMessageId,
      accumulator,
      activeRun.startedAt,
      assistantMaterializationCache,
      minDirtyIndex,
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
    minDirtyIndex = accumulator.parts.length;
    pendingDeltaChars = 0;
    lastFlushAt = performance.now();
    await yieldToRendererTask();
    return true;
  };
  activeRun.resolveElicitationLocally = (elicitationId, response) => {
    markDirty(
      resolveElicitationPartLocally(accumulator.parts, elicitationId, response),
    );
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
        accumulator.parts.push({
          data: {
            message: event.message,
            source: "runtime",
            type: "chat-error",
          },
          name: "chat-error",
          type: "data",
        });
        markDirty(accumulator.parts.length - 1);
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
          markDirty(0);
        } else {
          markDirty();
        }
        markChatAttention(event.result.chatId, "completed");
        if (!(await flush())) break;
        continue;
      }

      accumulator.chunkCount += 1;
      let autoApprovedPermission = false;
      let shouldFlushToolState = false;
      if (event.type === "elicitation") {
        markDirty(upsertElicitationPart(accumulator.parts, event.elicitation));
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
        markDirty(upsertToolActionPart(accumulator.parts, event.action));
        shouldFlushToolState = isTerminalChatToolPhase(event.action.phase);
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
        const delta = appendToolActionDeltaPart(
          accumulator.parts,
          event.action,
        );
        markDirty(delta.index);
        pendingDeltaChars += delta.textLength;
        shouldFlushToolState = isTerminalChatToolPhase(event.action.phase);
      } else if (event.type === "plan") {
        markDirty(upsertTurnPlanPartAtEnd(accumulator.parts, event.plan));
      } else {
        appendChatTextPart(accumulator.parts, event.part, event.text);
        markDirty(accumulator.parts.length - 1);
        pendingDeltaChars += event.text.length;
      }
      if (
        autoApprovedPermission ||
        event.type === "elicitation" ||
        (event.type === "tool" && event.action.phase === "awaitingDecision") ||
        shouldFlushToolState
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
    markDirty();
    await flush();
  } catch (error) {
    if (activeRun.abortController.signal.aborted) {
      accumulator.status = { reason: "cancelled", type: "incomplete" };
      markDirty();
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
    accumulator.parts.push({
      data: {
        message,
        source: "runtime",
        type: "chat-error",
      },
      name: "chat-error",
      type: "data",
    });
    markDirty(accumulator.parts.length - 1);
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
  const response = shouldAutoApprovePermission(
    activeRun,
    slotKey,
    elicitation.id,
  );
  if (!response) {
    return false;
  }

  resolveElicitationPartLocally(parts, elicitation.id, response);
  sendAutoPermissionApproval(activeRun, elicitation.id, response);
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
  const response = shouldAutoApprovePermission(
    activeRun,
    slotKey,
    elicitationId,
  );
  if (!response) {
    return false;
  }

  markToolActionPermissionApprovedLocally(parts, action.id);
  sendAutoPermissionApproval(activeRun, elicitationId, response);
  return true;
}

function shouldAutoApprovePermission(
  activeRun: ActiveRun,
  slotKey: string,
  elicitationId: string,
): ChatElicitationResponse | undefined {
  if (!activeRun.streamController) return undefined;
  const slot = selectSlot(getChatRunContext(), slotKey);
  if (!slot?.permissionBypassEnabled) return undefined;
  if (activeRun.autoApprovedPermissionIds.has(elicitationId)) return undefined;

  activeRun.autoApprovedPermissionIds.add(elicitationId);
  return slot.permissionBypassResponse ?? ALLOW_PERMISSION_RESPONSE;
}

function sendAutoPermissionApproval(
  activeRun: ActiveRun,
  elicitationId: string,
  response: ChatElicitationResponse,
) {
  void activeRun.streamController
    ?.resolveElicitation({
      elicitationId,
      response,
    })
    .catch((): undefined => undefined);
}

async function yieldToRendererTask() {
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
