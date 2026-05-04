import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useExternalStoreRuntime,
  type AppendMessage,
  type AssistantRuntime,
  type ExternalStoreAdapter,
  type MessageStatus,
  type ThreadMessageLike,
} from '@assistant-ui/react';

import { streamChatEvents } from '@/lib/chat-stream';
import type {
  Chat,
  ChatHistoryMessage,
  ChatSendInput,
  ChatSendResult,
} from '@/shared/chat';

const STREAM_FLUSH_MIN_CHARS = 24;
const STREAM_FLUSH_MAX_MS = 80;

type EngineMessage = ThreadMessageLike & { id: string };
type EngineRuntimeAdapters = NonNullable<
  ExternalStoreAdapter<EngineMessage>['adapters']
>;

export type EngineRuntimeOptions = {
  adapters: EngineRuntimeAdapters;
  chatId?: string;
  historyMessages: ChatHistoryMessage[];
  historyRevision: number;
  onChatUpdated?: (chat: Chat) => void;
  projectId?: string | null;
  projectPath?: string;
};

type ActiveRun = {
  abortController: AbortController;
  assistantMessageId: string;
  cancelled: boolean;
  startedAt: number;
};

type AssistantAccumulator = {
  chunkCount: number;
  error?: string;
  reasoning: string;
  result?: ChatSendResult;
  status: MessageStatus;
  text: string;
};

export function useEngineRuntime({
  adapters,
  chatId,
  historyMessages,
  historyRevision,
  onChatUpdated,
  projectId,
  projectPath,
}: EngineRuntimeOptions): AssistantRuntime {
  const [isRunning, setIsRunning] = useState(false);
  const [messages, setMessages] = useState<EngineMessage[]>(() =>
    historyMessages.map(historyMessageToEngineMessage)
  );
  const activeRunRef = useRef<ActiveRun | null>(null);
  const latestOptionsRef = useRef({
    chatId,
    onChatUpdated,
    projectId,
    projectPath,
  });

  latestOptionsRef.current = {
    chatId,
    onChatUpdated,
    projectId,
    projectPath,
  };

  useEffect(() => {
    const activeRun = activeRunRef.current;
    if (activeRun) {
      activeRun.cancelled = true;
      activeRun.abortController.abort();
      activeRunRef.current = null;
    }

    setIsRunning(false);
    setMessages(historyMessages.map(historyMessageToEngineMessage));
  }, [historyMessages, historyRevision]);

  const replaceAssistantMessage = useCallback(
    (assistantMessageId: string, message: EngineMessage) => {
      setMessages((current) =>
        current.map((item) => (item.id === assistantMessageId ? message : item))
      );
    },
    []
  );

  const cancelRun = useCallback(async () => {
    const activeRun = activeRunRef.current;
    if (!activeRun) return;

    activeRun.cancelled = true;
    activeRun.abortController.abort();
    setIsRunning(false);
  }, []);

  const runMessage = useCallback(
    async (message: AppendMessage) => {
      const prompt = getMessageText(message);
      if (!prompt) return;

      const previousRun = activeRunRef.current;
      if (previousRun) {
        previousRun.cancelled = true;
        previousRun.abortController.abort();
      }

      const assistantMessageId = createId('assistant');
      const userMessage = appendMessageToEngineMessage(message, createId('user'));
      const startedAt = performance.now();
      const activeRun: ActiveRun = {
        abortController: new AbortController(),
        assistantMessageId,
        cancelled: false,
        startedAt,
      };
      activeRunRef.current = activeRun;

      const accumulator: AssistantAccumulator = {
        chunkCount: 0,
        reasoning: '',
        status: { type: 'running' },
        text: '',
      };
      const assistantMessage = createAssistantMessage(
        assistantMessageId,
        accumulator,
        startedAt
      );

      setIsRunning(true);
      setMessages((current) => [...current, userMessage, assistantMessage]);

      try {
        await consumeRunStream({
          activeRun,
          accumulator,
          input: {
            chatId: latestOptionsRef.current.chatId,
            cwd: latestOptionsRef.current.projectPath,
            projectId: latestOptionsRef.current.projectId,
            text: prompt,
          },
          onChatUpdated: latestOptionsRef.current.onChatUpdated,
          replaceAssistantMessage,
        });
      } finally {
        if (activeRunRef.current === activeRun) {
          activeRunRef.current = null;
          setIsRunning(false);
        }
      }
    },
    [replaceAssistantMessage]
  );

  const store = useMemo<ExternalStoreAdapter<EngineMessage>>(
    () => ({
      adapters,
      convertMessage: (message) => message,
      isRunning,
      messages,
      onCancel: cancelRun,
      onNew: runMessage,
    }),
    [adapters, cancelRun, isRunning, messages, runMessage]
  );

  return useExternalStoreRuntime(store);
}

async function consumeRunStream({
  activeRun,
  accumulator,
  input,
  onChatUpdated,
  replaceAssistantMessage,
}: {
  activeRun: ActiveRun;
  accumulator: AssistantAccumulator;
  input: ChatSendInput;
  onChatUpdated?: (chat: Chat) => void;
  replaceAssistantMessage: (
    assistantMessageId: string,
    message: EngineMessage
  ) => void;
}) {
  let dirty = false;
  let pendingDeltaChars = 0;
  let lastFlushAt = performance.now();

  const flush = async (reason: string) => {
    if (!dirty) return;

    const nextAssistantMessage = createAssistantMessage(
      activeRun.assistantMessageId,
      accumulator,
      activeRun.startedAt
    );
    replaceAssistantMessage(
      activeRun.assistantMessageId,
      nextAssistantMessage
    );
    dirty = false;
    pendingDeltaChars = 0;
    lastFlushAt = performance.now();
    await yieldToRendererTask();
  };

  try {
    for await (const event of streamChatEvents(
      input,
      activeRun.abortController.signal
    )) {
      if (activeRun.cancelled) break;

      if (event.type === 'done') break;

      if (event.type === 'error') {
        accumulator.error = event.message;
        accumulator.status = {
          error: event.message,
          reason: 'error',
          type: 'incomplete',
        };
        accumulator.text = `Backend chat failed: ${event.message}`;
        dirty = true;
        await flush('error');
        break;
      }

      if (event.type === 'result') {
        onChatUpdated?.(event.result.chat);
        accumulator.result = event.result;
        accumulator.reasoning = event.result.reasoning || accumulator.reasoning;
        accumulator.text = event.result.text || accumulator.text;
        dirty = true;
        await flush('result');
        continue;
      }

      accumulator.chunkCount += 1;
      if (event.part === 'reasoning') {
        accumulator.reasoning += event.text;
      } else {
        accumulator.text += event.text;
      }
      pendingDeltaChars += event.text.length;
      dirty = true;

      const now = performance.now();
      if (
        pendingDeltaChars >= STREAM_FLUSH_MIN_CHARS ||
        now - lastFlushAt >= STREAM_FLUSH_MAX_MS
      ) {
        await flush('delta');
      }
    }

    accumulator.status = activeRun.cancelled
      ? { reason: 'cancelled', type: 'incomplete' }
      : { reason: 'stop', type: 'complete' };
    dirty = true;
    await flush(activeRun.cancelled ? 'cancelled' : 'complete');
  } catch (error) {
    if (activeRun.abortController.signal.aborted) {
      accumulator.status = { reason: 'cancelled', type: 'incomplete' };
      dirty = true;
      await flush('abort');
      return;
    }

    const message = getErrorMessage(error);
    accumulator.error = message;
    accumulator.status = { error: message, reason: 'error', type: 'incomplete' };
    accumulator.text = `Backend chat failed: ${message}`;
    dirty = true;
    await flush('throw');
  }
}

function createAssistantMessage(
  id: string,
  accumulator: AssistantAccumulator,
  startedAt: number
): EngineMessage {
  return {
    content: [
      ...(accumulator.reasoning.trim()
        ? [{ text: accumulator.reasoning, type: 'reasoning' as const }]
        : []),
      { text: accumulator.text, type: 'text' as const },
    ],
    createdAt: new Date(),
    id,
    metadata: {
      custom: {
        model: accumulator.result?.model ?? 'angel-engine-client',
        turnId: accumulator.result?.turnId,
      },
      timing: {
        streamStartTime: startedAt,
        tokenCount: Math.max(1, Math.round(accumulator.text.length / 4)),
        toolCallCount: 0,
        totalChunks: Math.max(1, accumulator.chunkCount),
        totalStreamTime: performance.now() - startedAt,
      },
    },
    role: 'assistant',
    status: accumulator.status,
  };
}

function appendMessageToEngineMessage(
  message: AppendMessage,
  id: string
): EngineMessage {
  return {
    attachments: message.attachments,
    content: message.content,
    createdAt: new Date(),
    id,
    metadata: message.metadata,
    role: message.role,
    status: message.status,
  } as EngineMessage;
}

function historyMessageToEngineMessage(message: ChatHistoryMessage): EngineMessage {
  const createdAt = message.createdAt ? new Date(message.createdAt) : undefined;

  return {
    content: message.content,
    createdAt:
      createdAt && Number.isFinite(createdAt.getTime()) ? createdAt : undefined,
    id: message.id,
    role: message.role,
    status:
      message.role === 'assistant'
        ? {
            reason: 'stop',
            type: 'complete',
          }
        : undefined,
  } as EngineMessage;
}

function getMessageText(message: Pick<ThreadMessageLike, 'content'>) {
  if (typeof message.content === 'string') return message.content.trim();

  return message.content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('\n')
    .trim();
}

function yieldToRendererTask() {
  if (typeof MessageChannel === 'function') {
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

function createId(prefix: string) {
  const id =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${id}`;
}
