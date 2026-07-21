import type { ConversationSnapshot } from "@angel-engine/client-napi";
import type {
  Chat,
  ChatCreateInput,
  ChatPrewarmInput,
  ChatRuntimeConfig,
  ChatRuntimeConfigInput,
  ChatSendInput,
  ChatSendResult,
  ChatSetModeInput,
  ChatSetPermissionModeInput,
  ChatSetRuntimeInput,
  ChatStreamEvent,
} from "@angel-engine/daemon-api/chat";
import type { Db } from "../../platform/db";
import type { DesktopChatSession } from "./chat-session-factory";
import type { ChatStreamControls } from "./runtime";

import {
  conversationMessages,
  projectTurnRunEvent,
  projectTurnRunResult,
  runtimeConfigFromConversationSnapshot,
} from "@angel-engine/js-client/projection";
import is from "@sindresorhus/is";
import { Cause, Effect, Exit, Runtime } from "effect";
import { normalizeChatAttachmentsInput } from "@angel-engine/daemon-api/chat";
import { ProcessRegistryService } from "../../processes";
import { DaemonError } from "../../platform/errors";
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
import { ChatProcessRegistry } from "./process-registry";
import {
  createChat,
  renameChatFromPrompt,
  requireChat,
  setChatRemoteThreadId,
  setChatRuntime as setChatRuntimeRecord,
  touchChat,
} from "./repository";

export { cwdForNewChat };

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

/**
 * The chat engine: owns live sessions, dedup of session creation, and the
 * prewarm pool. Session state lives in the layer scope; callback-world pieces
 * (native session events, PID subscriptions) bridge back through the captured
 * runtime.
 */
export class ChatEngine extends Effect.Service<ChatEngine>()(
  "daemon/ChatEngine",
  {
    scoped: Effect.gen(function* () {
      const processRegistryService = yield* ProcessRegistryService;
      const runtime = yield* Effect.runtime<Db>();

      const chatSessions = new Map<string, DesktopChatSession>();
      const chatSessionCreations = new Map<
        string,
        Promise<DesktopChatSession>
      >();
      const chatPrewarms = new Map<string, ChatPrewarm>();

      /** Bridge: run a daemon effect from promise/callback code, rethrowing the typed failure. */
      const toPromise = async <A>(
        effect: Effect.Effect<A, DaemonError, Db>,
      ): Promise<A> => {
        const exit = await Runtime.runPromiseExit(runtime)(effect);
        if (Exit.isSuccess(exit)) return exit.value;
        throw Cause.squash(exit.cause);
      };

      const chatProcessRegistry = new ChatProcessRegistry({
        lookupChat: (chatId) => toPromise(requireChat(chatId)),
        replaceEntries: (entries) =>
          Runtime.runPromise(runtime)(processRegistryService.replace(entries)),
        sessions: chatSessions,
      });
      const refreshProcessRegistry = () => {
        void chatProcessRegistry.refresh().catch(() => undefined);
      };

      /** Wraps a native-session promise, preserving typed daemon failures. */
      const trySession = <A>(run: () => Promise<A>) =>
        Effect.tryPromise({
          catch: (cause) =>
            cause instanceof DaemonError
              ? cause
              : DaemonError.sessionFailed(cause),
          try: run,
        });

      const getChatSession = (chat: Chat) =>
        Effect.map(
          trySession(() =>
            getOrCreateChatSession(
              chat.id,
              chatSessions,
              chatSessionCreations,
              () => toPromise(createChatSession(chat.runtime)),
            ),
          ),
          (session) => {
            refreshProcessRegistry();
            return session;
          },
        );

      const persistRemoteThreadId = (
        chat: Chat,
        snapshot: ConversationSnapshot,
      ) =>
        Effect.gen(function* () {
          if (
            snapshot.remoteKind !== "known" ||
            !is.nonEmptyString(snapshot.remoteId) ||
            snapshot.remoteId === chat.remoteThreadId
          ) {
            return chat;
          }
          return yield* setChatRemoteThreadId(chat.id, snapshot.remoteId);
        });

      const closeChatPrewarm = (prewarm: ChatPrewarm) => {
        if (prewarm.closed) return;

        prewarm.closed = true;
        chatPrewarms.delete(prewarm.key);
        prewarm.session.close();
      };

      const closeChatPrewarms = () => {
        for (const prewarm of chatPrewarms.values()) {
          closeChatPrewarm(prewarm);
        }
        chatPrewarms.clear();
      };

      const trimChatPrewarms = () => {
        const prewarms = Array.from(chatPrewarms.values()).sort(
          (left, right) => left.createdAt - right.createdAt,
        );
        while (prewarms.length > MAX_PREWARM_SESSIONS) {
          const prewarm = prewarms.shift();
          if (!prewarm) return;
          closeChatPrewarm(prewarm);
        }
      };

      const chatPrewarmKey = (input: ChatPrewarmInput) =>
        Effect.map(cwdForProjectOrStandalone(input.projectId), (cwd) =>
          JSON.stringify([
            input.runtime ?? null,
            input.projectId ?? null,
            input.creationLocation ?? "project",
            cwd,
          ]),
        );

      const createChatPrewarm = (input: ChatPrewarmInput, key: string) =>
        Effect.gen(function* () {
          const session = yield* createChatSession(input.runtime);
          const cwd = yield* cwdForProjectOrStandalone(input.projectId);
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
        });

      const chatPrewarmResult = (prewarm: ChatPrewarm) => {
        if (!isReadyChatPrewarm(prewarm)) {
          return Effect.fail(
            DaemonError.chatPrewarmFailed(
              "Chat prewarm did not produce runtime config.",
            ),
          );
        }

        return Effect.succeed({
          config: prewarm.config,
          prewarmId: prewarm.key,
        });
      };

      const chatPrewarmMatches = (
        prewarm: ChatPrewarm,
        sendInput: ChatSendInput,
      ) =>
        Effect.gen(function* () {
          if (is.nonEmptyString(sendInput.cwd)) return false;

          const prewarmInput = prewarm.input;
          const sendCwd = yield* cwdForProjectOrStandalone(sendInput.projectId);
          return (
            prewarm.cwd === sendCwd &&
            (prewarmInput.creationLocation ?? "project") ===
              (sendInput.creationLocation ?? "project") &&
            (prewarmInput.projectId ?? null) ===
              (sendInput.projectId ?? null) &&
            (prewarmInput.runtime ?? undefined) ===
              (sendInput.runtime ?? undefined)
          );
        });

      const takeChatPrewarm = (prewarmId: string, input: ChatSendInput) =>
        Effect.gen(function* () {
          const prewarm = chatPrewarms.get(prewarmId);
          if (!prewarm || !isReadyChatPrewarm(prewarm)) return undefined;

          chatPrewarms.delete(prewarm.key);

          const matches = yield* chatPrewarmMatches(prewarm, input);
          if (!matches) {
            closeChatPrewarm(prewarm);
            return undefined;
          }

          return prewarm;
        });

      const prepareChatForSend = (input: ChatSendInput) =>
        Effect.gen(function* () {
          if (is.nonEmptyString(input.chatId)) {
            const chat = yield* requireChat(input.chatId);
            return {
              chat,
              isNewChat: false,
              session: yield* getChatSession(chat),
            };
          }

          const prewarm = is.nonEmptyString(input.prewarmId)
            ? yield* takeChatPrewarm(input.prewarmId, input)
            : undefined;
          if (prewarm) {
            const createdChat = yield* createChat({
              cwd: prewarm.cwd,
              projectId: prewarm.input.projectId,
              runtime: prewarm.input.runtime,
            });
            chatSessions.set(createdChat.id, prewarm.session);
            refreshProcessRegistry();
            const chat = yield* persistRemoteThreadId(
              createdChat,
              prewarm.snapshot,
            );
            return { chat, isNewChat: true, session: prewarm.session };
          }

          const chat = yield* createChat({
            cwd: yield* cwdForNewChat(input),
            projectId: input.projectId,
            runtime: input.runtime,
          });
          return {
            chat,
            isNewChat: true,
            session: yield* getChatSession(chat),
          };
        });

      const streamChat = (
        input: ChatSendInput,
        onEvent?: (event: ChatStreamEvent) => void,
        abortSignal?: AbortSignal,
        controls?: ChatStreamControls,
      ): Effect.Effect<ChatSendResult, DaemonError, Db> =>
        Effect.gen(function* () {
          const attachments = normalizeChatAttachmentsInput(input.attachments);
          if (!input.text && attachments.length === 0) {
            return yield* Effect.fail(DaemonError.chatInputRequired());
          }

          const preparedChat = yield* prepareChatForSend(input);
          const { chat, isNewChat, session } = preparedChat;
          if (isNewChat) {
            onEvent?.({ chat, type: "chat" });
          }

          const cwd = yield* cwdForChat(chat, input.projectId);
          const result = yield* trySession(() =>
            session.sendText({
              cwd,
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
            }),
          );

          if (is.nonEmptyString(input.text)) {
            yield* renameChatFromPrompt(chat.id, input.text);
            refreshProcessRegistry();
          }
          const projected = projectTurnRunResult(result);
          const finalChat = yield* is.nonEmptyString(projected.remoteThreadId)
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
        });

      const closeAllSessions = () => {
        for (const session of chatSessions.values()) {
          session.close();
        }
        chatSessions.clear();
        refreshProcessRegistry();
        closeChatPrewarms();
      };
      yield* Effect.addFinalizer(() => Effect.sync(closeAllSessions));

      const closeChatSession = (chatId?: string) =>
        Effect.sync(() => {
          if (is.nonEmptyString(chatId)) {
            chatSessions.get(chatId)?.close();
            chatSessions.delete(chatId);
            refreshProcessRegistry();
            return;
          }

          closeAllSessions();
        });

      return {
        closeChatSession,
        createChatFromInput: (input: ChatCreateInput) =>
          Effect.gen(function* () {
            if (input.creationLocation === "worktree") {
              return yield* Effect.fail(
                DaemonError.chatWorktreeCreationForbidden(
                  "Worktree chats must be created by sending a message.",
                ),
              );
            }

            return yield* createChat({
              ...input,
              cwd: yield* cwdForProjectOrStandalone(input.projectId),
            });
          }),
        inspectChatRuntimeConfig: (input: ChatRuntimeConfigInput) =>
          Effect.gen(function* () {
            const session = yield* createChatSession(input.runtime);
            return yield* trySession(async () => {
              try {
                return runtimeConfigFromConversationSnapshot(
                  await session.inspect(input.cwd ?? standaloneChatCwd()),
                );
              } finally {
                session.close();
              }
            });
          }),
        loadChatSession: (chatId: string) =>
          Effect.gen(function* () {
            const chat = yield* requireChat(chatId);
            const session = chatSessions.get(chat.id);
            const cwd = yield* cwdForChat(chat);

            if (
              !is.nonEmptyString(chat.remoteThreadId) &&
              !session?.hasConversation()
            ) {
              return { chat, messages: [] };
            }

            const chatSession = yield* getChatSession(chat);
            const snapshot = yield* trySession(() =>
              chatSession.hydrate({
                cwd,
                remoteId: chat.remoteThreadId ?? undefined,
              }),
            );
            const updatedChat = yield* persistRemoteThreadId(chat, snapshot);
            const messages = conversationMessages(snapshot);
            return {
              chat: updatedChat,
              config: runtimeConfigFromConversationSnapshot(snapshot),
              messages,
            };
          }),
        prewarmChat: (input: ChatPrewarmInput) =>
          Effect.gen(function* () {
            if (input.creationLocation === "worktree") {
              return yield* Effect.fail(
                DaemonError.chatWorktreeCreationForbidden(
                  "Worktree chats cannot be prewarmed.",
                ),
              );
            }

            const key = yield* chatPrewarmKey(input);
            const existing = chatPrewarms.get(key);
            if (existing) {
              yield* trySession(() => existing.promise);
              return yield* chatPrewarmResult(existing);
            }

            const prewarm = yield* createChatPrewarm(input, key);
            chatPrewarms.set(key, prewarm);
            trimChatPrewarms();
            yield* trySession(() => prewarm.promise);
            return yield* chatPrewarmResult(prewarm);
          }),
        sendChat: (input: ChatSendInput) => streamChat(input),
        setChatMode: (input: ChatSetModeInput) =>
          Effect.gen(function* () {
            const chat = yield* requireChat(input.chatId);
            const session = yield* getChatSession(chat);
            const cwd = yield* cwdForChat(chat);
            const snapshot = yield* trySession(() =>
              session.setMode({
                cwd,
                mode: input.mode,
                remoteId: chat.remoteThreadId ?? undefined,
              }),
            );
            const updatedChat = yield* persistRemoteThreadId(chat, snapshot);
            return {
              chat: updatedChat,
              config: runtimeConfigFromConversationSnapshot(snapshot),
            };
          }),
        setChatPermissionMode: (input: ChatSetPermissionModeInput) =>
          Effect.gen(function* () {
            const chat = yield* requireChat(input.chatId);
            const session = yield* getChatSession(chat);
            const cwd = yield* cwdForChat(chat);
            const snapshot = yield* trySession(() =>
              session.setPermissionMode({
                cwd,
                mode: input.mode,
                remoteId: chat.remoteThreadId ?? undefined,
              }),
            );
            const updatedChat = yield* persistRemoteThreadId(chat, snapshot);
            return {
              chat: updatedChat,
              config: runtimeConfigFromConversationSnapshot(snapshot),
            };
          }),
        setChatRuntime: (input: ChatSetRuntimeInput) =>
          Effect.gen(function* () {
            const chat = yield* requireChat(input.chatId);
            const session = chatSessions.get(chat.id);
            if (
              is.nonEmptyString(chat.remoteThreadId) ||
              session?.hasConversation() === true
            ) {
              return yield* Effect.fail(DaemonError.chatRuntimeLocked());
            }

            session?.close();
            chatSessions.delete(chat.id);
            refreshProcessRegistry();
            return yield* setChatRuntimeRecord(chat.id, input.runtime);
          }),
        streamChat,
      };
    }),
  },
) {}

function isReadyChatPrewarm(prewarm: ChatPrewarm): prewarm is ReadyChatPrewarm {
  return Boolean(prewarm.config && prewarm.snapshot);
}
