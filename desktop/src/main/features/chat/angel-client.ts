import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { isTextLikeMimeType } from "../../../shared/mime";
import type {
  ConversationSnapshot,
  ElicitationResponse,
  HydrateRequest,
  InspectRequest,
  RuntimeOptions,
  SendTextRequest,
  SetModeRequest,
  TurnRunEvent,
  TurnRunResult,
} from "@angel-engine/client-napi";

import type {
  Chat,
  ChatAttachmentInput,
  ChatElicitationResponse,
  ChatHistoryMessage,
  ChatLoadResult,
  ChatPrewarmInput,
  ChatPrewarmResult,
  ChatRuntimeConfig,
  ChatRuntimeConfigInput,
  ChatSendInput,
  ChatSendResult,
  ChatSetModeInput,
  ChatSetModeResult,
} from "../../../shared/chat";
import { normalizeAgentRuntime } from "../../../shared/agents";
import { normalizeChatAttachmentsInput } from "../../../shared/chat";
import {
  createChat,
  renameChatFromPrompt,
  requireChat,
  setChatRemoteThreadId,
  touchChat,
} from "./repository";
import { getProject } from "../projects/repository";
import {
  conversationMessages,
  projectRunResult,
  projectTurnRunEvent,
  runtimeConfigFromConversationSnapshot,
  type ProjectedTurnEvent,
} from "./projection";
import { DesktopClaudeSession } from "./claude/session";

type AngelClientModule = typeof import("@angel-engine/client-napi");
type ChatStreamObserver = (
  event: ProjectedTurnEvent | { chat: Chat; type: "chat" },
) => void;
export type ChatStreamControls = {
  setResolveElicitation?: (
    handler: (
      elicitationId: string,
      response: ChatElicitationResponse,
    ) => Promise<void>,
  ) => void;
};

const nodeRequire = createRequire(__filename);
const clientModule = nodeRequire(
  "@angel-engine/client-napi",
) as AngelClientModule;
const { AngelSession: NativeAngelSession, createRuntimeOptions } = clientModule;

type DesktopChatSession = DesktopAngelSession | DesktopClaudeSession;

const chatSessions = new Map<string, DesktopChatSession>();
const chatPrewarms = new Map<string, ChatPrewarm>();
const MAX_PREWARM_SESSIONS = 4;

type ChatPrewarm = {
  closed: boolean;
  config?: ChatRuntimeConfig;
  createdAt: number;
  input: ChatPrewarmInput;
  key: string;
  promise: Promise<void>;
  session: DesktopChatSession;
  snapshot?: ConversationSnapshot;
};
type ReadyChatPrewarm = ChatPrewarm & {
  config: ChatRuntimeConfig;
  snapshot: ConversationSnapshot;
};

export async function sendChat(input: ChatSendInput): Promise<ChatSendResult> {
  return streamChat(input);
}

export async function loadChatSession(chatId: string): Promise<ChatLoadResult> {
  const chat = requireChat(chatId);
  const session = chatSessions.get(chat.id);
  const cwd = cwdForChat(chat);

  if (!chat.remoteThreadId && !session?.hasConversation()) {
    return { chat, messages: [] };
  }

  const snapshot = await getChatSession(chat).hydrate({
    cwd,
    remoteId: chat.remoteThreadId ?? undefined,
  });
  const updatedChat = persistRemoteThreadId(chat, snapshot);
  const messages = conversationMessages(snapshot) as ChatHistoryMessage[];
  return {
    chat: updatedChat,
    config: runtimeConfigFromConversationSnapshot(
      snapshot,
    ) as ChatRuntimeConfig,
    messages,
  };
}

export async function inspectChatRuntimeConfig(
  input: ChatRuntimeConfigInput,
): Promise<ChatRuntimeConfig> {
  const session = createChatSession(input.runtime);
  try {
    return runtimeConfigFromConversationSnapshot(
      await session.inspect(input.cwd),
    );
  } finally {
    session.close();
  }
}

export async function setChatMode(
  input: ChatSetModeInput,
): Promise<ChatSetModeResult> {
  const chat = requireChat(input.chatId);
  const snapshot = await getChatSession(chat).setMode({
    cwd: cwdForChat(chat) ?? input.cwd,
    mode: input.mode,
    remoteId: chat.remoteThreadId ?? undefined,
  });
  const updatedChat = persistRemoteThreadId(chat, snapshot);
  return {
    chat: updatedChat,
    config: runtimeConfigFromConversationSnapshot(snapshot),
  };
}

export async function prewarmChat(
  input: ChatPrewarmInput,
): Promise<ChatPrewarmResult> {
  const key = chatPrewarmKey(input);
  const existing = chatPrewarms.get(key);
  if (existing) {
    await existing.promise;
    return chatPrewarmResult(existing);
  }

  const prewarm = createChatPrewarm(input, key);
  chatPrewarms.set(key, prewarm);
  trimChatPrewarms();
  await prewarm.promise;
  return chatPrewarmResult(prewarm);
}

export async function streamChat(
  input: ChatSendInput,
  onEvent?: ChatStreamObserver,
  abortSignal?: AbortSignal,
  controls?: ChatStreamControls,
): Promise<ChatSendResult> {
  const attachments = normalizeChatAttachmentsInput(input.attachments);
  if (!input.text && attachments.length === 0) {
    throw new Error("Chat text or attachment is required.");
  }

  const preparedChat = prepareChatForSend(input);
  const { chat, isNewChat, session } = preparedChat;
  if (isNewChat) {
    onEvent?.({ chat, type: "chat" });
  }

  const result = await session.sendText({
    cwd: cwdForChat(chat, input.projectId) ?? input.cwd,
    model: input.model ?? undefined,
    mode: input.mode ?? undefined,
    onEvent,
    onResolveElicitation: controls?.setResolveElicitation,
    reasoningEffort: input.reasoningEffort ?? undefined,
    remoteId: chat.remoteThreadId ?? undefined,
    signal: abortSignal,
    input: chatAttachmentsToClientInput(attachments),
    text: input.text,
  });

  if (input.text) {
    renameChatFromPrompt(chat.id, input.text);
  }
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
  closeChatPrewarms();
}

function getChatSession(chat: Chat) {
  const existing = chatSessions.get(chat.id);
  if (existing) return existing;

  const session = createChatSession(chat.runtime);
  chatSessions.set(chat.id, session);
  return session;
}

function createChatSession(runtime?: string): DesktopChatSession {
  if (normalizeAgentRuntime(runtime) === "claude") {
    return new DesktopClaudeSession();
  }

  return new DesktopAngelSession(
    createRuntimeOptions(runtime, {
      clientName: "angel-engine",
      clientTitle: "Angel Engine",
    }) as RuntimeOptions,
  );
}

function chatAttachmentsToClientInput(
  attachments: ChatAttachmentInput[],
): NonNullable<SendTextRequest["input"]> {
  return attachments.map((attachment) => {
    if (attachment.type === "fileMention") {
      const localPath = attachment.path;
      return {
        mimeType: attachment.mimeType ?? null,
        name: attachment.name || path.basename(localPath),
        path: localPath,
        type: "fileMention",
      };
    }

    const localPath = attachment.path;
    if (localPath) {
      return {
        mimeType: attachment.mimeType,
        name: attachment.name || path.basename(localPath) || "attachment",
        type: "resourceLink",
        uri: pathToFileURL(localPath).href,
      };
    }

    if (attachment.type === "image") {
      return {
        data: attachment.data,
        mimeType: attachment.mimeType,
        name: attachment.name ?? null,
        type: "image",
      };
    }

    const uri = attachmentUri(attachment);
    if (isTextLikeMimeType(attachment.mimeType)) {
      return {
        mimeType: attachment.mimeType,
        text: Buffer.from(attachment.data, "base64").toString("utf8"),
        type: "embeddedTextResource",
        uri,
      };
    }

    return {
      data: attachment.data,
      mimeType: attachment.mimeType,
      name: attachment.name ?? null,
      type: "embeddedBlobResource",
      uri,
    };
  });
}

function attachmentUri(attachment: ChatAttachmentInput) {
  const name = attachment.name || "attachment";
  return `attachment:///${encodeURIComponent(name)}`;
}

function prepareChatForSend(input: ChatSendInput): {
  chat: Chat;
  isNewChat: boolean;
  session: DesktopChatSession;
} {
  if (input.chatId) {
    const chat = requireChat(input.chatId);
    return { chat, isNewChat: false, session: getChatSession(chat) };
  }

  const prewarm = input.prewarmId
    ? takeChatPrewarm(input.prewarmId, input)
    : undefined;
  if (prewarm) {
    const cwd = cwdForProjectId(prewarm.input.projectId) ?? prewarm.input.cwd;
    const createdChat = createChat({
      cwd,
      projectId: prewarm.input.projectId,
      runtime: prewarm.input.runtime,
    });
    chatSessions.set(createdChat.id, prewarm.session);
    const chat = persistRemoteThreadId(createdChat, prewarm.snapshot);
    return { chat, isNewChat: true, session: prewarm.session };
  }

  const chat = createChat({
    cwd: cwdForProjectId(input.projectId) ?? input.cwd,
    projectId: input.projectId,
    runtime: input.runtime,
  });
  return { chat, isNewChat: true, session: getChatSession(chat) };
}

function persistRemoteThreadId(chat: Chat, snapshot: ConversationSnapshot) {
  if (
    snapshot.remoteKind !== "known" ||
    !snapshot.remoteId ||
    snapshot.remoteId === chat.remoteThreadId
  ) {
    return chat;
  }
  return setChatRemoteThreadId(chat.id, snapshot.remoteId);
}

function chatPrewarmResult(prewarm: ChatPrewarm): ChatPrewarmResult {
  if (!isReadyChatPrewarm(prewarm)) {
    throw new Error("Chat prewarm did not produce runtime config.");
  }

  return {
    config: prewarm.config,
    prewarmId: prewarm.key,
  };
}

function takeChatPrewarm(
  prewarmId: string,
  input: ChatSendInput,
): ReadyChatPrewarm | undefined {
  const prewarm = chatPrewarms.get(prewarmId);
  if (!prewarm || !isReadyChatPrewarm(prewarm)) return undefined;

  chatPrewarms.delete(prewarm.key);

  if (!chatPrewarmMatches(prewarm.input, input)) {
    closeChatPrewarm(prewarm);
    return undefined;
  }

  return prewarm;
}

function isReadyChatPrewarm(prewarm: ChatPrewarm): prewarm is ReadyChatPrewarm {
  return Boolean(prewarm.config && prewarm.snapshot);
}

function createChatPrewarm(input: ChatPrewarmInput, key: string): ChatPrewarm {
  const session = createChatSession(input.runtime);
  const cwd = cwdForProjectId(input.projectId) ?? input.cwd;
  const prewarm: ChatPrewarm = {
    closed: false,
    createdAt: Date.now(),
    input,
    key,
    promise: Promise.resolve(),
    session,
  };

  prewarm.promise = session
    .inspect({ cwd })
    .then((snapshot) => {
      if (prewarm.closed) {
        throw new Error("Chat prewarm was closed.");
      }

      prewarm.snapshot = snapshot;
      prewarm.config = runtimeConfigFromConversationSnapshot(
        snapshot,
      ) as ChatRuntimeConfig;
    })
    .catch((error: unknown) => {
      closeChatPrewarm(prewarm);
      throw error;
    });

  return prewarm;
}

function chatPrewarmMatches(
  prewarmInput: ChatPrewarmInput,
  sendInput: ChatSendInput,
) {
  return (
    (cwdForProjectId(prewarmInput.projectId) ?? prewarmInput.cwd) ===
      (cwdForProjectId(sendInput.projectId) ?? sendInput.cwd) &&
    (prewarmInput.projectId ?? null) === (sendInput.projectId ?? null) &&
    (prewarmInput.runtime ?? undefined) === (sendInput.runtime ?? undefined)
  );
}

function chatPrewarmKey(input: ChatPrewarmInput) {
  return JSON.stringify([
    input.runtime ?? "",
    cwdForProjectId(input.projectId) ?? input.cwd ?? "",
    input.projectId ?? "",
  ]);
}

function cwdForChat(chat: Chat, projectId?: string | null): string | undefined {
  return cwdForProjectId(projectId ?? chat.projectId) ?? chat.cwd ?? undefined;
}

function cwdForProjectId(projectId: string | null | undefined) {
  if (!projectId) return undefined;
  const project = getProject(projectId);
  if (!project) {
    throw new Error(`Project path not found for project id: ${projectId}`);
  }
  return project.path;
}

function trimChatPrewarms() {
  const prewarms = Array.from(chatPrewarms.values()).sort(
    (left, right) => left.createdAt - right.createdAt,
  );
  while (prewarms.length > MAX_PREWARM_SESSIONS) {
    const prewarm = prewarms.shift();
    if (!prewarm) return;
    closeChatPrewarm(prewarm);
  }
}

function closeChatPrewarms() {
  for (const prewarm of chatPrewarms.values()) {
    closeChatPrewarm(prewarm);
  }
  chatPrewarms.clear();
}

function closeChatPrewarm(prewarm: ChatPrewarm) {
  if (prewarm.closed) return;

  prewarm.closed = true;
  chatPrewarms.delete(prewarm.key);
  prewarm.session.close();
}

type NativeAngelSessionInstance = InstanceType<typeof NativeAngelSession>;
type DesktopSendTextRequest = SendTextRequest & {
  onEvent?: (event: ProjectedTurnEvent) => void;
  onResolveElicitation?: (
    handler: (
      elicitationId: string,
      response: ChatElicitationResponse,
    ) => Promise<void>,
  ) => void;
  signal?: AbortSignal;
};
type PendingElicitation = {
  promise: Promise<TurnRunEvent[]>;
  reject: (error: Error) => void;
  resolve: (events?: TurnRunEvent[]) => void;
};

class DesktopAngelSession {
  private readonly pendingElicitations = new Map<string, PendingElicitation>();
  private readonly session: NativeAngelSessionInstance;
  private operationQueue = Promise.resolve();

  constructor(options: RuntimeOptions) {
    this.session = new NativeAngelSession(options);
  }

  close(): void {
    for (const pending of this.pendingElicitations.values()) {
      pending.reject(new Error("Chat session closed."));
    }
    this.pendingElicitations.clear();
    this.session.close();
  }

  hasConversation(): boolean {
    return this.session.hasConversation();
  }

  hydrate(request: HydrateRequest = {}): Promise<ConversationSnapshot> {
    return this.enqueue(() => this.session.hydrate(request));
  }

  inspect(cwd?: string | InspectRequest): Promise<ConversationSnapshot> {
    const request: InspectRequest =
      typeof cwd === "string" ? { cwd } : (cwd ?? {});
    return this.enqueue(() => this.session.inspect(request));
  }

  setMode(request: SetModeRequest): Promise<ConversationSnapshot> {
    return this.enqueue(() => this.session.setMode(request));
  }

  sendText(request: DesktopSendTextRequest): Promise<TurnRunResult> {
    return this.enqueue(() => this.sendTextNow(request));
  }

  private async sendTextNow(
    request: DesktopSendTextRequest,
  ): Promise<TurnRunResult> {
    const text = request.text ?? "";
    const input = request.input ?? [];
    if (!text && input.length === 0) {
      throw new Error("Text or input is required.");
    }

    throwIfAborted(request.signal);
    request.onResolveElicitation?.((elicitationId, response) =>
      this.resolveElicitationNow(elicitationId, response),
    );

    let events = await this.session.startTextTurn({
      cwd: request.cwd,
      mode: request.mode,
      model: request.model,
      input,
      reasoningEffort: request.reasoningEffort,
      remoteId: request.remoteId,
      text,
    });

    for (;;) {
      const result = await this.dispatchEvents(events, request);
      if (result) return result;

      if (request.signal?.aborted) {
        await this.cancelNativeTurn().catch((): undefined => undefined);
        throwIfAborted(request.signal);
      }

      const event = await this.session.nextTurnEvent(50);
      events = event ? [event] : [];
      if (events.length === 0) {
        await yieldToEventLoop();
      }
    }
  }

  private async dispatchEvents(
    events: TurnRunEvent[],
    request: DesktopSendTextRequest,
  ): Promise<TurnRunResult | undefined> {
    for (const event of events) {
      const projected = projectTurnRunEvent(event);
      if (projected) request.onEvent?.(projected);

      if (event.type === "elicitation" && event.elicitation) {
        const followup = await this.waitForElicitation(
          event.elicitation.id,
          request.signal,
        );
        const result = await this.dispatchEvents(followup, request);
        if (result) return result;
        continue;
      }

      if (event.type === "result" && event.result) {
        return event.result;
      }
    }

    return undefined;
  }

  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    const run = this.operationQueue.then(action);
    this.operationQueue = run.then(
      (): undefined => undefined,
      (): undefined => undefined,
    );
    return run;
  }

  private waitForElicitation(
    elicitationId: string,
    signal?: AbortSignal,
  ): Promise<TurnRunEvent[]> {
    if (!elicitationId) {
      return Promise.reject(
        new Error("Runtime opened an invalid elicitation."),
      );
    }
    return this.preparePendingElicitation(elicitationId, signal).promise;
  }

  private preparePendingElicitation(
    elicitationId: string,
    signal?: AbortSignal,
  ): PendingElicitation {
    const existing = this.pendingElicitations.get(elicitationId);
    if (existing) return existing;

    let cleanup: () => void = () => undefined;
    let resolvePending!: (events?: TurnRunEvent[]) => void;
    let rejectPending!: (error: Error) => void;
    const promise = new Promise<TurnRunEvent[]>((resolve, reject) => {
      const abort = (): void => {
        this.cancelNativeTurn().catch((): undefined => undefined);
        rejectPending(abortError(signal));
      };
      cleanup = (): void => {
        signal?.removeEventListener?.("abort", abort);
        this.pendingElicitations.delete(elicitationId);
      };
      resolvePending = (events: TurnRunEvent[] = []): void => {
        cleanup();
        resolve(events);
      };
      rejectPending = (error: Error): void => {
        cleanup();
        reject(error);
      };
      signal?.addEventListener?.("abort", abort, { once: true });
    });

    const pending = {
      promise,
      reject: rejectPending,
      resolve: resolvePending,
    };
    this.pendingElicitations.set(elicitationId, pending);
    if (signal?.aborted) {
      pending.reject(abortError(signal));
    }
    return pending;
  }

  private async resolveElicitationNow(
    elicitationId: string,
    response: ChatElicitationResponse,
  ) {
    const pending = this.pendingElicitations.get(elicitationId);
    if (!pending) {
      throw new Error("Chat stream is not waiting for this user input.");
    }

    try {
      pending.resolve(
        await this.session.resolveElicitation(
          elicitationId,
          response as ElicitationResponse,
        ),
      );
    } catch (error) {
      pending.reject(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private async cancelNativeTurn() {
    for (const pending of this.pendingElicitations.values()) {
      pending.reject(new Error("Chat request cancelled."));
    }
    this.pendingElicitations.clear();
    return this.session.cancelTurn();
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw abortError(signal);
  }
}

function abortError(signal?: AbortSignal) {
  if (signal?.reason instanceof Error) {
    return signal.reason;
  }
  const error = new Error("Chat request cancelled.");
  error.name = "AbortError";
  return error;
}

function yieldToEventLoop() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

export type {
  ChatRuntimeConfig as EngineRuntimeConfig,
  TurnRunResult as RunTurnResult,
};
