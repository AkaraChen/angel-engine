import { ipcMain } from "electron";

import {
  CHAT_STREAM_CANCEL_CHANNEL,
  CHAT_STREAM_ELICITATION_RESOLVE_CHANNEL,
  CHAT_STREAM_START_CHANNEL,
  chatStreamEventChannel,
  normalizeChatAttachmentsInput,
  type ChatElicitationResponse,
  type ChatSendInput,
  type ChatStreamElicitationResolveInput,
  type ChatStreamEvent,
  type ChatStreamStartInput,
} from "../../shared/chat";
import { normalizeAgentRuntime } from "../../shared/agents";
import { streamChat, type ChatStreamControls } from "./angel-client";

type ActiveStream = {
  cancel: () => void;
  resolveElicitation?: (
    elicitationId: string,
    response: ChatElicitationResponse,
  ) => Promise<void>;
};

const activeStreams = new Map<string, ActiveStream>();

export function registerChatStreamIpc() {
  ipcMain.handle(CHAT_STREAM_START_CHANNEL, (event, payload: unknown) => {
    const request = assertChatStreamStartInput(payload);
    const sender = event.sender;
    const abortController = new AbortController();
    let cancelled = false;

    const activeStream: ActiveStream = {
      cancel: () => {
        cancelled = true;
        abortController.abort();
        activeStreams.delete(request.streamId);
      },
    };

    activeStreams.set(request.streamId, activeStream);

    const controls: ChatStreamControls = {
      setResolveElicitation(handler) {
        activeStream.resolveElicitation = handler;
      },
    };

    const sendEvent = (streamEvent: ChatStreamEvent) => {
      if (cancelled || sender.isDestroyed()) return;
      sender.send(chatStreamEventChannel(request.streamId), streamEvent);
    };

    void streamChat(request.input, sendEvent, abortController.signal, controls)
      .then((result) => sendEvent({ result, type: "result" }))
      .catch((error: unknown) =>
        sendEvent({ message: getErrorMessage(error), type: "error" }),
      )
      .finally(() => {
        sendEvent({ type: "done" });
        activeStreams.delete(request.streamId);
      });

    return { started: true };
  });

  ipcMain.handle(CHAT_STREAM_CANCEL_CHANNEL, (_event, streamId: unknown) => {
    const activeStream = activeStreams.get(
      assertString(streamId, "Stream id is required."),
    );
    activeStream?.cancel();
    return { cancelled: Boolean(activeStream) };
  });

  ipcMain.handle(
    CHAT_STREAM_ELICITATION_RESOLVE_CHANNEL,
    async (_event, payload: unknown) => {
      const request = assertChatStreamElicitationResolveInput(payload);
      const activeStream = activeStreams.get(request.streamId);
      if (!activeStream?.resolveElicitation) {
        throw new Error("Chat stream is not waiting for user input.");
      }
      await activeStream.resolveElicitation(
        request.elicitationId,
        request.response,
      );
      return { resolved: true };
    },
  );
}

function assertChatStreamStartInput(input: unknown): ChatStreamStartInput {
  if (!input || typeof input !== "object") {
    throw new Error("Chat stream input is required.");
  }

  const value = input as Partial<ChatStreamStartInput>;
  return {
    input: assertChatSendInput(value.input),
    streamId: assertString(value.streamId, "Stream id is required."),
  };
}

function assertChatSendInput(input: unknown): ChatSendInput {
  if (!input || typeof input !== "object") {
    throw new Error("Chat input is required.");
  }

  const value = input as Partial<ChatSendInput>;
  return {
    attachments: normalizeChatAttachmentsInput(value.attachments),
    chatId:
      typeof value.chatId === "string" && value.chatId.trim()
        ? value.chatId.trim()
        : undefined,
    cwd:
      typeof value.cwd === "string" && value.cwd.trim() ? value.cwd : undefined,
    model: normalizeOptionalConfigInput(value.model),
    projectId:
      typeof value.projectId === "string" && value.projectId.trim()
        ? value.projectId.trim()
        : null,
    mode: normalizeOptionalConfigInput(value.mode),
    prewarmId:
      typeof value.prewarmId === "string" && value.prewarmId.trim()
        ? value.prewarmId.trim()
        : undefined,
    reasoningEffort: normalizeOptionalConfigInput(value.reasoningEffort),
    runtime: normalizeOptionalRuntime(value.runtime),
    text: assertString(value.text, "Chat text is required."),
  };
}

function assertString(value: unknown, message: string) {
  if (typeof value !== "string") {
    throw new Error(message);
  }
  return value;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function normalizeOptionalRuntime(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return normalizeAgentRuntime(value);
}

function normalizeOptionalConfigInput(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function assertChatStreamElicitationResolveInput(
  input: unknown,
): ChatStreamElicitationResolveInput {
  if (!input || typeof input !== "object") {
    throw new Error("Elicitation response is required.");
  }

  const value = input as Partial<ChatStreamElicitationResolveInput>;
  return {
    elicitationId: assertString(
      value.elicitationId,
      "Elicitation id is required.",
    ),
    response: assertChatElicitationResponse(value.response),
    streamId: assertString(value.streamId, "Stream id is required."),
  };
}

function assertChatElicitationResponse(
  response: unknown,
): ChatElicitationResponse {
  if (!response || typeof response !== "object") {
    throw new Error("Elicitation response is required.");
  }

  const value = response as Partial<ChatElicitationResponse>;
  switch (value.type) {
    case "allow":
    case "allowForSession":
    case "deny":
    case "cancel":
    case "externalComplete":
      return { type: value.type };
    case "answers":
      if (!Array.isArray(value.answers)) {
        throw new Error("Elicitation answers are required.");
      }
      return {
        answers: value.answers.map((answer) => {
          if (!answer || typeof answer !== "object") {
            throw new Error("Elicitation answer is invalid.");
          }
          const answerValue = answer as { id?: unknown; value?: unknown };
          return {
            id: assertString(answerValue.id, "Answer id is required."),
            value: assertString(answerValue.value, "Answer value is required."),
          };
        }),
        type: "answers",
      };
    case "dynamicToolResult":
      if (typeof value.success !== "boolean") {
        throw new Error("Dynamic tool result success is required.");
      }
      return { success: value.success, type: "dynamicToolResult" };
    case "raw":
      return {
        type: "raw",
        value: assertString(value.value, "Raw response value is required."),
      };
    default:
      throw new Error("Unsupported elicitation response.");
  }
}
