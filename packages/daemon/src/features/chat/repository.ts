import type {
  AgentRuntime,
  CustomAgent,
} from "@angel-engine/daemon-api/agents";
import type { Chat, ChatCreateInput } from "@angel-engine/daemon-api/chat";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import is from "@sindresorhus/is";
import { desc, eq } from "drizzle-orm";
import { Effect } from "effect";
import {
  isAgentRuntime,
  isCustomAgentRuntime,
} from "@angel-engine/daemon-api/agents";
import { chats } from "../../db/schema";
import { type Db, withDatabase } from "../../platform/db";
import { DaemonError } from "../../platform/errors";
import { getCustomAgent } from "../agents/repository";

const DEFAULT_CHAT_TITLE = "New chat";

type CreateChatRecordInput = ChatCreateInput & {
  cwd: string;
};

export function listChats() {
  return withDatabase((database) =>
    database
      .select()
      .from(chats)
      .where(eq(chats.archived, false))
      .orderBy(desc(chats.updatedAt))
      .all(),
  );
}

export function listArchivedChats() {
  return withDatabase((database) =>
    database
      .select()
      .from(chats)
      .where(eq(chats.archived, true))
      .orderBy(desc(chats.updatedAt))
      .all(),
  );
}

export function getChat(
  id: string,
): Effect.Effect<Chat | null, DaemonError, Db> {
  return Effect.gen(function* () {
    const chatId = yield* requireChatId(id);
    const chat = yield* withDatabase((database) =>
      database.select().from(chats).where(eq(chats.id, chatId)).limit(1).get(),
    );
    return chat ?? null;
  });
}

export function createChat(
  input: CreateChatRecordInput,
): Effect.Effect<Chat, DaemonError, Db> {
  return Effect.gen(function* () {
    const now = new Date().toISOString();
    const cwd = yield* normalizeOptionalDirectory(input.cwd);
    const runtime = yield* normalizeChatRuntime(input.runtime);
    return yield* withDatabase((database) =>
      database
        .insert(chats)
        .values({
          createdAt: now,
          cwd,
          id: randomUUID(),
          projectId: normalizeOptionalString(input.projectId),
          remoteThreadId: null,
          runtime,
          title: normalizeTitle(input.title),
          updatedAt: now,
          archived: false,
          pinned: false,
        })
        .returning()
        .get(),
    );
  });
}

export function deleteChat(id: string): Effect.Effect<Chat, DaemonError, Db> {
  return Effect.gen(function* () {
    const chat = yield* requireChat(id);
    yield* withDatabase((database) =>
      database.delete(chats).where(eq(chats.id, chat.id)).run(),
    );
    return chat;
  });
}

export function deleteAllChats(): Effect.Effect<number, DaemonError, Db> {
  return Effect.gen(function* () {
    const existingChats = yield* withDatabase((database) =>
      database.select().from(chats).all(),
    );
    yield* withDatabase((database) => database.delete(chats).run());
    return existingChats.length;
  });
}

export function archiveChat(id: string) {
  return updateChat(id, { archived: true });
}

export function restoreArchivedChats(
  ids: string[],
): Effect.Effect<Chat[], DaemonError, Db> {
  return Effect.gen(function* () {
    const restoredChats: Chat[] = [];
    for (const id of yield* uniqueChatIds(ids)) {
      yield* requireArchivedChat(id);
      restoredChats.push(yield* updateChat(id, { archived: false }));
    }
    return restoredChats;
  });
}

export function deleteArchivedChats(
  ids: string[],
): Effect.Effect<Chat[], DaemonError, Db> {
  return Effect.gen(function* () {
    const chatIds = yield* uniqueChatIds(ids);
    const archivedChats = yield* Effect.all(
      chatIds.map((id) => requireArchivedChat(id)),
    );
    for (const chat of archivedChats) {
      yield* withDatabase((database) =>
        database.delete(chats).where(eq(chats.id, chat.id)).run(),
      );
    }
    return archivedChats;
  });
}

export function setChatPinned(id: string, pinned: boolean) {
  return updateChat(id, { pinned });
}

export function touchChat(id: string) {
  return updateChat(id, { updatedAt: new Date().toISOString() });
}

export function setChatRemoteThreadId(
  id: string,
  remoteThreadId: string | null,
) {
  return updateChat(id, {
    remoteThreadId: normalizeOptionalString(remoteThreadId),
    updatedAt: new Date().toISOString(),
  });
}

export function setChatRuntime(
  id: string,
  runtime: string,
): Effect.Effect<Chat, DaemonError, Db> {
  return Effect.gen(function* () {
    const chat = yield* requireChat(id);
    if (is.nonEmptyString(chat.remoteThreadId)) {
      return yield* Effect.fail(DaemonError.chatRuntimeLocked());
    }

    return yield* updateChat(id, {
      runtime: yield* normalizeChatRuntime(runtime),
      updatedAt: new Date().toISOString(),
    });
  });
}

export function renameChatFromPrompt(
  id: string,
  prompt: string,
): Effect.Effect<Chat, DaemonError, Db> {
  return Effect.gen(function* () {
    const chat = yield* requireChat(id);
    if (chat.title !== DEFAULT_CHAT_TITLE) return chat;

    return yield* updateChat(id, {
      title: titleFromPrompt(prompt),
      updatedAt: new Date().toISOString(),
    });
  });
}

export function renameChat(
  id: string,
  title: string,
): Effect.Effect<Chat, DaemonError, Db> {
  return Effect.gen(function* () {
    return yield* updateChat(id, {
      title: yield* normalizeManualTitle(title),
      updatedAt: new Date().toISOString(),
    });
  });
}

export function requireChat(id: string): Effect.Effect<Chat, DaemonError, Db> {
  return Effect.gen(function* () {
    const chat = yield* getChat(id);
    if (is.falsy(chat)) {
      return yield* Effect.fail(DaemonError.chatNotFound());
    }
    return chat;
  });
}

export function requireArchivedChat(
  id: string,
): Effect.Effect<Chat, DaemonError, Db> {
  return Effect.gen(function* () {
    const chat = yield* requireChat(id);
    if (!chat.archived) {
      return yield* Effect.fail(DaemonError.chatNotArchived());
    }
    return chat;
  });
}

function updateChat(
  id: string,
  patch: Partial<
    Pick<
      Chat,
      | "archived"
      | "pinned"
      | "remoteThreadId"
      | "runtime"
      | "title"
      | "updatedAt"
    >
  >,
): Effect.Effect<Chat, DaemonError, Db> {
  return Effect.gen(function* () {
    const chatId = yield* requireChatId(id);
    const chat = yield* withDatabase((database) =>
      database
        .update(chats)
        .set(patch)
        .where(eq(chats.id, chatId))
        .returning()
        .get(),
    );

    if (is.falsy(chat)) {
      return yield* Effect.fail(DaemonError.chatNotFound());
    }

    return chat;
  });
}

function requireChatId(id: string): Effect.Effect<string, DaemonError> {
  if (!is.nonEmptyString(id)) {
    return Effect.fail(DaemonError.chatIdRequired());
  }
  return Effect.succeed(id);
}

function uniqueChatIds(ids: string[]): Effect.Effect<string[], DaemonError> {
  return Effect.gen(function* () {
    const uniqueIds = [
      ...new Set(yield* Effect.all(ids.map((id) => requireChatId(id)))),
    ];
    if (uniqueIds.length === 0) {
      return yield* Effect.fail(DaemonError.chatIdsRequired());
    }
    return uniqueIds;
  });
}

type CustomAgentLookup = (
  runtime: string,
) => Effect.Effect<CustomAgent | null, DaemonError, Db>;

export function normalizeChatRuntime(
  runtime: string | undefined,
  customAgentLookup: CustomAgentLookup = getCustomAgent,
): Effect.Effect<AgentRuntime, DaemonError, Db> {
  return Effect.gen(function* () {
    const candidate = is.nonEmptyString(runtime)
      ? runtime
      : process.env.ANGEL_ENGINE_RUNTIME;

    if (!is.nonEmptyString(candidate)) {
      return yield* Effect.fail(
        DaemonError.chatRuntimeUnknown("Chat runtime is required."),
      );
    }

    if (!isAgentRuntime(candidate)) {
      return yield* Effect.fail(DaemonError.chatRuntimeUnknown());
    }

    if (isCustomAgentRuntime(candidate)) {
      const customAgent = yield* customAgentLookup(candidate);
      if (customAgent === null) {
        return yield* Effect.fail(DaemonError.chatRuntimeUnknown());
      }
    }

    return candidate;
  });
}

function normalizeTitle(title: string | undefined) {
  return is.nonEmptyString(title) ? title : DEFAULT_CHAT_TITLE;
}

function normalizeManualTitle(
  title: string,
): Effect.Effect<string, DaemonError> {
  const normalizedTitle = title.replace(/\s+/g, " ").trim();
  if (!is.nonEmptyString(normalizedTitle)) {
    return Effect.fail(DaemonError.chatTitleRequired());
  }
  return Effect.succeed(normalizedTitle);
}

function normalizeOptionalString(value: string | null | undefined) {
  if (!is.nonEmptyString(value)) return null;
  return value;
}

function normalizeOptionalDirectory(
  value: string | null | undefined,
): Effect.Effect<string | null, DaemonError> {
  return Effect.gen(function* () {
    const dirPath = normalizeOptionalString(value);
    if (!is.nonEmptyString(dirPath)) return null;

    const resolvedPath = path.resolve(dirPath);
    if (!fs.existsSync(resolvedPath)) {
      return yield* Effect.fail(
        DaemonError.chatCwdInvalid("Chat cwd does not exist."),
      );
    }

    if (!fs.statSync(resolvedPath).isDirectory()) {
      return yield* Effect.fail(
        DaemonError.chatCwdInvalid("Chat cwd must be a directory."),
      );
    }

    return resolvedPath;
  });
}

function titleFromPrompt(prompt: string) {
  const title = prompt.replace(/\s+/g, " ");
  if (!title) return DEFAULT_CHAT_TITLE;
  return title.length > 48 ? `${title.slice(0, 47)}...` : title;
}
