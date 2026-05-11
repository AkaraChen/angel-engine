import { ipcMain } from "electron";
import { type } from "arktype";

import {
  CHAT_STREAM_CANCEL_CHANNEL,
  CHAT_STREAM_ELICITATION_RESOLVE_CHANNEL,
  CHAT_STREAM_START_CHANNEL,
  chatStreamEventChannel,
  normalizeChatAttachmentsInput,
  type ChatElicitationResponse,
  type ChatStreamEvent,
} from "../../../shared/chat";
import { normalizeAgentRuntime } from "../../../shared/agents";
import { streamChat, type ChatStreamControls } from "./angel-client";
import {
  chatStreamElicitationResolveInput,
  chatStreamStartInput,
} from "./schemas";

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
    const requestResult = chatStreamStartInput(payload);
    if (requestResult instanceof type.errors) {
      throw new Error(`Invalid stream start input: ${requestResult.summary}`);
    }
    const request = requestResult;

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

    const input = {
      attachments: normalizeChatAttachmentsInput(request.input.attachments),
      chatId: request.input.chatId,
      cwd: request.input.cwd,
      model: request.input.model,
      projectId: request.input.projectId,
      mode: request.input.mode,
      prewarmId: request.input.prewarmId,
      reasoningEffort: request.input.reasoningEffort,
      runtime: request.input.runtime
        ? normalizeAgentRuntime(request.input.runtime)
        : undefined,
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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
