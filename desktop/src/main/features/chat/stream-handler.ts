import type { BrowserWindow } from "electron";
import type {
  Chat,
  ChatElicitation,
  ChatElicitationResponse,
  ChatStreamEvent,
  ChatStreamStartInput,
  ChatToolAction,
} from "../../../shared/chat";
import type { ChatRuntime, ChatStreamControls } from "./runtime";

import { type } from "arktype";
import { ipcMain } from "electron";
import {
  CHAT_STREAM_CANCEL_CHANNEL,
  CHAT_STREAM_ELICITATION_RESOLVE_CHANNEL,
  CHAT_STREAM_START_CHANNEL,
  chatStreamEventChannel,
  normalizeChatAttachmentsInput,
} from "../../../shared/chat";
import { createStreamProtocol } from "../../ipc/stream-protocol";
import { translate } from "../../platform/i18n";
import {
  notifyChatNeedsInput,
  notifyChatTurnCompleted,
} from "../../windows/notifications";
import { getChat } from "./repository";
import {
  chatStreamElicitationResolveInput,
  chatStreamStartInput,
} from "./schemas";

interface ActiveChatStream {
  chat?: Chat;
  notifiedElicitationIds: Set<string>;
  resolveElicitation?: (
    elicitationId: string,
    response: ChatElicitationResponse,
  ) => Promise<void>;
  window?: BrowserWindow | null;
}

const activeChatStreams = new Map<string, ActiveChatStream>();
const abortControllers = new Map<string, AbortController>();

export function registerChatStreamIpc(runtime: ChatRuntime) {
  const streamProtocol = createStreamProtocol<
    ChatStreamStartInput,
    ChatStreamEvent
  >({
    cancelChannel: CHAT_STREAM_CANCEL_CHANNEL,
    eventChannel: chatStreamEventChannel,
    getStreamId: (request) => request.streamId,
    onCancel(streamId) {
      abortControllers.get(streamId)?.abort();
      abortControllers.delete(streamId);
      activeChatStreams.delete(streamId);
    },
    onStart({ activeStream: protocolStream, request: payload }) {
      const requestResult = chatStreamStartInput(payload);
      if (requestResult instanceof type.errors) {
        throw new TypeError(
          `Invalid stream start input: ${requestResult.summary}`,
        );
      }
      const request = requestResult;
      const abortController = new AbortController();
      abortControllers.set(request.streamId, abortController);

      const activeStream: ActiveChatStream = {
        chat: request.input.chatId
          ? (getChat(request.input.chatId) ?? undefined)
          : undefined,
        notifiedElicitationIds: new Set(),
        window: protocolStream.window,
      };
      activeChatStreams.set(request.streamId, activeStream);

      const controls: ChatStreamControls = {
        setResolveElicitation(handler) {
          activeStream.resolveElicitation = handler;
        },
      };

      const sendEvent = (streamEvent: ChatStreamEvent) => {
        handleStreamNotification(activeStream, streamEvent);
        protocolStream.send(streamEvent);
      };

      const input = {
        attachments: normalizeChatAttachmentsInput(request.input.attachments),
        chatId: request.input.chatId,
        model: request.input.model,
        projectId: request.input.projectId,
        mode: request.input.mode,
        permissionMode: request.input.permissionMode,
        prewarmId: request.input.prewarmId,
        reasoningEffort: request.input.reasoningEffort,
        runtime: request.input.runtime ?? undefined,
        text: request.input.text,
      };

      void runtime
        .streamChat(input, sendEvent, abortController.signal, controls)
        .then((result) => sendEvent({ result, type: "result" }))
        .catch((error: unknown) =>
          sendEvent({ message: getErrorMessage(error), type: "error" }),
        )
        .finally(() => {
          sendEvent({ type: "done" });
          streamProtocol.delete(request.streamId);
          abortControllers.delete(request.streamId);
          activeChatStreams.delete(request.streamId);
        });
    },
    startChannel: CHAT_STREAM_START_CHANNEL,
  });

  ipcMain.handle(
    CHAT_STREAM_ELICITATION_RESOLVE_CHANNEL,
    async (_event, payload: unknown) => {
      const requestResult = chatStreamElicitationResolveInput(payload);
      if (requestResult instanceof type.errors) {
        throw new TypeError(
          `Invalid elicitation resolve input: ${requestResult.summary}`,
        );
      }
      const request = requestResult;

      const activeStream = activeChatStreams.get(request.streamId);
      if (!activeStream?.resolveElicitation) {
        throw new Error("Chat stream is not waiting for user input.");
      }
      await activeStream.resolveElicitation(
        request.elicitationId,
        request.response as ChatElicitationResponse,
      );
      return { resolved: true };
    },
  );
}

function handleStreamNotification(
  activeStream: ActiveChatStream,
  streamEvent: ChatStreamEvent,
) {
  if (streamEvent.type === "chat") {
    activeStream.chat = streamEvent.chat;
    return;
  }

  if (streamEvent.type === "result") {
    activeStream.chat = streamEvent.result.chat;
    notifyChatTurnCompleted({
      body: streamEvent.result.text,
      chat: streamEvent.result.chat,
      window: activeStream.window,
    });
    return;
  }

  if (streamEvent.type === "elicitation") {
    notifyOpenElicitation(activeStream, streamEvent.elicitation);
    return;
  }

  if (streamEvent.type === "tool") {
    notifyAwaitingToolAction(activeStream, streamEvent.action);
  }
}

function notifyOpenElicitation(
  activeStream: ActiveChatStream,
  elicitation: ChatElicitation,
) {
  if (elicitation.phase !== "open") return;
  if (activeStream.notifiedElicitationIds.has(elicitation.id)) {
    return;
  }

  const chat = activeStream.chat;
  if (!chat) return;

  activeStream.notifiedElicitationIds.add(elicitation.id);
  notifyChatNeedsInput({
    chat,
    elicitation,
    window: activeStream.window,
  });
}

function notifyAwaitingToolAction(
  activeStream: ActiveChatStream,
  action: ChatToolAction,
) {
  if (action.phase !== "awaitingDecision") return;
  notifyOpenElicitation(activeStream, {
    body: action.inputSummary ?? action.rawInput ?? null,
    id: action.id,
    kind: "approval",
    phase: "open",
    title: action.title ?? translate("notifications.permissionRequired"),
  });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
