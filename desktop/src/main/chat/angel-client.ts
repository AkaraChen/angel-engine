import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { app } from 'electron';

import type {
  Chat,
  ChatHistoryMessage,
  ChatLoadResult,
  ChatSendInput,
  ChatSendResult,
  ChatStreamDelta,
} from '../../shared/chat';
import {
  createChat,
  renameChatFromPrompt,
  requireChat,
  setChatRemoteThreadId,
  touchChat,
} from './repository';

type ClientUpdate = {
  events?: ClientEvent[];
  logs?: ClientLog[];
  streamDeltas?: EngineStreamDelta[];
};

type ClientCommandResult = {
  conversationId?: string;
  turnId?: string;
  update?: ClientUpdate;
};

type ConversationSnapshot = {
  context?: {
    cwd?: string | null;
  };
  history?: {
    replay?: HistoryReplaySnapshot[];
  };
  id: string;
  remoteId?: string | null;
  turns?: TurnSnapshot[];
};

type HistoryReplaySnapshot = {
  content?: {
    text?: string;
  };
  role?: string;
};

type TurnSnapshot = {
  id: string;
  inputText?: string;
  outputText?: string;
  reasoningText?: string;
};

type ClientEvent = {
  code?: string;
  content?: { text?: string };
  conversationId?: string;
  message?: string;
  turnId?: string;
  type: string;
  [key: string]: unknown;
};

type EngineStreamDelta = {
  actionId?: string;
  content?: { kind?: string; text?: string };
  conversationId?: string;
  turnId?: string;
  type: 'actionOutputDelta' | 'assistantDelta' | 'planDelta' | 'reasoningDelta';
};

type ClientLog = {
  kind: string;
  message: string;
};

type AngelClient = {
  close(): void;
  initialize(): Promise<ClientUpdate>;
  nextUpdate(timeoutMs?: number): Promise<ClientUpdate | null>;
  openElicitations(conversationId: string): unknown[];
  resumeThread(request: {
    additionalDirectories?: string[];
    hydrate?: boolean;
    remoteId: string;
  }): Promise<ClientCommandResult>;
  sendThreadEvent(conversationId: string, event: unknown): ClientCommandResult;
  sendText(conversationId: string, text: string): ClientCommandResult;
  snapshot(): {
    runtime?: {
      code?: string;
      message?: string;
      methods?: Array<{ id: string; label: string }>;
      status?: string;
    };
  };
  startThread(request?: { cwd?: string }): Promise<ClientCommandResult>;
  threadState(conversationId: string): ConversationSnapshot | null;
  threadIsIdle(conversationId: string): boolean;
  turnIsTerminal(conversationId: string, turnId: string): boolean;
  turnState(conversationId: string, turnId: string): {
    outputText?: string;
    reasoningText?: string;
  } | null;
};

type AngelClientConstructor = new (options: unknown) => AngelClient;
type ChatStreamObserver = (event: ChatStreamDelta) => void;
type RuntimeOptions = Record<string, unknown> & {
  args: string[];
  command: string;
  runtime: string;
};

const nodeRequire = createRequire(import.meta.url);

const chatSessions = new Map<string, AngelChatSession>();

export async function sendChat(input: ChatSendInput): Promise<ChatSendResult> {
  return streamChat(input);
}

export async function loadChatSession(chatId: string): Promise<ChatLoadResult> {
  const chat = requireChat(chatId);
  const session = chatSessions.get(chat.id);

  if (!chat.remoteThreadId && !session?.hasConversation()) {
    return { chat, messages: [] };
  }

  const snapshot = await getChatSession(chat).hydrate(chat);
  const updatedChat = persistRemoteThreadId(chat, snapshot);
  return {
    chat: updatedChat,
    messages: messagesFromConversationSnapshot(snapshot),
  };
}

export async function streamChat(
  input: ChatSendInput,
  onEvent?: ChatStreamObserver,
  abortSignal?: AbortSignal
): Promise<ChatSendResult> {
  const text = input.text.trim();
  if (!text) {
    throw new Error('Chat text is required.');
  }

  const chat = input.chatId
    ? requireChat(input.chatId)
    : createChat({
        cwd: input.cwd,
        projectId: input.projectId,
        runtime: defaultRuntimeName(),
      });

  const result = await getChatSession(chat).send(
    chat,
    { ...input, text },
    onEvent,
    abortSignal
  );
  renameChatFromPrompt(chat.id, text);
  const finalChat = result.remoteThreadId
    ? setChatRemoteThreadId(chat.id, result.remoteThreadId)
    : touchChat(chat.id);

  return {
    chat: finalChat,
    chatId: finalChat.id,
    reasoning: result.reasoning,
    text: result.text,
    turnId: result.turnId,
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

  const session = new AngelChatSession(createRuntimeOptions(chat.runtime));
  chatSessions.set(chat.id, session);
  return session;
}

function persistRemoteThreadId(chat: Chat, snapshot: ConversationSnapshot) {
  if (!snapshot.remoteId || snapshot.remoteId === chat.remoteThreadId) {
    return chat;
  }
  return setChatRemoteThreadId(chat.id, snapshot.remoteId);
}

function messagesFromConversationSnapshot(
  snapshot: ConversationSnapshot
): ChatHistoryMessage[] {
  const replayMessages = messagesFromHistoryReplay(snapshot.history?.replay ?? []);
  const turnMessages = messagesFromTurns(snapshot.turns ?? []);
  return [...replayMessages, ...turnMessages];
}

function messagesFromTurns(turns: TurnSnapshot[]): ChatHistoryMessage[] {
  const messages: ChatHistoryMessage[] = [];

  for (const turn of turns) {
    const inputText = turn.inputText?.trim();
    if (inputText) {
      messages.push({
        content: [{ text: inputText, type: 'text' }],
        id: `${turn.id}:user`,
        role: 'user',
      });
    }

    const reasoningText = turn.reasoningText?.trim();
    const outputText = turn.outputText?.trim();
    if (reasoningText || outputText) {
      messages.push({
        content: [
          ...(reasoningText
            ? [{ text: reasoningText, type: 'reasoning' as const }]
            : []),
          ...(outputText ? [{ text: outputText, type: 'text' as const }] : []),
        ],
        id: `${turn.id}:assistant`,
        role: 'assistant',
      });
    }
  }

  return messages;
}

function messagesFromHistoryReplay(
  replay: HistoryReplaySnapshot[]
): ChatHistoryMessage[] {
  const messages: ChatHistoryMessage[] = [];
  let userText = '';
  let assistantReasoning = '';
  let assistantText = '';
  let messageIndex = 0;

  const flushUser = () => {
    const text = userText.trim();
    if (!text) return;
    messages.push({
      content: [{ text, type: 'text' }],
      id: `history-${messageIndex++}:user`,
      role: 'user',
    });
    userText = '';
  };

  const flushAssistant = () => {
    const reasoning = assistantReasoning.trim();
    const text = assistantText.trim();
    if (!reasoning && !text) return;
    messages.push({
      content: [
        ...(reasoning ? [{ text: reasoning, type: 'reasoning' as const }] : []),
        ...(text ? [{ text, type: 'text' as const }] : []),
      ],
      id: `history-${messageIndex++}:assistant`,
      role: 'assistant',
    });
    assistantReasoning = '';
    assistantText = '';
  };

  for (const entry of replay) {
    const text = entry.content?.text;
    if (!text) continue;

    if (entry.role === 'user') {
      flushAssistant();
      userText += text;
    } else if (entry.role === 'assistant') {
      flushUser();
      assistantText += text;
    } else if (entry.role === 'reasoning') {
      flushUser();
      assistantReasoning += text;
    }
  }

  flushUser();
  flushAssistant();
  return messages;
}

class AngelChatSession {
  private readonly client: AngelClient;
  private conversationId: string | undefined;
  private startPromise: Promise<void> | undefined;
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly options: RuntimeOptions) {
    const Client = loadAngelClient();
    this.client = new Client(options);
  }

  async send(
    chat: Chat,
    input: ChatSendInput,
    onEvent?: ChatStreamObserver,
    abortSignal?: AbortSignal
  ): Promise<{
    reasoning?: string;
    remoteThreadId?: string;
    text: string;
    turnId?: string;
  }> {
    const run = this.operationQueue.then(() =>
      this.sendNow(chat, input, onEvent, abortSignal)
    );
    this.operationQueue = run.then(
      (): void => undefined,
      (): void => undefined
    );
    return run;
  }

  async hydrate(chat: Chat): Promise<ConversationSnapshot> {
    const run = this.operationQueue.then(() => this.hydrateNow(chat));
    this.operationQueue = run.then(
      (): void => undefined,
      (): void => undefined
    );
    return run;
  }

  hasConversation() {
    return Boolean(this.conversationId);
  }

  close() {
    this.client.close();
  }

  private async sendNow(
    chat: Chat,
    input: ChatSendInput,
    onEvent?: ChatStreamObserver,
    abortSignal?: AbortSignal
  ): Promise<{
    reasoning?: string;
    remoteThreadId?: string;
    text: string;
    turnId?: string;
  }> {
    throwIfAborted(abortSignal);
    await this.ensureStarted(chat, true, input.cwd);
    throwIfAborted(abortSignal);

    const conversationId = this.requireConversationId();
    const result = this.client.sendText(conversationId, input.text);
    const collector = new TurnCollector(result.turnId, onEvent);
    await this.handleUpdate(result.update, collector);

    if (!result.turnId) {
      return {
        remoteThreadId: this.threadRemoteId(),
        text: collector.text || 'The runtime accepted the message without starting a turn.',
      };
    }

    while (!this.client.turnIsTerminal(conversationId, result.turnId)) {
      if (abortSignal?.aborted) {
        await this.cancelTurn(conversationId, result.turnId, collector);
        throwIfAborted(abortSignal);
      }
      if (this.client.openElicitations(conversationId).length > 0) {
        throw new Error('The runtime requested user input or approval, which is not wired yet.');
      }
      await this.processNextUpdate(50, collector);
      await yieldToEventLoop();
    }

    const turn = this.client.turnState(conversationId, result.turnId);
    return {
      reasoning: turn?.reasoningText || collector.reasoning || undefined,
      remoteThreadId: this.threadRemoteId(),
      text: turn?.outputText || collector.text || 'The runtime finished without text output.',
      turnId: result.turnId,
    };
  }

  private async hydrateNow(chat: Chat): Promise<ConversationSnapshot> {
    await this.ensureStarted(chat, false);
    const conversationId = this.requireConversationId();
    const snapshot = this.client.threadState(conversationId);
    if (!snapshot) {
      throw new Error('Chat runtime did not return a conversation snapshot.');
    }
    return snapshot;
  }

  private async cancelTurn(
    conversationId: string,
    turnId: string,
    collector: TurnCollector
  ) {
    const result = this.client.sendThreadEvent(conversationId, {
      turnId,
      type: 'cancel',
    });
    await this.handleUpdate(result.update, collector);
  }

  private async ensureStarted(
    chat: Chat,
    allowStart: boolean,
    cwdOverride?: string
  ) {
    this.startPromise ??= this.start(chat, allowStart, cwdOverride).catch(
      (error: unknown) => {
        this.startPromise = undefined;
        throw error;
      }
    );
    await this.startPromise;
  }

  private async start(chat: Chat, allowStart: boolean, cwdOverride?: string) {
    await this.handleUpdate(await this.client.initialize());

    const result = chat.remoteThreadId
      ? await this.client.resumeThread({
          additionalDirectories: [],
          hydrate: true,
          remoteId: chat.remoteThreadId,
        })
      : allowStart
        ? await this.client.startThread({
            cwd: cwdOverride || chat.cwd || process.cwd(),
          })
        : undefined;

    if (!result) {
      throw new Error('Chat has no remote thread to resume.');
    }

    this.conversationId = result.conversationId;
    await this.handleUpdate(result.update);
  }

  private async processNextUpdate(timeout?: number, collector?: TurnCollector) {
    const update = await this.client.nextUpdate(timeout);
    if (!update) return false;
    await this.handleUpdate(update, collector);
    return true;
  }

  private async handleUpdate(update?: ClientUpdate, collector?: TurnCollector) {
    const streamDeltas = update?.streamDeltas ?? [];
    for (const delta of streamDeltas) {
      collector?.acceptDelta(delta);
    }

    for (const event of update?.events ?? []) {
      if (event.type === 'runtimeFaulted') {
        throw new Error(`Runtime faulted (${event.code}): ${event.message}`);
      }
      if (streamDeltas.length === 0) {
        collector?.acceptEvent(event);
      }
    }

  }

  private requireConversationId() {
    if (!this.conversationId) {
      throw new Error('Chat runtime did not start a conversation.');
    }
    return this.conversationId;
  }

  private threadRemoteId() {
    if (!this.conversationId) return undefined;
    return this.client.threadState(this.conversationId)?.remoteId ?? undefined;
  }
}

class TurnCollector {
  reasoning = '';
  text = '';

  constructor(
    private readonly turnId: string | undefined,
    private readonly onEvent: ChatStreamObserver | undefined
  ) {}

  acceptDelta(delta: EngineStreamDelta) {
    this.accept(delta);
  }

  acceptEvent(event: ClientEvent) {
    this.accept(event);
  }

  private accept(event: ClientEvent | EngineStreamDelta) {
    if (event.turnId && this.turnId && event.turnId !== this.turnId) return;

    const text = event.content?.text;
    if (!text) return;

    if (event.type === 'assistantDelta') {
      this.text += text;
      this.onEvent?.({ part: 'text', text, turnId: event.turnId, type: 'delta' });
    } else if (event.type === 'reasoningDelta') {
      this.reasoning += text;
      this.onEvent?.({
        part: 'reasoning',
        text,
        turnId: event.turnId,
        type: 'delta',
      });
    } else if (event.type === 'planDelta') {
      this.reasoning += text;
      this.onEvent?.({
        part: 'reasoning',
        text,
        turnId: event.turnId,
        type: 'delta',
      });
    }
  }
}

function createRuntimeOptions(runtimeName = defaultRuntimeName()): RuntimeOptions {
  const runtime = normalizeRuntimeName(runtimeName);
  if (runtime === 'kimi') {
    return {
      args: ['acp'],
      auth: { autoAuthenticate: true, needAuth: true },
      command: process.env.ANGEL_ENGINE_COMMAND ?? 'kimi',
      identity: desktopIdentity(),
      protocol: 'acp',
      runtime,
    };
  }
  if (runtime === 'opencode') {
    return {
      args: ['acp'],
      auth: { autoAuthenticate: false, needAuth: false },
      command: process.env.ANGEL_ENGINE_COMMAND ?? 'opencode',
      identity: desktopIdentity(),
      protocol: 'acp',
      runtime,
    };
  }
  return {
    args: ['app-server'],
    command: process.env.ANGEL_ENGINE_COMMAND ?? 'codex',
    identity: desktopIdentity(),
    protocol: 'codexAppServer',
    runtime: 'codex',
  };
}

function defaultRuntimeName() {
  return normalizeRuntimeName(process.env.ANGEL_ENGINE_RUNTIME);
}

function normalizeRuntimeName(runtime: string | undefined) {
  const normalized = runtime?.trim().toLowerCase();
  if (normalized === 'kimi') return 'kimi';
  if (normalized === 'opencode' || normalized === 'open-code') return 'opencode';
  return 'codex';
}

function desktopIdentity() {
  return {
    name: 'angel-engine-desktop',
    title: 'Angel Engine Desktop',
  };
}

function loadAngelClient() {
  const modulePath = resolveClientModulePath();
  return (nodeRequire(modulePath) as {
    AngelClient: AngelClientConstructor;
  }).AngelClient;
}

function resolveClientModulePath() {
  const candidates = [
    process.env.ANGEL_ENGINE_CLIENT_NAPI_PATH,
    path.resolve(app.getAppPath(), '../crates/angel-engine-client-napi/index.js'),
    path.resolve(process.cwd(), '../crates/angel-engine-client-napi/index.js'),
    path.resolve(process.cwd(), 'crates/angel-engine-client-napi/index.js'),
  ].filter(Boolean);

  const modulePath = candidates.find((candidate) =>
    fs.existsSync(candidate as string)
  );
  if (!modulePath) {
    throw new Error(
      `Could not find angel-engine-client-napi. Tried: ${candidates.join(', ')}`
    );
  }
  return modulePath;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error('Chat request cancelled.');
  }
}

function yieldToEventLoop() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}
