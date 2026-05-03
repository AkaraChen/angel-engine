import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
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

type RuntimeLine = {
  kind: 'stderr' | 'stdout';
  text: string;
};

type ClientUpdate = {
  events?: ClientEvent[];
  logs?: ClientLog[];
  outgoing?: Array<{ line: string }>;
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

type ClientLog = {
  kind: string;
  message: string;
};

type AngelEngineClient = {
  authenticate(methodId: string): ClientCommandResult;
  initialize(): ClientCommandResult;
  openElicitations(conversationId: string): unknown[];
  receiveJson(value: unknown): ClientCommandResult;
  resumeThread(request: {
    additionalDirectories?: string[];
    hydrate?: boolean;
    remoteId: string;
  }): ClientCommandResult;
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
  startThread(request?: { cwd?: string }): ClientCommandResult;
  threadState(conversationId: string): ConversationSnapshot | null;
  threadIsIdle(conversationId: string): boolean;
  turnIsTerminal(conversationId: string, turnId: string): boolean;
  turnState(conversationId: string, turnId: string): {
    outputText?: string;
    reasoningText?: string;
  } | null;
};

type AngelEngineClientConstructor = new (options: unknown) => AngelEngineClient;
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
  private readonly client: AngelEngineClient;
  private readonly process: RuntimeProcess;
  private conversationId: string | undefined;
  private startPromise: Promise<void> | undefined;
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly options: RuntimeOptions) {
    const Client = loadAngelEngineClient();
    this.client = new Client(options);
    this.process = new RuntimeProcess(
      assertStringOption(options.command, 'runtime command'),
      Array.isArray(options.args) ? options.args.map(String) : []
    );
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
    this.process.close();
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
      await this.processNextLine(undefined, collector);
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
    await this.handleUpdate(this.client.initialize().update);
    await this.waitForRuntime();

    const result = chat.remoteThreadId
      ? this.client.resumeThread({
          additionalDirectories: [],
          hydrate: true,
          remoteId: chat.remoteThreadId,
        })
      : allowStart
        ? this.client.startThread({
            cwd: cwdOverride || chat.cwd || process.cwd(),
          })
        : undefined;

    if (!result) {
      throw new Error('Chat has no remote thread to resume.');
    }

    this.conversationId = result.conversationId;
    await this.handleUpdate(result.update);

    const conversationId = this.requireConversationId();
    while (!this.client.threadIsIdle(conversationId)) {
      await this.processNextLine();
    }
    await this.drainStartupNotifications();
  }

  private async waitForRuntime() {
    let authSent = false;

    let runtimeReady = false;
    while (!runtimeReady) {
      const runtime = this.client.snapshot().runtime;
      if (runtime?.status === 'available') {
        runtimeReady = true;
        continue;
      }

      if (runtime?.status === 'faulted') {
        throw new Error(`Runtime faulted (${runtime.code}): ${runtime.message}`);
      }

      if (runtime?.status === 'awaitingAuth') {
        const method = runtime.methods?.[0];
        const auth = this.options.auth as { autoAuthenticate?: boolean } | undefined;
        if (!auth?.autoAuthenticate || authSent || !method) {
          const labels = runtime.methods?.map((item) => item.label).join(', ');
          throw new Error(`Runtime requires authentication: ${labels || 'unknown method'}`);
        }
        authSent = true;
        await this.handleUpdate(this.client.authenticate(method.id).update);
        continue;
      }

      await this.processNextLine();
    }
  }

  private async drainStartupNotifications() {
    let timeout = 500;
    while (await this.processNextLine(timeout)) {
      timeout = 50;
    }
  }

  private async processNextLine(timeout?: number, collector?: TurnCollector) {
    const line = await this.process.nextLine(timeout);
    if (!line) return false;

    if (line.kind === 'stderr') {
      return true;
    }

    let value: unknown;
    try {
      value = JSON.parse(line.text);
    } catch {
      return true;
    }

    const result = this.client.receiveJson(value);
    await this.handleUpdate(result.update, collector);
    return true;
  }

  private async handleUpdate(update?: ClientUpdate, collector?: TurnCollector) {
    for (const event of update?.events ?? []) {
      if (event.type === 'runtimeFaulted') {
        throw new Error(`Runtime faulted (${event.code}): ${event.message}`);
      }
      collector?.accept(event);
    }

    for (const message of update?.outgoing ?? []) {
      this.process.writeLine(message.line);
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

  accept(event: ClientEvent) {
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

class RuntimeProcess {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly queue = new AsyncLineQueue<RuntimeLine>();

  constructor(command: string, args: string[]) {
    this.child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child.on('error', (error) => this.queue.fail(error));
    this.child.on('exit', (code, signal) => {
      this.queue.fail(new Error(`Runtime process exited (${signal || code})`));
    });
    attachLines(this.child.stdout, 'stdout', this.queue);
    attachLines(this.child.stderr, 'stderr', this.queue);
  }

  close() {
    this.child.kill();
  }

  nextLine(timeout?: number) {
    return this.queue.next(timeout);
  }

  writeLine(line: string) {
    this.child.stdin.write(`${line}\n`);
  }
}

class AsyncLineQueue<T> {
  private error: Error | undefined;
  private readonly items: T[] = [];
  private readonly waiters: Array<{
    reject: (error: Error) => void;
    resolve: (value: T | null) => void;
    timer?: NodeJS.Timeout;
  }> = [];

  fail(error: Error) {
    this.error = error;
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      if (!waiter) continue;
      if (waiter.timer) clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  next(timeout?: number) {
    if (this.items.length > 0) {
      return Promise.resolve(this.items.shift() ?? null);
    }
    if (this.error) {
      return Promise.reject(this.error);
    }

    return new Promise<T | null>((resolve, reject) => {
      const waiter = { reject, resolve, timer: undefined as NodeJS.Timeout | undefined };
      if (timeout !== undefined) {
        waiter.timer = setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
          resolve(null);
        }, timeout);
      }
      this.waiters.push(waiter);
    });
  }

  push(item: T) {
    const waiter = this.waiters.shift();
    if (waiter) {
      if (waiter.timer) clearTimeout(waiter.timer);
      waiter.resolve(item);
    } else {
      this.items.push(item);
    }
  }
}

function attachLines(
  stream: NodeJS.ReadableStream,
  kind: RuntimeLine['kind'],
  queue: AsyncLineQueue<RuntimeLine>
) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk: string) => {
    buffer += chunk;
    while (buffer.includes('\n')) {
      const index = buffer.indexOf('\n');
      const text = buffer.slice(0, index).replace(/\r$/, '');
      buffer = buffer.slice(index + 1);
      queue.push({ kind, text });
    }
  });
  stream.on('end', () => {
    if (buffer) {
      queue.push({ kind, text: buffer });
      buffer = '';
    }
  });
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

function loadAngelEngineClient() {
  const modulePath = resolveClientModulePath();
  return (nodeRequire(modulePath) as {
    AngelEngineClient: AngelEngineClientConstructor;
  }).AngelEngineClient;
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

function assertStringOption(value: unknown, label: string) {
  if (typeof value !== 'string' || !value) {
    throw new Error(`Missing ${label}.`);
  }
  return value;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error('Chat request cancelled.');
  }
}
