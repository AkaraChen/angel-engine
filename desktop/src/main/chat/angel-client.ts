import { createRequire } from 'node:module';

import type {
  AngelSession as AngelSessionInstance,
  ConversationSnapshot,
  RuntimeOptions,
  RunTurnResult,
} from '@angel-engine/client';

import type {
  Chat,
  ChatElicitationResponse,
  ChatHistoryMessage,
  ChatLoadResult,
  ChatRuntimeConfig,
  ChatRuntimeConfigInput,
  ChatSendInput,
  ChatSendResult,
  ChatStreamDelta,
  ChatToolAction,
} from '../../shared/chat';
import {
  createChat,
  renameChatFromPrompt,
  requireChat,
  setChatRemoteThreadId,
  touchChat,
} from './repository';
import {
  conversationMessages,
  createTurnEventProjector,
  projectRunResult,
  runtimeConfigFromConversationSnapshot,
} from './projection';

type AngelClientModule = typeof import('@angel-engine/client');
type ChatStreamObserver = (
  event:
    | ChatStreamDelta
    | { action: ChatToolAction; type: 'tool' }
    | { chat: Chat; type: 'chat' }
) => void;
export type ChatStreamControls = {
  setResolveElicitation?: (
    handler: (
      elicitationId: string,
      response: ChatElicitationResponse
    ) => Promise<void>
  ) => void;
};

const nodeRequire = createRequire(import.meta.url);
const clientModule = nodeRequire('@angel-engine/client') as AngelClientModule;
const { AngelSession, createRuntimeOptions } = clientModule;

const chatSessions = new Map<string, AngelSessionInstance>();

export async function sendChat(input: ChatSendInput): Promise<ChatSendResult> {
  return streamChat(input);
}

export async function loadChatSession(chatId: string): Promise<ChatLoadResult> {
  const chat = requireChat(chatId);
  const session = chatSessions.get(chat.id);

  if (!chat.remoteThreadId && !session?.hasConversation()) {
    return { chat, messages: [] };
  }

  const snapshot = await getChatSession(chat).hydrate({
    cwd: chat.cwd ?? undefined,
    remoteId: chat.remoteThreadId ?? undefined,
  });
  const updatedChat = persistRemoteThreadId(chat, snapshot);
  const messages = conversationMessages(snapshot) as ChatHistoryMessage[];
  return {
    chat: updatedChat,
    config: runtimeConfigFromConversationSnapshot(
      snapshot
    ) as ChatRuntimeConfig,
    messages,
  };
}

export async function inspectChatRuntimeConfig(
  input: ChatRuntimeConfigInput
): Promise<ChatRuntimeConfig> {
  const session = createChatSession(input.runtime);
  try {
    return runtimeConfigFromConversationSnapshot(await session.inspect(input.cwd));
  } finally {
    session.close();
  }
}

export async function streamChat(
  input: ChatSendInput,
  onEvent?: ChatStreamObserver,
  abortSignal?: AbortSignal,
  controls?: ChatStreamControls
): Promise<ChatSendResult> {
  const text = input.text.trim();
  if (!text) {
    throw new Error('Chat text is required.');
  }

  const isNewChat = !input.chatId;
  const chat = input.chatId
    ? requireChat(input.chatId)
    : createChat({
        cwd: input.cwd,
        projectId: input.projectId,
        runtime: input.runtime,
      });
  if (isNewChat) {
    onEvent?.({ chat, type: 'chat' });
  }

  const result = await getChatSession(chat).sendText({
    ...createProjectedTurn(onEvent),
    cwd: input.cwd ?? chat.cwd ?? undefined,
    model: input.model,
    mode: input.mode,
    onResolveElicitation: controls?.setResolveElicitation,
    reasoningEffort: input.reasoningEffort,
    remoteId: chat.remoteThreadId ?? undefined,
    signal: abortSignal,
    text,
  });

  renameChatFromPrompt(chat.id, text);
  const finalChat = result.remoteThreadId
    ? setChatRemoteThreadId(chat.id, result.remoteThreadId)
    : touchChat(chat.id);
  const projected = projectRunResult(result);
  const content = projected.content;

  return {
    chat: finalChat,
    chatId: finalChat.id,
    config: projected.config,
    content,
    model: projected.model,
    reasoning: projected.reasoning,
    text: projected.text,
    turnId: projected.turnId,
  };
}

export function closeChatSession(chatId?: string) {
  if (chatId) {
    chatSessions.get(chatId)?.close();
    chatSessions.delete(chatId);
    return;
  }

  for (const session of chatSessions.values()) {
    session.close();
  }
  chatSessions.clear();
}

function getChatSession(chat: Chat) {
  const existing = chatSessions.get(chat.id);
  if (existing) return existing;

  const session = createChatSession(chat.runtime);
  chatSessions.set(chat.id, session);
  return session;
}

function createChatSession(runtime?: string) {
  return new AngelSession(
    createRuntimeOptions(runtime, {
      clientName: 'angel-engine-desktop',
      clientTitle: 'Angel Engine Desktop',
    }) as RuntimeOptions
  ) as AngelSessionInstance;
}

function persistRemoteThreadId(chat: Chat, snapshot: ConversationSnapshot) {
  if (!snapshot.remoteId || snapshot.remoteId === chat.remoteThreadId) {
    return chat;
  }
  return setChatRemoteThreadId(chat.id, snapshot.remoteId);
}

function createProjectedTurn(onEvent?: ChatStreamObserver) {
  const projector = createTurnEventProjector(onEvent);
  return {
    onEvent: projector.handle,
  };
}

export type { ChatRuntimeConfig as EngineRuntimeConfig, RunTurnResult };
