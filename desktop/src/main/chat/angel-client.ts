import { createRequire } from "node:module";

import type {
  ConversationSnapshot,
  ElicitationResponse,
  HydrateRequest,
  InspectRequest,
  RuntimeOptions,
  SendTextRequest,
  TurnRunEvent,
  TurnRunResult,
} from "@angel-engine/client-napi";

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
} from "../../shared/chat";
import {
  createChat,
  renameChatFromPrompt,
  requireChat,
  setChatRemoteThreadId,
  touchChat,
} from "./repository";
import {
  conversationMessages,
  projectRunResult,
  projectTurnRunEvent,
  runtimeConfigFromConversationSnapshot,
  type ProjectedTurnEvent,
} from "./projection";

type AngelClientModule = typeof import("@angel-engine/client-napi");
type ChatStreamObserver = (
  event:
    | ChatStreamDelta
    | { action: ChatToolAction; type: "tool" }
    | { chat: Chat; type: "chat" },
) => void;
export type ChatStreamControls = {
  setResolveElicitation?: (
    handler: (
      elicitationId: string,
      response: ChatElicitationResponse,
    ) => Promise<void>,
  ) => void;
};

const nodeRequire = createRequire(import.meta.url);
const clientModule = nodeRequire(
  "@angel-engine/client-napi",
) as AngelClientModule;
const { AngelSession: NativeAngelSession, createRuntimeOptions } = clientModule;

const chatSessions = new Map<string, DesktopAngelSession>();

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

export async function streamChat(
  input: ChatSendInput,
  onEvent?: ChatStreamObserver,
  abortSignal?: AbortSignal,
  controls?: ChatStreamControls,
): Promise<ChatSendResult> {
  const text = input.text.trim();
  if (!text) {
    throw new Error("Chat text is required.");
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
    onEvent?.({ chat, type: "chat" });
  }

  const result = await getChatSession(chat).sendText({
    cwd: input.cwd ?? chat.cwd ?? undefined,
    model: input.model,
    mode: input.mode,
    onEvent,
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

function createChatSession(runtime?: string): DesktopAngelSession {
  return new DesktopAngelSession(
    createRuntimeOptions(runtime, {
      clientName: "angel-engine-desktop",
      clientTitle: "Angel Engine Desktop",
    }) as RuntimeOptions,
  );
}

function persistRemoteThreadId(chat: Chat, snapshot: ConversationSnapshot) {
  if (!snapshot.remoteId || snapshot.remoteId === chat.remoteThreadId) {
    return chat;
  }
  return setChatRemoteThreadId(chat.id, snapshot.remoteId);
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

  sendText(request: DesktopSendTextRequest): Promise<TurnRunResult> {
    return this.enqueue(() => this.sendTextNow(request));
  }

  private async sendTextNow(
    request: DesktopSendTextRequest,
  ): Promise<TurnRunResult> {
    const text = String(request.text || "").trim();
    if (!text) {
      throw new Error("Text is required.");
    }

    throwIfAborted(request.signal);
    request.onResolveElicitation?.((elicitationId, response) =>
      this.resolveElicitationNow(elicitationId, response),
    );

    let events = await this.session.startTextTurn({
      cwd: request.cwd,
      mode: request.mode,
      model: request.model,
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
