import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { app } from 'electron';

import type {
  ChatSendInput,
  ChatSendResult,
  ChatStreamDelta,
} from '../../shared/chat';

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
  threadIsIdle(conversationId: string): boolean;
  turnIsTerminal(conversationId: string, turnId: string): boolean;
  turnState(conversationId: string, turnId: string): {
    outputText?: string;
    reasoningText?: string;
  } | null;
};

type AngelEngineClientConstructor = new (options: unknown) => AngelEngineClient;
type ChatStreamObserver = (event: ChatStreamDelta) => void;

const nodeRequire = createRequire(import.meta.url);

let chatSession: AngelChatSession | undefined;

export async function sendChat(input: ChatSendInput): Promise<ChatSendResult> {
  return streamChat(input);
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

  chatSession ??= new AngelChatSession(createRuntimeOptions());
  return chatSession.send({ ...input, text }, onEvent, abortSignal);
}

export function closeChatSession() {
  chatSession?.close();
  chatSession = undefined;
}

class AngelChatSession {
  private readonly client: AngelEngineClient;
  private readonly process: RuntimeProcess;
  private conversationId: string | undefined;
  private startPromise: Promise<void> | undefined;
  private sendQueue: Promise<void> = Promise.resolve();

  constructor(private readonly options: Record<string, unknown>) {
    const Client = loadAngelEngineClient();
    this.client = new Client(options);
    this.process = new RuntimeProcess(
      assertStringOption(options.command, 'runtime command'),
      Array.isArray(options.args) ? options.args.map(String) : []
    );
  }

  async send(
    input: ChatSendInput,
    onEvent?: ChatStreamObserver,
    abortSignal?: AbortSignal
  ): Promise<ChatSendResult> {
    const run = this.sendQueue.then(() =>
      this.sendNow(input, onEvent, abortSignal)
    );
    this.sendQueue = run.then(
      (): void => undefined,
      (): void => undefined
    );
    return run;
  }

  close() {
    this.process.close();
  }

  private async sendNow(
    input: ChatSendInput,
    onEvent?: ChatStreamObserver,
    abortSignal?: AbortSignal
  ): Promise<ChatSendResult> {
    throwIfAborted(abortSignal);
    await this.ensureStarted(input.cwd);
    throwIfAborted(abortSignal);

    const conversationId = this.requireConversationId();
    const result = this.client.sendText(conversationId, input.text);
    const collector = new TurnCollector(result.turnId, onEvent);
    await this.handleUpdate(result.update, collector);

    if (!result.turnId) {
      return {
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
      text: turn?.outputText || collector.text || 'The runtime finished without text output.',
      turnId: result.turnId,
    };
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

  private async ensureStarted(cwd?: string) {
    this.startPromise ??= this.start(cwd);
    await this.startPromise;
  }

  private async start(cwd?: string) {
    await this.handleUpdate(this.client.initialize().update);
    await this.waitForRuntime();

    const result = this.client.startThread({ cwd: cwd || process.cwd() });
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

function createRuntimeOptions() {
  const runtime = process.env.ANGEL_ENGINE_RUNTIME ?? 'codex';
  if (runtime === 'kimi') {
    return {
      args: ['acp'],
      auth: { autoAuthenticate: true, needAuth: true },
      command: process.env.ANGEL_ENGINE_COMMAND ?? 'kimi',
      identity: desktopIdentity(),
      protocol: 'acp',
    };
  }
  if (runtime === 'opencode' || runtime === 'open-code') {
    return {
      args: ['acp'],
      auth: { autoAuthenticate: false, needAuth: false },
      command: process.env.ANGEL_ENGINE_COMMAND ?? 'opencode',
      identity: desktopIdentity(),
      protocol: 'acp',
    };
  }
  return {
    args: ['app-server'],
    command: process.env.ANGEL_ENGINE_COMMAND ?? 'codex',
    identity: desktopIdentity(),
    protocol: 'codexAppServer',
  };
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
