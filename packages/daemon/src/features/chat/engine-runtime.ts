import type { ConversationSnapshot } from "@angel-engine/client-napi";
import type { ProjectedTurnEvent } from "@angel-engine/js-client/projection";
import type {
  Chat,
  ChatCreateInput,
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
} from "@angel-engine/daemon-api/chat";
import type { DesktopChatSession } from "./chat-session-factory";
import type { ChatRuntime, ChatStreamControls } from "./runtime";
import type { ProcessRegistry } from "../../processes";

import {
  conversationMessages,
  projectTurnRunEvent,
  projectTurnRunResult,
  runtimeConfigFromConversationSnapshot,
} from "@angel-engine/js-client/projection";
import is from "@sindresorhus/is";
import { normalizeChatAttachmentsInput } from "@angel-engine/daemon-api/chat";
import { chatAttachmentsToClientInput } from "./chat-attachments";
import {
  cwdForChat,
  cwdForNewChat,
  cwdForProjectOrStandalone,
  standaloneChatCwd,
} from "./chat-cwd";
import {
  createChatSession,
  getOrCreateChatSession,
} from "./chat-session-factory";
import {
  createChat,
  renameChatFromPrompt,
  requireChat,
  setChatRemoteThreadId,
  setChatRuntime as setChatRuntimeRecord,
  touchChat,
} from "./repository";
import { ChatProcessRegistry } from "./process-registry";

export { cwdForNewChat, getOrCreateChatSession };

type ChatStreamObserver = (
  event: ProjectedTurnEvent | { chat: Chat; type: "chat" },
) => void;

const chatSessions = new Map<string, DesktopChatSession>();
let processRegistry: ChatProcessRegistry;
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

export function createChatRuntime(registry: ProcessRegistry): ChatRuntime {
  processRegistry = new ChatProcessRegistry(chatSessions, registry);
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

  const chatSession = await getChatSession(chat);
  const snapshot = await chatSession.hydrate({
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
  void processRegistry.refresh();
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
    void processRegistry.refresh();
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
    void processRegistry.refresh();
    return;
  }

  for (const session of chatSessions.values()) {
    session.close();
  }
  chatSessions.clear();
  void processRegistry.refresh();
  closeChatPrewarms();
}

async function getChatSession(chat: Chat): Promise<DesktopChatSession> {
  const session = await getOrCreateChatSession(
    chat.id,
    chatSessions,
    chatSessionCreations,
    async () => createChatSession(chat.runtime),
  );
  void processRegistry.refresh();
  return session;
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
    void processRegistry.refresh();
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
    .then(async (snapshot) => {
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
  if (is.nonEmptyString(sendInput.cwd)) return false;

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
