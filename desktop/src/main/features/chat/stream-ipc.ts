import { BrowserWindow, ipcMain } from "electron";
import { type } from "arktype";

import {
  CHAT_STREAM_CANCEL_CHANNEL,
  CHAT_STREAM_ELICITATION_RESOLVE_CHANNEL,
  CHAT_STREAM_START_CHANNEL,
  chatStreamEventChannel,
  normalizeChatAttachmentsInput,
  type Chat,
  type ChatElicitation,
  type ChatElicitationResponse,
  type ChatStreamEvent,
  type ChatToolAction,
} from "../../../shared/chat";
import { streamChat, type ChatStreamControls } from "./angel-client";
import { getChat } from "./repository";
import {
  chatStreamElicitationResolveInput,
  chatStreamStartInput,
} from "./schemas";
import {
  notifyChatNeedsInput,
  notifyChatTurnCompleted,
} from "../../window-notifications";

type ActiveStream = {
  cancel: () => void;
  chat?: Chat;
  notifiedElicitationIds: Set<string>;
  resolveElicitation?: (
    elicitationId: string,
    response: ChatElicitationResponse,
  ) => Promise<void>;
  window?: BrowserWindow | null;
};

const activeStreams = new Map<string, ActiveStream>();

export function registerChatStreamIpc() {
  ipcMain.handle(CHAT_STREAM_START_CHANNEL, (event, payload: unknown) => {
    const requestResult = chatStreamStartInput(payload);
    if (requestResult instanceof type.errors) {
      throw new Error(`Invalid stream start input: ${requestResult.summary}`);
    }
    const request = requestResult;

    const sender = event.sender;
    const window = BrowserWindow.fromWebContents(sender);
    const abortController = new AbortController();
    let cancelled = false;

    const activeStream: ActiveStream = {
      cancel: () => {
        cancelled = true;
        abortController.abort();
        activeStreams.delete(request.streamId);
      },
      chat: request.input.chatId
        ? (getChat(request.input.chatId) ?? undefined)
        : undefined,
      notifiedElicitationIds: new Set(),
      window,
    };

    activeStreams.set(request.streamId, activeStream);

    const controls: ChatStreamControls = {
      setResolveElicitation(handler) {
        activeStream.resolveElicitation = handler;
      },
    };

    const sendEvent = (streamEvent: ChatStreamEvent) => {
      if (cancelled) return;
      handleStreamNotification(activeStream, streamEvent);
      if (sender.isDestroyed()) return;
      sender.send(chatStreamEventChannel(request.streamId), streamEvent);
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

    void streamChat(input, sendEvent, abortController.signal, controls)
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
    if (typeof streamId !== "string" || !streamId) {
      throw new Error("Stream id is required.");
    }
    const activeStream = activeStreams.get(streamId);
    activeStream?.cancel();
    return { cancelled: Boolean(activeStream) };
  });

  ipcMain.handle(
    CHAT_STREAM_ELICITATION_RESOLVE_CHANNEL,
    async (_event, payload: unknown) => {
      const requestResult = chatStreamElicitationResolveInput(payload);
      if (requestResult instanceof type.errors) {
        throw new Error(
          `Invalid elicitation resolve input: ${requestResult.summary}`,
        );
      }
      const request = requestResult;

      const activeStream = activeStreams.get(request.streamId);
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
  activeStream: ActiveStream,
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
  activeStream: ActiveStream,
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
  activeStream: ActiveStream,
  action: ChatToolAction,
) {
  if (action.phase !== "awaitingDecision") return;
  notifyOpenElicitation(activeStream, {
    body: action.inputSummary ?? action.rawInput ?? null,
    id: action.id,
    kind: "approval",
    phase: "open",
    title: action.title ?? "Permission required",
  });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
