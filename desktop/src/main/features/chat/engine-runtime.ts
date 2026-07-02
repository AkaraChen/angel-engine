import type {
  ConversationSnapshot,
  ElicitationResponse,
  HydrateRequest,
  InspectRequest,
  RuntimeOptions,
  SendTextRequest,
  SetModeRequest,
  SetPermissionModeRequest,
  TurnRunEvent,
  TurnRunResult,
} from "@angel-engine/client-napi";
import type { ProjectedTurnEvent } from "@angel-engine/js-client/projection";
import type {
  Chat,
  ChatAttachmentInput,
  ChatCreateInput,
  ChatElicitationResponse,
  ChatLoadResult,
  ChatPrewarmInput,
  ChatPrewarmResult,
  ChatRuntimeConfig,
  ChatRuntimeConfigInput,
  ChatSendInput,
  ChatSendResult,
  ChatSetModeInput,
  ChatSetModeResult,
  ChatSetPermissionModeInput,
  ChatSetPermissionModeResult,
  ChatSetRuntimeInput,
} from "../../../shared/chat";
import type { ChatRuntime } from "./runtime";

import path from "node:path";
import { ClaudeCodeSession } from "@angel-engine/claude-client";

import {
  ActionPhase,
  ClientInputType,
  createRuntimeOptions,
  ElicitationResponseType,
  AngelSession as NativeAngelSession,
  TurnRunEventType,
} from "@angel-engine/client-napi";
import {
  conversationMessages,
  projectTurnRunEvent,
  projectTurnRunResult,
  runtimeConfigFromConversationSnapshot,
} from "@angel-engine/js-client/projection";
import {
  abortError,
  throwIfAborted,
} from "@angel-engine/js-client/utils/errors";
import is from "@sindresorhus/is";
import { app } from "electron";
import { isCustomAgentRuntime } from "../../../shared/agents";
import { normalizeChatAttachmentsInput } from "../../../shared/chat";
import { isTextLikeMimeType } from "../../../shared/mime";
import { getCustomAgent } from "../agents/repository";
import { createProjectWorktree } from "../projects/git";
import { getProject } from "../projects/repository";
import {
  createChat,
  renameChatFromPrompt,
  requireChat,
  setChatRemoteThreadId,
  setChatRuntime as setChatRuntimeRecord,
  touchChat,
} from "./repository";
type ClientInput = NonNullable<SendTextRequest["input"]>[number];

type ChatStreamObserver = (
  event: ProjectedTurnEvent | { chat: Chat; type: "chat" },
) => void;
interface ChatStreamControls {
  setResolveElicitation?: (
    handler: (
      elicitationId: string,
      response: ChatElicitationResponse,
    ) => Promise<void>,
  ) => void;
}

type DesktopChatSession = DesktopAngelSession | ClaudeCodeSession;

const chatSessions = new Map<string, DesktopChatSession>();
const chatSessionCreations = new Map<string, Promise<DesktopChatSession>>();
const chatPrewarms = new Map<string, ChatPrewarm>();
const MAX_PREWARM_SESSIONS = 4;

interface ChatPrewarm {
  closed: boolean;
  config?: ChatRuntimeConfig;
  createdAt: number;
  cwd: string;
  input: ChatPrewarmInput;
  key: string;
  promise: Promise<void>;
  session: DesktopChatSession;
  snapshot?: ConversationSnapshot;
}
type ReadyChatPrewarm = ChatPrewarm & {
  config: ChatRuntimeConfig;
  snapshot: ConversationSnapshot;
};

async function sendChat(input: ChatSendInput): Promise<ChatSendResult> {
  return streamChat(input);
}

export function createChatRuntime(): ChatRuntime {
  return {
    closeChatSession,
    createChatFromInput,
    inspectChatRuntimeConfig,
    loadChatSession,
    prewarmChat,
    sendChat,
    setChatMode,
    setChatPermissionMode,
    setChatRuntime,
    streamChat,
  };
}

async function loadChatSession(chatId: string): Promise<ChatLoadResult> {
  const chat = requireChat(chatId);
  const session = chatSessions.get(chat.id);
  const cwd = cwdForChat(chat);

  if (!is.nonEmptyString(chat.remoteThreadId) && !session?.hasConversation()) {
    return { chat, messages: [] };
  }

  const snapshot = await (
    await getChatSession(chat)
  ).hydrate({
    cwd,
    remoteId: chat.remoteThreadId ?? undefined,
  });
  const updatedChat = persistRemoteThreadId(chat, snapshot);
  const messages = conversationMessages(snapshot);
  return {
    chat: updatedChat,
    config: runtimeConfigFromConversationSnapshot(snapshot),
    messages,
  };
}

async function inspectChatRuntimeConfig(
  input: ChatRuntimeConfigInput,
): Promise<ChatRuntimeConfig> {
  const session = await createChatSession(input.runtime);
  try {
    return runtimeConfigFromConversationSnapshot(
      await session.inspect(input.cwd ?? standaloneChatCwd()),
    );
  } finally {
    session.close();
  }
}

function createChatFromInput(input: ChatCreateInput): Chat {
  if (input.creationLocation === "worktree") {
    throw new Error("Worktree chats must be created by sending a message.");
  }

  return createChat({
    ...input,
    cwd: cwdForProjectOrStandalone(input.projectId),
  });
}

async function setChatMode(
  input: ChatSetModeInput,
): Promise<ChatSetModeResult> {
  const chat = requireChat(input.chatId);
  const snapshot = await (
    await getChatSession(chat)
  ).setMode({
    cwd: cwdForChat(chat),
    mode: input.mode,
    remoteId: chat.remoteThreadId ?? undefined,
  });
  const updatedChat = persistRemoteThreadId(chat, snapshot);
  return {
    chat: updatedChat,
    config: runtimeConfigFromConversationSnapshot(snapshot),
  };
}

async function setChatPermissionMode(
  input: ChatSetPermissionModeInput,
): Promise<ChatSetPermissionModeResult> {
  const chat = requireChat(input.chatId);
  const snapshot = await (
    await getChatSession(chat)
  ).setPermissionMode({
    cwd: cwdForChat(chat),
    mode: input.mode,
    remoteId: chat.remoteThreadId ?? undefined,
  });
  const updatedChat = persistRemoteThreadId(chat, snapshot);
  return {
    chat: updatedChat,
    config: runtimeConfigFromConversationSnapshot(snapshot),
  };
}

function setChatRuntime(input: ChatSetRuntimeInput): Chat {
  const chat = requireChat(input.chatId);
  const session = chatSessions.get(chat.id);
  if (
    is.nonEmptyString(chat.remoteThreadId) ||
    session?.hasConversation() === true
  ) {
    throw new Error(
      "Chat runtime cannot be changed after the chat has started.",
    );
  }

  session?.close();
  chatSessions.delete(chat.id);
  return setChatRuntimeRecord(chat.id, input.runtime);
}

async function prewarmChat(
  input: ChatPrewarmInput,
): Promise<ChatPrewarmResult> {
  if (input.creationLocation === "worktree") {
    throw new Error("Worktree chats cannot be prewarmed.");
  }

  const key = chatPrewarmKey(input);
  const existing = chatPrewarms.get(key);
  if (existing) {
    await existing.promise;
    return chatPrewarmResult(existing);
  }

  const prewarm = await createChatPrewarm(input, key);
  chatPrewarms.set(key, prewarm);
  trimChatPrewarms();
  await prewarm.promise;
  return chatPrewarmResult(prewarm);
}

async function streamChat(
  input: ChatSendInput,
  onEvent?: ChatStreamObserver,
  abortSignal?: AbortSignal,
  controls?: ChatStreamControls,
): Promise<ChatSendResult> {
  const attachments = normalizeChatAttachmentsInput(input.attachments);
  if (!input.text && attachments.length === 0) {
    throw new Error("Chat text or attachment is required.");
  }

  const preparedChat = await prepareChatForSend(input);
  const { chat, isNewChat, session } = preparedChat;
  if (isNewChat) {
    onEvent?.({ chat, type: "chat" });
  }

  const result = await session.sendText({
    cwd: cwdForChat(chat, input.projectId),
    model: input.model ?? undefined,
    mode: input.mode ?? undefined,
    permissionMode: input.permissionMode ?? undefined,
    onEvent: (event) => {
      const projected = projectTurnRunEvent(event);
      if (projected) onEvent?.(projected);
    },
    onResolveElicitation: controls?.setResolveElicitation,
    reasoningEffort: input.reasoningEffort ?? undefined,
    remoteId: chat.remoteThreadId ?? undefined,
    signal: abortSignal,
    input: chatAttachmentsToClientInput(attachments),
    text: input.text,
  });

  if (is.nonEmptyString(input.text)) {
    renameChatFromPrompt(chat.id, input.text);
  }
  const projected = projectTurnRunResult(result);
  const finalChat = is.nonEmptyString(projected.remoteThreadId)
    ? setChatRemoteThreadId(chat.id, projected.remoteThreadId)
    : touchChat(chat.id);
  const content = projected.content;

  return {
    chat: finalChat,
    chatId: finalChat.id,
    config: projected.config,
    content,
    model: projected.model ?? undefined,
    reasoning: projected.reasoning,
    text: projected.text,
    turnId: projected.turnId,
  };
}

function closeChatSession(chatId?: string) {
  if (is.nonEmptyString(chatId)) {
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

async function getChatSession(chat: Chat): Promise<DesktopChatSession> {
  return getOrCreateChatSession(
    chat.id,
    chatSessions,
    chatSessionCreations,
    async () => createChatSession(chat.runtime),
  );
}

export async function getOrCreateChatSession<T>(
  chatId: string,
  sessions: Map<string, T>,
  creations: Map<string, Promise<T>>,
  createSession: () => Promise<T>,
): Promise<T> {
  const existing = sessions.get(chatId);
  if (existing !== undefined) return existing;

  const pending = creations.get(chatId);
  if (pending !== undefined) return pending;

  const creation = createSession()
    .then((session) => {
      sessions.set(chatId, session);
      return session;
    })
    .finally(() => {
      creations.delete(chatId);
    });
  creations.set(chatId, creation);
  return creation;
}

async function createChatSession(
  runtime?: string,
): Promise<DesktopChatSession> {
  if (runtime === "claude") {
    return new ClaudeCodeSession();
  }

  if (isCustomAgentRuntime(runtime)) {
    const agent = getCustomAgent(runtime);
    if (!agent) {
      throw new Error(`Custom agent not found: ${runtime}`);
    }
    return new DesktopAngelSession(
      createRuntimeOptions("custom", {
        args: agent.args,
        auth: {
          autoAuthenticate: agent.autoAuthenticate,
          needAuth: agent.needAuth,
        },
        command: agent.command,
        environment: agent.environment,
        clientName: "angel-engine",
        clientTitle: "Angel Engine",
        processLabel: agent.label,
      }),
    );
  }

  return new DesktopAngelSession(
    createRuntimeOptions(runtime ?? null, {
      clientName: "angel-engine",
      clientTitle: "Angel Engine",
    }),
  );
}

function chatAttachmentsToClientInput(
  attachments: ChatAttachmentInput[],
): NonNullable<SendTextRequest["input"]> {
  return attachments.map((attachment): ClientInput => {
    if (attachment.type === "fileMention") {
      const localPath = attachment.path;
      return {
        mimeType: attachment.mimeType ?? null,
        name: is.nonEmptyString(attachment.name)
          ? attachment.name
          : path.basename(localPath),
        path: localPath,
        type: ClientInputType.FileMention,
      };
    }

    if (attachment.type === "image") {
      return {
        data: attachment.data,
        mimeType: attachment.mimeType,
        name: attachment.name ?? null,
        type: ClientInputType.Image,
      };
    }

    const uri = attachmentUri(attachment);
    if (isTextLikeMimeType(attachment.mimeType)) {
      return {
        mimeType: attachment.mimeType,
        text: Buffer.from(attachment.data, "base64").toString("utf8"),
        type: ClientInputType.EmbeddedTextResource,
        uri,
      };
    }

    return {
      data: attachment.data,
      mimeType: attachment.mimeType,
      name: attachment.name ?? null,
      type: ClientInputType.EmbeddedBlobResource,
      uri,
    };
  });
}

function attachmentUri(attachment: ChatAttachmentInput) {
  const name = is.nonEmptyString(attachment.name)
    ? attachment.name
    : "attachment";
  return `attachment:///${encodeURIComponent(name)}`;
}

async function prepareChatForSend(input: ChatSendInput): Promise<{
  chat: Chat;
  isNewChat: boolean;
  session: DesktopChatSession;
}> {
  if (is.nonEmptyString(input.chatId)) {
    const chat = requireChat(input.chatId);
    return { chat, isNewChat: false, session: await getChatSession(chat) };
  }

  const prewarm = is.nonEmptyString(input.prewarmId)
    ? takeChatPrewarm(input.prewarmId, input)
    : undefined;
  if (prewarm) {
    const createdChat = createChat({
      cwd: prewarm.cwd,
      projectId: prewarm.input.projectId,
      runtime: prewarm.input.runtime,
    });
    chatSessions.set(createdChat.id, prewarm.session);
    const chat = persistRemoteThreadId(createdChat, prewarm.snapshot);
    return { chat, isNewChat: true, session: prewarm.session };
  }

  const chat = createChat({
    cwd: await cwdForNewChat(input),
    projectId: input.projectId,
    runtime: input.runtime,
  });
  return { chat, isNewChat: true, session: await getChatSession(chat) };
}

function persistRemoteThreadId(chat: Chat, snapshot: ConversationSnapshot) {
  if (
    snapshot.remoteKind !== "known" ||
    !is.nonEmptyString(snapshot.remoteId) ||
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

  if (!chatPrewarmMatches(prewarm, input)) {
    closeChatPrewarm(prewarm);
    return undefined;
  }

  return prewarm;
}

function isReadyChatPrewarm(prewarm: ChatPrewarm): prewarm is ReadyChatPrewarm {
  return Boolean(prewarm.config && prewarm.snapshot);
}

async function createChatPrewarm(
  input: ChatPrewarmInput,
  key: string,
): Promise<ChatPrewarm> {
  const session = await createChatSession(input.runtime);
  const cwd = cwdForProjectOrStandalone(input.projectId);
  const prewarm: ChatPrewarm = {
    closed: false,
    createdAt: Date.now(),
    cwd,
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
      prewarm.config = runtimeConfigFromConversationSnapshot(snapshot);
    })
    .catch((error: unknown) => {
      closeChatPrewarm(prewarm);
      throw error;
    });

  return prewarm;
}

function chatPrewarmMatches(prewarm: ChatPrewarm, sendInput: ChatSendInput) {
  const prewarmInput = prewarm.input;
  return (
    prewarm.cwd === cwdForProjectOrStandalone(sendInput.projectId) &&
    (prewarmInput.creationLocation ?? "project") ===
      (sendInput.creationLocation ?? "project") &&
    (prewarmInput.projectId ?? null) === (sendInput.projectId ?? null) &&
    (prewarmInput.runtime ?? undefined) === (sendInput.runtime ?? undefined)
  );
}

function chatPrewarmKey(input: ChatPrewarmInput) {
  return JSON.stringify([
    input.runtime ?? null,
    input.projectId ?? null,
    input.creationLocation ?? "project",
    cwdForProjectOrStandalone(input.projectId),
  ]);
}

function cwdForChat(chat: Chat, projectId?: string | null): string {
  return (
    chat.cwd ??
    cwdForProjectId(projectId ?? chat.projectId) ??
    standaloneChatCwd()
  );
}

async function cwdForNewChat(input: ChatSendInput) {
  if (input.creationLocation === "worktree") {
    if (!is.nonEmptyString(input.projectId)) {
      throw new Error("Project is required to create a git worktree.");
    }
    return (await createProjectWorktree({ projectId: input.projectId })).cwd;
  }

  return cwdForProjectOrStandalone(input.projectId);
}

function cwdForProjectOrStandalone(projectId: string | null | undefined) {
  return cwdForProjectId(projectId) ?? standaloneChatCwd();
}

function cwdForProjectId(projectId: string | null | undefined) {
  if (!is.nonEmptyString(projectId)) return undefined;
  const project = getProject(projectId);
  if (!project) {
    throw new Error(`Project path not found for project id: ${projectId}`);
  }
  return project.path;
}

function standaloneChatCwd() {
  return app.getPath("home");
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
  input: NonNullable<SendTextRequest["input"]>;
  onEvent?: (event: TurnRunEvent) => void;
  onResolveElicitation?: (
    handler: (
      elicitationId: string,
      response: ChatElicitationResponse,
    ) => Promise<void>,
  ) => void;
  signal?: AbortSignal;
};
interface PendingElicitation {
  promise: Promise<TurnRunEvent[]>;
  reject: (error: Error) => void;
  resolve: (events?: TurnRunEvent[]) => void;
}

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

  async hydrate(request: HydrateRequest): Promise<ConversationSnapshot> {
    return this.enqueue(async () => this.session.hydrate(request));
  }

  async inspect(cwd: string | InspectRequest): Promise<ConversationSnapshot> {
    const request: InspectRequest = typeof cwd === "string" ? { cwd } : cwd;
    return this.enqueue(async () => this.session.inspect(request));
  }

  async setMode(request: SetModeRequest): Promise<ConversationSnapshot> {
    return this.enqueue(async () => this.session.setMode(request));
  }

  async setPermissionMode(
    request: SetPermissionModeRequest,
  ): Promise<ConversationSnapshot> {
    return this.enqueue(async () => this.session.setPermissionMode(request));
  }

  async sendText(request: DesktopSendTextRequest): Promise<TurnRunResult> {
    return this.enqueue(async () => this.sendTextNow(request));
  }

  private async sendTextNow(
    request: DesktopSendTextRequest,
  ): Promise<TurnRunResult> {
    const text = request.text;
    const input = request.input;
    if (!text && input.length === 0) {
      throw new Error("Text or input is required.");
    }

    throwIfAborted(request.signal);
    request.onResolveElicitation?.(async (elicitationId, response) =>
      this.resolveElicitationNow(elicitationId, response),
    );

    try {
      let events = await this.session.startTextTurn({
        cwd: request.cwd,
        mode: request.mode,
        model: request.model,
        permissionMode: request.permissionMode,
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

        events = await this.session.nextTurnEvents(50);
        if (events.length === 0) {
          await yieldToEventLoop();
        }
      }
    } catch (error) {
      if (request.signal?.aborted) {
        await this.cancelNativeTurn().catch((): undefined => undefined);
        throwIfAborted(request.signal);
      }
      throw error;
    }
  }

  private async dispatchEvents(
    events: TurnRunEvent[],
    request: DesktopSendTextRequest,
  ): Promise<TurnRunResult | undefined> {
    for (const event of events) {
      request.onEvent?.(event);

      const openElicitationId = openElicitationEventId(event);
      if (openElicitationId !== undefined) {
        const followup = await this.waitForElicitation(
          openElicitationId,
          request.signal,
        );
        const result = await this.dispatchEvents(followup, request);
        if (result) return result;
        continue;
      }

      const actionElicitationId = pendingActionElicitationId(event);
      if (actionElicitationId !== undefined) {
        const followup = await this.waitForElicitation(
          actionElicitationId,
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

  private async enqueue<T>(action: () => Promise<T>): Promise<T> {
    const run = this.operationQueue.then(action);
    this.operationQueue = run.then(
      (): undefined => undefined,
      (): undefined => undefined,
    );
    return run;
  }

  private async waitForElicitation(
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
      const events = await this.session.resolveElicitation(
        elicitationId,
        clientElicitationResponse(response),
      );
      pending.resolve(events);
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

function pendingActionElicitationId(event: TurnRunEvent) {
  const action = turnRunEventAction(event);
  if (action?.phase !== ActionPhase.AwaitingDecision) {
    return undefined;
  }

  if (action.elicitationId !== undefined && action.elicitationId.length > 0) {
    return action.elicitationId;
  }
  if (action.id.length > 0) {
    return action.id;
  }
  return undefined;
}

function openElicitationEventId(event: TurnRunEvent) {
  if (event.type !== TurnRunEventType.Elicitation) {
    return undefined;
  }
  const action = turnRunEventAction(event);
  if (
    action?.kind !== "elicitation" ||
    action.phase !== ActionPhase.AwaitingDecision
  ) {
    return undefined;
  }
  return action.elicitationId ?? action.id;
}

function turnRunEventAction(event: TurnRunEvent) {
  return event.messagePart?.type === "tool-call"
    ? event.messagePart.action
    : undefined;
}

async function yieldToEventLoop() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function clientElicitationResponse(
  response: ChatElicitationResponse,
): ElicitationResponse {
  switch (response.type) {
    case "allow":
      return { type: ElicitationResponseType.Allow };
    case "allowForSession":
      return { type: ElicitationResponseType.AllowForSession };
    case "deny":
      return { type: ElicitationResponseType.Deny };
    case "cancel":
      return { type: ElicitationResponseType.Cancel };
    case "answers":
      return {
        answers: response.answers,
        type: ElicitationResponseType.Answers,
      };
    case "dynamicToolResult":
      return {
        success: response.success,
        type: ElicitationResponseType.DynamicToolResult,
      };
    case "externalComplete":
      return { type: ElicitationResponseType.ExternalComplete };
    case "raw":
      return {
        type: ElicitationResponseType.Raw,
        value: response.value,
      };
  }
}
