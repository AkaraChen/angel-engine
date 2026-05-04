import { ipcMain } from 'electron';

import {
  CHAT_STREAM_CANCEL_CHANNEL,
  CHAT_STREAM_START_CHANNEL,
  chatStreamEventChannel,
  type ChatSendInput,
  type ChatStreamEvent,
  type ChatStreamStartInput,
} from '../../shared/chat';
import { normalizeAgentRuntime } from '../../shared/agents';
import { streamChat } from './angel-client';

const activeStreams = new Map<string, () => void>();

export function registerChatStreamIpc() {
  ipcMain.handle(CHAT_STREAM_START_CHANNEL, (event, payload: unknown) => {
    const request = assertChatStreamStartInput(payload);
    const sender = event.sender;
    const abortController = new AbortController();
    let cancelled = false;

    activeStreams.set(request.streamId, () => {
      cancelled = true;
      abortController.abort();
      activeStreams.delete(request.streamId);
    });

    const sendEvent = (streamEvent: ChatStreamEvent) => {
      if (cancelled || sender.isDestroyed()) return;
      sender.send(chatStreamEventChannel(request.streamId), streamEvent);
    };

    void streamChat(request.input, sendEvent, abortController.signal)
      .then((result) => sendEvent({ result, type: 'result' }))
      .catch((error: unknown) =>
        sendEvent({ message: getErrorMessage(error), type: 'error' })
      )
      .finally(() => {
        sendEvent({ type: 'done' });
        activeStreams.delete(request.streamId);
      });

    return { started: true };
  });

  ipcMain.handle(CHAT_STREAM_CANCEL_CHANNEL, (_event, streamId: unknown) => {
    const cancel = activeStreams.get(assertString(streamId, 'Stream id is required.'));
    cancel?.();
    return { cancelled: Boolean(cancel) };
  });
}

function assertChatStreamStartInput(input: unknown): ChatStreamStartInput {
  if (!input || typeof input !== 'object') {
    throw new Error('Chat stream input is required.');
  }

  const value = input as Partial<ChatStreamStartInput>;
  return {
    input: assertChatSendInput(value.input),
    streamId: assertString(value.streamId, 'Stream id is required.'),
  };
}

function assertChatSendInput(input: unknown): ChatSendInput {
  if (!input || typeof input !== 'object') {
    throw new Error('Chat input is required.');
  }

  const value = input as Partial<ChatSendInput>;
  return {
    chatId:
      typeof value.chatId === 'string' && value.chatId.trim()
        ? value.chatId.trim()
        : undefined,
    cwd: typeof value.cwd === 'string' && value.cwd.trim() ? value.cwd : undefined,
    projectId:
      typeof value.projectId === 'string' && value.projectId.trim()
        ? value.projectId.trim()
        : null,
    mode: normalizeOptionalConfigInput(value.mode),
    reasoningEffort: normalizeOptionalConfigInput(value.reasoningEffort),
    runtime: normalizeOptionalRuntime(value.runtime),
    text: assertString(value.text, 'Chat text is required.'),
  };
}

function assertString(value: unknown, message: string) {
  if (typeof value !== 'string') {
    throw new Error(message);
  }
  return value;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function normalizeOptionalRuntime(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return normalizeAgentRuntime(value);
}

function normalizeOptionalConfigInput(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}
