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
  ChatHistoryMessagePart,
  ChatElicitationResponse,
  ChatRuntimeConfig,
  ChatStreamController,
  ChatSendInput,
  ChatSendResult,
  ChatToolAction,
} from '@/shared/chat';
import {
  appendChatTextPart,
  chatPartsText,
  chatToolActionToPart,
  cloneChatHistoryPart,
  isChatToolAction,
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
  model?: string;
  mode?: string;
  onChatCreated?: (chat: Chat) => void;
  onChatUpdated?: (
    chat: Chat,
    messages?: ChatHistoryMessage[],
    config?: ChatRuntimeConfig
  ) => void;
  projectId?: string | null;
  projectPath?: string;
  reasoningEffort?: string;
  runtime?: string;
};

type ActiveRun = {
  abortController: AbortController;
  assistantMessageId: string;
  cancelled: boolean;
  chatId?: string;
  startedAt: number;
  streamController?: ChatStreamController;
};

type AssistantAccumulator = {
  chunkCount: number;
  error?: string;
  parts: ChatHistoryMessagePart[];
  result?: ChatSendResult;
  status: MessageStatus;
};

type RunCompletion = {
  assistantMessage: EngineMessage;
  result?: ChatSendResult;
};

export function useEngineRuntime({
  adapters,
  chatId,
  historyMessages,
  historyRevision,
  model,
  mode,
  onChatCreated,
  onChatUpdated,
  projectId,
  projectPath,
  reasoningEffort,
  runtime,
}: EngineRuntimeOptions): AssistantRuntime {
  const [isRunning, setIsRunning] = useState(false);
  const [messages, setMessages] = useState<EngineMessage[]>(() =>
    historyMessages.map(historyMessageToEngineMessage)
  );
  const activeRunRef = useRef<ActiveRun | null>(null);
  const latestOptionsRef = useRef({
    chatId,
    model,
    mode,
    onChatCreated,
    onChatUpdated,
    projectId,
    projectPath,
    reasoningEffort,
    runtime,
  });

  latestOptionsRef.current = {
    chatId,
    model,
    mode,
    onChatCreated,
    onChatUpdated,
    projectId,
    projectPath,
    reasoningEffort,
    runtime,
  };

  useEffect(() => {
    const activeRun = activeRunRef.current;
    if (activeRun) {
      if (activeRun.chatId === chatId) return;

      activeRun.cancelled = true;
      activeRun.abortController.abort();
      activeRunRef.current = null;
    }

    setIsRunning(false);
    setMessages(historyMessages.map(historyMessageToEngineMessage));
  }, [chatId, historyMessages, historyRevision]);

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

  const resumeToolCall = useCallback(
    ({ payload, toolCallId }: { payload: unknown; toolCallId: string }) => {
      const response = normalizeElicitationResponse(payload);
      if (!response) return;
      void activeRunRef.current?.streamController?.resolveElicitation({
        elicitationId: toolCallId,
        response,
      });
    },
    []
  );

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
        chatId: latestOptionsRef.current.chatId,
        startedAt,
      };
      activeRunRef.current = activeRun;

      const accumulator: AssistantAccumulator = {
        chunkCount: 0,
        parts: [],
        status: { type: 'running' },
      };
      const assistantMessage = createAssistantMessage(
        assistantMessageId,
        accumulator,
        startedAt
      );
      const baseMessages = messages;
      let completion: RunCompletion | undefined;

      setIsRunning(true);
      setMessages([...baseMessages, userMessage, assistantMessage]);

      try {
        completion = await consumeRunStream({
          activeRun,
          accumulator,
          input: {
            chatId: latestOptionsRef.current.chatId,
            cwd: latestOptionsRef.current.projectPath,
            model: latestOptionsRef.current.model,
            mode: latestOptionsRef.current.mode,
            projectId: latestOptionsRef.current.projectId,
            reasoningEffort: latestOptionsRef.current.reasoningEffort,
            runtime: latestOptionsRef.current.runtime,
            text: prompt,
          },
          onChatCreated: latestOptionsRef.current.onChatCreated,
          replaceAssistantMessage,
        });
      } finally {
        if (activeRunRef.current === activeRun) {
          activeRunRef.current = null;
          setIsRunning(false);
        }
      }

      if (!activeRun.cancelled && completion?.result) {
        latestOptionsRef.current.onChatUpdated?.(
          completion.result.chat,
          engineMessagesToHistoryMessages([
            ...baseMessages,
            userMessage,
            completion.assistantMessage,
          ]),
          completion.result.config
        );
      }
    },
    [messages, replaceAssistantMessage]
  );

  const store = useMemo<ExternalStoreAdapter<EngineMessage>>(
    () => ({
      adapters,
      convertMessage: (message) => message,
      isRunning,
      messages,
      onCancel: cancelRun,
      onResumeToolCall: resumeToolCall,
      onNew: runMessage,
    }),
    [adapters, cancelRun, isRunning, messages, resumeToolCall, runMessage]
  );

  return useExternalStoreRuntime(store);
}

async function consumeRunStream({
  activeRun,
  accumulator,
  input,
  onChatCreated,
  replaceAssistantMessage,
}: {
  activeRun: ActiveRun;
  accumulator: AssistantAccumulator;
  input: ChatSendInput;
  onChatCreated?: (chat: Chat) => void;
  replaceAssistantMessage: (
    assistantMessageId: string,
    message: EngineMessage
  ) => void;
}): Promise<RunCompletion> {
  let dirty = false;
  let pendingDeltaChars = 0;
  let lastFlushAt = performance.now();
  let currentAssistantMessage = createAssistantMessage(
    activeRun.assistantMessageId,
    accumulator,
    activeRun.startedAt
  );

  const flush = async () => {
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
    currentAssistantMessage = nextAssistantMessage;
    dirty = false;
    pendingDeltaChars = 0;
    lastFlushAt = performance.now();
    await yieldToRendererTask();
  };

  try {
    for await (const event of streamChatEvents(
      input,
      activeRun.abortController.signal,
      (controller) => {
        activeRun.streamController = controller;
      }
    )) {
      if (activeRun.cancelled) break;

      if (event.type === 'done') break;

      if (event.type === 'chat') {
        activeRun.chatId = event.chat.id;
        onChatCreated?.(event.chat);
        continue;
      }

      if (event.type === 'error') {
        accumulator.error = event.message;
        accumulator.status = {
          error: event.message,
          reason: 'error',
          type: 'incomplete',
        };
        accumulator.parts = [
          {
            text: `Backend chat failed: ${event.message}`,
            type: 'text',
          },
        ];
        dirty = true;
        await flush();
        break;
      }

      if (event.type === 'result') {
        accumulator.result = event.result;
        if (accumulator.parts.length === 0) {
          accumulator.parts = event.result.content.map(cloneChatHistoryPart);
        }
        dirty = true;
        await flush();
        continue;
      }

      accumulator.chunkCount += 1;
      if (event.type === 'tool') {
        upsertToolActionPart(accumulator.parts, event.action);
      } else {
        appendChatTextPart(accumulator.parts, event.part, event.text);
        pendingDeltaChars += event.text.length;
      }
      dirty = true;

      const now = performance.now();
      if (
        pendingDeltaChars >= STREAM_FLUSH_MIN_CHARS ||
        now - lastFlushAt >= STREAM_FLUSH_MAX_MS
      ) {
        await flush();
      }
    }

    accumulator.status = activeRun.cancelled
      ? { reason: 'cancelled', type: 'incomplete' }
      : { reason: 'stop', type: 'complete' };
    dirty = true;
    await flush();
  } catch (error) {
    if (activeRun.abortController.signal.aborted) {
      accumulator.status = { reason: 'cancelled', type: 'incomplete' };
      dirty = true;
      await flush();
      return {
        assistantMessage: currentAssistantMessage,
        result: accumulator.result,
      };
    }

    const message = getErrorMessage(error);
    accumulator.error = message;
    accumulator.status = { error: message, reason: 'error', type: 'incomplete' };
    accumulator.parts = [
      {
        text: `Backend chat failed: ${message}`,
        type: 'text',
      },
    ];
    dirty = true;
    await flush();
  }

  return {
    assistantMessage: currentAssistantMessage,
    result: accumulator.result,
  };
}

function upsertToolActionPart(
  parts: ChatHistoryMessagePart[],
  action: ChatToolAction
) {
  const nextPart = chatToolActionToPart(action);
  const index = parts.findIndex(
    (part) => part.type === 'tool-call' && part.toolCallId === nextPart.toolCallId
  );

  if (index === -1) {
    parts.push(nextPart);
    return;
  }

  parts[index] = nextPart;
}

function normalizeElicitationResponse(
  payload: unknown
): ChatElicitationResponse | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const response = payload as Partial<ChatElicitationResponse>;

  switch (response.type) {
    case 'allow':
    case 'allowForSession':
    case 'deny':
    case 'cancel':
    case 'externalComplete':
      return { type: response.type };
    case 'answers':
      return Array.isArray(response.answers)
        ? {
            answers: response.answers
              .filter(
                (answer) =>
                  answer &&
                  typeof answer === 'object' &&
                  typeof answer.id === 'string' &&
                  typeof answer.value === 'string'
              )
              .map((answer) => ({ id: answer.id, value: answer.value })),
            type: 'answers',
          }
        : undefined;
    case 'dynamicToolResult':
      return typeof response.success === 'boolean'
        ? { success: response.success, type: 'dynamicToolResult' }
        : undefined;
    case 'raw':
      return typeof response.value === 'string'
        ? { type: 'raw', value: response.value }
        : undefined;
    default:
      return undefined;
  }
}

function createAssistantMessage(
  id: string,
  accumulator: AssistantAccumulator,
  startedAt: number
): EngineMessage {
  const text = chatPartsText(accumulator.parts, 'text');
  const toolCallCount = accumulator.parts.filter(
    (part) => part.type === 'tool-call'
  ).length;

  return {
    content: accumulator.parts.map(cloneChatHistoryPart),
    createdAt: new Date(),
    id,
    metadata: {
      custom: {
        model: accumulator.result?.model ?? 'angel-engine-client',
        turnId: accumulator.result?.turnId,
      },
      timing: {
        streamStartTime: startedAt,
        tokenCount: Math.max(1, Math.round(text.length / 4)),
        toolCallCount,
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
    content: message.content.map(cloneChatHistoryPart),
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

function engineMessagesToHistoryMessages(
  messages: EngineMessage[]
): ChatHistoryMessage[] {
  return messages
    .map(engineMessageToHistoryMessage)
    .filter((message) => message.content.length > 0);
}

function engineMessageToHistoryMessage(message: EngineMessage): ChatHistoryMessage {
  return {
    content: engineMessageContentToHistoryParts(message.content),
    createdAt: message.createdAt?.toISOString(),
    id: message.id,
    role: message.role,
  };
}

function engineMessageContentToHistoryParts(
  content: ThreadMessageLike['content']
): ChatHistoryMessagePart[] {
  if (typeof content === 'string') {
    return content.trim() ? [{ text: content, type: 'text' }] : [];
  }

  return content.flatMap((part) => {
    switch (part.type) {
      case 'reasoning':
      case 'text':
        return part.text.trim() ? [{ ...part }] : [];
      case 'tool-call':
        return isChatToolAction(part.artifact)
          ? [cloneChatHistoryPart(chatToolActionToPart(part.artifact))]
          : [];
      default:
        return [];
    }
  });
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
