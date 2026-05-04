import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { app } from 'electron';

import type {
  Chat,
  ChatHistoryMessage,
  ChatHistoryMessagePart,
  ChatLoadResult,
  ChatSendInput,
  ChatSendResult,
  ChatStreamDelta,
  ChatToolAction,
  ChatToolActionOutput,
} from '../../shared/chat';
import {
  appendChatTextPart,
  chatPartsText,
  chatToolActionToPart,
  cloneChatHistoryPart,
} from '../../shared/chat';
import {
  normalizeAgentRuntime,
  selectedAgentConfigValue,
} from '../../shared/agents';
import {
  createChat,
  renameChatFromPrompt,
  requireChat,
  setChatRemoteThreadId,
  touchChat,
} from './repository';

type ClientUpdate = {
  events?: ClientEvent[];
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
    mode?: string | null;
  };
  actions?: ChatToolAction[];
  configOptions?: ConfigOptionsSnapshot;
  history?: {
    replay?: HistoryReplaySnapshot[];
  };
  id: string;
  modes?: SessionModeStateSnapshot;
  reasoning?: ReasoningOptionsSnapshot;
  remoteId?: string | null;
  turns?: TurnSnapshot[];
};

type ReasoningOptionsSnapshot = {
  availableEfforts?: string[];
  canSet?: boolean;
  currentEffort?: string | null;
};

type ConfigOptionsSnapshot = {
  options?: Array<{
    category?: string;
    id?: string;
    options?: Array<{ label?: string; value?: string }>;
    value?: string | null;
  }>;
};

type SessionModeStateSnapshot = {
  availableModes?: Array<{
    description?: string;
    id: string;
    name?: string;
  }>;
  currentModeId?: string | null;
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
  planText?: string;
  reasoningText?: string;
};

type ClientEvent = {
  action?: ChatToolAction;
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
  content?: ChatToolActionOutput;
  conversationId?: string;
  turnId?: string;
  type: 'actionOutputDelta' | 'assistantDelta' | 'planDelta' | 'reasoningDelta';
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
  setMode(conversationId: string, mode: string): ClientCommandResult;
  setReasoningEffort(conversationId: string, effort: string): ClientCommandResult;
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
type ChatStreamObserver = (
  event: ChatStreamDelta | { action: ChatToolAction; type: 'tool' }
) => void;
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
        runtime: input.runtime ?? defaultRuntimeName(),
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
    content: result.content,
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
  const turnMessages = messagesFromTurns(snapshot.turns ?? [], snapshot.actions ?? []);
  return [...replayMessages, ...turnMessages];
}

function messagesFromTurns(
  turns: TurnSnapshot[],
  actions: ChatToolAction[]
): ChatHistoryMessage[] {
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

    const content = contentFromTurnSnapshot(turn, actionsForTurn(actions, turn.id));
    if (content.length > 0) {
      messages.push({
        content,
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
  let assistantParts: ChatHistoryMessagePart[] = [];
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
    assistantParts = assistantParts.filter(
      (part) => part.type === 'tool-call' || part.text.trim()
    );
    if (assistantParts.length === 0) return;
    messages.push({
      content: assistantParts.map(cloneChatHistoryPart),
      id: `history-${messageIndex++}:assistant`,
      role: 'assistant',
    });
    assistantParts = [];
  };

  for (const [index, entry] of replay.entries()) {
    const text = entry.content?.text;
    if (!text) continue;

    if (entry.role === 'user') {
      flushAssistant();
      userText += text;
    } else if (entry.role === 'assistant') {
      flushUser();
      appendChatTextPart(assistantParts, 'text', text);
    } else if (entry.role === 'reasoning') {
      flushUser();
      appendChatTextPart(assistantParts, 'reasoning', text);
    } else if (entry.role === 'tool') {
      flushUser();
      assistantParts.push(historyToolPartFromText(text, index));
    }
  }

  flushUser();
  flushAssistant();
  return messages;
}

function contentFromTurnSnapshot(
  turn?: Pick<TurnSnapshot, 'outputText' | 'planText' | 'reasoningText'> | null,
  actions: ChatToolAction[] = []
): ChatHistoryMessagePart[] {
  const parts: ChatHistoryMessagePart[] = [];
  const reasoningText = [turn?.reasoningText, turn?.planText]
    .filter((text): text is string => Boolean(text?.trim()))
    .join('\n');

  appendChatTextPart(parts, 'reasoning', reasoningText);
  for (const action of actions) {
    parts.push(chatToolActionToPart(action));
  }
  appendChatTextPart(parts, 'text', turn?.outputText ?? '');

  return parts;
}

function actionsForTurn(actions: ChatToolAction[], turnId: string) {
  return actions.filter((action) => action.turnId === turnId);
}

function historyToolPartFromText(text: string, index: number): ChatHistoryMessagePart {
  return chatToolActionToPart(historyToolActionFromText(text, index));
}

function historyToolActionFromText(text: string, index: number): ChatToolAction {
  const parsed = parseJsonObject(text);
  const id =
    getString(parsed, 'toolCallId') ||
    getString(parsed, 'tool_call_id') ||
    getString(parsed, 'id') ||
    `history-tool-${index}`;
  const outputText = toolHistoryOutputText(parsed);

  return {
    id,
    kind: getString(parsed, 'kind') || getString(parsed, 'type') || 'tool',
    outputText,
    phase: getString(parsed, 'status') || 'completed',
    rawInput:
      getJsonString(parsed, 'rawInput') ||
      getJsonString(parsed, 'raw_input') ||
      undefined,
    title: getString(parsed, 'title') || getString(parsed, 'name') || 'Tool call',
  };
}

function parseJsonObject(text: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function getString(
  object: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  const value = object?.[key];
  return typeof value === 'string' && value ? value : undefined;
}

function getJsonString(
  object: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  const value = object?.[key];
  if (value === undefined || value === null) return undefined;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function toolHistoryOutputText(object: Record<string, unknown> | undefined) {
  const rawOutput =
    getJsonString(object, 'rawOutput') || getJsonString(object, 'raw_output');
  if (rawOutput) return rawOutput;

  const content = object?.content;
  if (!Array.isArray(content)) return '';

  return content
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const contentItem = item as Record<string, unknown>;
      const nested = contentItem.content;
      if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        return getString(nested as Record<string, unknown>, 'text') ?? '';
      }
      return getString(contentItem, 'text') ?? '';
    })
    .filter(Boolean)
    .join('\n');
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
    content: ChatHistoryMessagePart[];
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
    content: ChatHistoryMessagePart[];
    reasoning?: string;
    remoteThreadId?: string;
    text: string;
    turnId?: string;
  }> {
    throwIfAborted(abortSignal);
    await this.ensureStarted(chat, true, input.cwd);
    throwIfAborted(abortSignal);

    const conversationId = this.requireConversationId();
    await this.ensureMode(conversationId, input.mode);
    await this.ensureReasoningEffort(conversationId, input.reasoningEffort);
    const result = this.client.sendText(conversationId, input.text);
    const collector = new TurnCollector(result.turnId, onEvent);
    await this.handleUpdate(result.update, collector);

    if (!result.turnId) {
      const content = collector.content();
      if (content.length === 0) {
        appendChatTextPart(
          content,
          'text',
          'The runtime accepted the message without starting a turn.'
        );
      }
      return {
        content,
        remoteThreadId: this.threadRemoteId(),
        text: chatPartsText(content, 'text'),
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
    const snapshot = this.client.threadState(conversationId);
    const snapshotActions = snapshot?.actions ?? [];
    collector.reconcileActions(snapshotActions);
    const snapshotTurn = snapshot?.turns?.find((item) => item.id === result.turnId);
    const content = collector.content();
    const finalContent =
      content.length > 0
        ? content
        : contentFromTurnSnapshot(snapshotTurn ?? turn, actionsForTurn(snapshotActions, result.turnId));
    const text =
      turn?.outputText ||
      snapshotTurn?.outputText ||
      chatPartsText(finalContent, 'text') ||
      'The runtime finished without text output.';
    const reasoning =
      turn?.reasoningText ||
      snapshotTurn?.reasoningText ||
      chatPartsText(finalContent, 'reasoning') ||
      undefined;

    return {
      content: finalContent,
      reasoning,
      remoteThreadId: this.threadRemoteId(),
      text,
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

  private async ensureReasoningEffort(
    conversationId: string,
    requestedEffort?: string | null
  ) {
    const effort =
      selectedAgentConfigValue(requestedEffort) ??
      defaultReasoningEffort(this.options.runtime);
    if (!effort || effort === 'default') return;

    const reasoning = this.client.threadState(conversationId)?.reasoning;
    if (reasoning?.canSet === false || reasoning?.currentEffort === effort) {
      return;
    }

    const result = this.client.setReasoningEffort(conversationId, effort);
    await this.handleUpdate(result.update);
  }

  private async ensureMode(
    conversationId: string,
    requestedMode?: string | null
  ) {
    const mode = requestedMode?.trim();
    if (!mode) return;

    const snapshot = this.client.threadState(conversationId);
    const currentMode = snapshot?.context?.mode ?? snapshot?.modes?.currentModeId;
    if (mode === 'default' && !currentMode) return;
    if (currentMode === mode) return;
    if (!canSetMode(this.options.runtime, snapshot, mode)) return;

    const result = this.client.setMode(conversationId, mode);
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
    const events = update?.events ?? [];
    const hasOrderedStreamEvents = events.some(isOrderedStreamEvent);

    for (const event of events) {
      if (event.type === 'runtimeFaulted') {
        throw new Error(`Runtime faulted (${event.code}): ${event.message}`);
      }
      collector?.acceptEvent(event);
    }

    if (!hasOrderedStreamEvents) {
      for (const delta of streamDeltas) {
        collector?.acceptDelta(delta);
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
  private readonly actionPartIndexes = new Map<string, number>();
  private readonly parts: ChatHistoryMessagePart[] = [];

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

  content() {
    return this.parts.map(cloneChatHistoryPart);
  }

  reconcileActions(actions: ChatToolAction[]) {
    for (const action of actions) {
      if (!this.acceptsTurn(action.turnId)) continue;
      if (!this.actionPartIndexes.has(action.id)) continue;
      this.upsertAction(action);
    }
  }

  private accept(event: ClientEvent | EngineStreamDelta) {
    if (
      (event.type === 'actionObserved' || event.type === 'actionUpdated') &&
      event.action
    ) {
      this.upsertAction(event.action);
      return;
    }

    if (event.type === 'actionOutputDelta') {
      const delta = event as EngineStreamDelta;
      if (delta.actionId) this.acceptActionOutputDelta(delta);
      return;
    }

    if (!this.acceptsTurn(event.turnId)) return;

    const text = event.content?.text;
    if (!text) return;

    if (event.type === 'assistantDelta') {
      appendChatTextPart(this.parts, 'text', text);
      this.onEvent?.({ part: 'text', text, turnId: event.turnId, type: 'delta' });
    } else if (event.type === 'reasoningDelta') {
      appendChatTextPart(this.parts, 'reasoning', text);
      this.onEvent?.({
        part: 'reasoning',
        text,
        turnId: event.turnId,
        type: 'delta',
      });
    } else if (event.type === 'planDelta') {
      appendChatTextPart(this.parts, 'reasoning', text);
      this.onEvent?.({
        part: 'reasoning',
        text,
        turnId: event.turnId,
        type: 'delta',
      });
    }
  }

  private acceptsTurn(turnId: string | undefined) {
    return !turnId || !this.turnId || turnId === this.turnId;
  }

  private acceptActionOutputDelta(delta: EngineStreamDelta) {
    if (!delta.actionId || !this.acceptsTurn(delta.turnId)) return;

    const currentIndex = this.actionPartIndexes.get(delta.actionId);
    const current =
      currentIndex === undefined ? undefined : this.parts[currentIndex];
    const currentAction =
      current?.type === 'tool-call' ? current.artifact : undefined;
    const output = [
      ...(currentAction?.output ?? []),
      ...(delta.content ? [delta.content] : []),
    ];
    const outputText = output.map((item) => item.text).join('');

    this.upsertAction({
      id: delta.actionId,
      kind: currentAction?.kind ?? 'tool',
      output,
      outputText,
      phase: currentAction?.phase ?? 'streamingResult',
      title: currentAction?.title ?? 'Tool call',
      turnId: delta.turnId,
    });
  }

  private upsertAction(action: ChatToolAction) {
    if (!this.acceptsTurn(action.turnId)) return;

    const part = chatToolActionToPart(action);
    const index = this.actionPartIndexes.get(action.id);
    if (index === undefined) {
      this.actionPartIndexes.set(action.id, this.parts.length);
      this.parts.push(part);
    } else {
      this.parts[index] = part;
    }

    this.onEvent?.({ action, type: 'tool' });
  }
}

function isOrderedStreamEvent(event: ClientEvent) {
  return (
    event.type === 'actionObserved' ||
    event.type === 'actionUpdated' ||
    event.type === 'assistantDelta' ||
    event.type === 'planDelta' ||
    event.type === 'reasoningDelta'
  );
}

function createRuntimeOptions(runtimeName?: string): RuntimeOptions {
  runtimeName ??= defaultRuntimeName();
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
  return normalizeAgentRuntime(runtime);
}

function defaultReasoningEffort(runtime: unknown) {
  const configured = process.env.ANGEL_ENGINE_REASONING_EFFORT?.trim();
  if (configured) return selectedAgentConfigValue(configured);
  return runtime === 'codex' ? 'high' : undefined;
}

function canSetMode(
  runtime: unknown,
  snapshot: ConversationSnapshot | null,
  mode: string
) {
  const availableModes = snapshot?.modes?.availableModes ?? [];
  if (availableModes.length > 0) {
    return availableModes.some((availableMode) => availableMode.id === mode);
  }
  return runtime === 'codex' && (mode === 'default' || mode === 'plan');
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
