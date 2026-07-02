import type { AgentRuntime, CustomAgent } from "../../../shared/agents";
import type { Chat, ChatCreateInput } from "../../../shared/chat";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import is from "@sindresorhus/is";
import { desc, eq } from "drizzle-orm";
import { isAgentRuntime, isCustomAgentRuntime } from "../../../shared/agents";
import { getDatabase } from "../../db/client";
import { chats } from "../../db/schema";
import { getCustomAgent } from "../agents/repository";

const DEFAULT_CHAT_TITLE = "New chat";

type CreateChatRecordInput = ChatCreateInput & {
  cwd: string;
};

export function listChats(): Chat[] {
  return getDatabase()
    .select()
    .from(chats)
    .where(eq(chats.archived, false))
    .orderBy(desc(chats.updatedAt))
    .all();
}

export function listArchivedChats(): Chat[] {
  return getDatabase()
    .select()
    .from(chats)
    .where(eq(chats.archived, true))
    .orderBy(desc(chats.updatedAt))
    .all();
}

export function getChat(id: string): Chat | null {
  const chat = getDatabase()
    .select()
    .from(chats)
    .where(eq(chats.id, requireChatId(id)))
    .limit(1)
    .get();

  return chat ?? null;
}

export function createChat(input: CreateChatRecordInput): Chat {
  const now = new Date().toISOString();
  const chat = getDatabase()
    .insert(chats)
    .values({
      createdAt: now,
      cwd: normalizeOptionalDirectory(input.cwd),
      id: randomUUID(),
      projectId: normalizeOptionalString(input.projectId),
      remoteThreadId: null,
      runtime: normalizeChatRuntime(input.runtime),
      title: normalizeTitle(input.title),
      updatedAt: now,
      archived: false,
    })
    .returning()
    .get();

  return chat;
}

export function deleteChat(id: string): Chat {
  const chat = requireChat(id);

  getDatabase().delete(chats).where(eq(chats.id, chat.id)).run();

  return chat;
}

export function deleteAllChats(): number {
  const deletedCount = getDatabase().select().from(chats).all().length;
  getDatabase().delete(chats).run();
  return deletedCount;
}

export function archiveChat(id: string): Chat {
  return updateChat(id, { archived: true });
}

export function restoreArchivedChats(ids: string[]): Chat[] {
  return uniqueChatIds(ids).map((id) => {
    requireArchivedChat(id);
    return updateChat(id, { archived: false });
  });
}

export function deleteArchivedChats(ids: string[]): Chat[] {
  const archivedChats = uniqueChatIds(ids).map((id) => requireArchivedChat(id));

  for (const chat of archivedChats) {
    getDatabase().delete(chats).where(eq(chats.id, chat.id)).run();
  }

  return archivedChats;
}

export function touchChat(id: string): Chat {
  return updateChat(id, { updatedAt: new Date().toISOString() });
}

export function setChatRemoteThreadId(
  id: string,
  remoteThreadId: string | null,
): Chat {
  return updateChat(id, {
    remoteThreadId: normalizeOptionalString(remoteThreadId),
    updatedAt: new Date().toISOString(),
  });
}

export function setChatRuntime(id: string, runtime: string): Chat {
  const chat = requireChat(id);
  if (is.nonEmptyString(chat.remoteThreadId)) {
    throw new Error(
      "Chat runtime cannot be changed after the chat has started.",
    );
  }

  return updateChat(id, {
    runtime: normalizeChatRuntime(runtime),
    updatedAt: new Date().toISOString(),
  });
}

export function renameChatFromPrompt(id: string, prompt: string): Chat {
  const chat = requireChat(id);
  if (chat.title !== DEFAULT_CHAT_TITLE) return chat;

  return updateChat(id, {
    title: titleFromPrompt(prompt),
    updatedAt: new Date().toISOString(),
  });
}

export function renameChat(id: string, title: string): Chat {
  return updateChat(id, {
    title: normalizeManualTitle(title),
    updatedAt: new Date().toISOString(),
  });
}

export function requireChat(id: string): Chat {
  const chat = getChat(id);
  if (is.falsy(chat)) {
    throw new Error("Chat not found.");
  }
  return chat;
}

export function requireArchivedChat(id: string): Chat {
  const chat = requireChat(id);
  if (!chat.archived) {
    throw new Error("Chat is not archived.");
  }
  return chat;
}

function updateChat(
  id: string,
  patch: Partial<
    Pick<
      Chat,
      "archived" | "remoteThreadId" | "runtime" | "title" | "updatedAt"
    >
  >,
): Chat {
  const chat = getDatabase()
    .update(chats)
    .set(patch)
    .where(eq(chats.id, requireChatId(id)))
    .returning()
    .get();

  if (is.falsy(chat)) {
    throw new Error("Chat not found.");
  }

  return chat;
}

function requireChatId(id: string) {
  if (!is.nonEmptyString(id)) {
    throw new Error("Chat id is required.");
  }
  return id;
}

function uniqueChatIds(ids: string[]) {
  const uniqueIds = [...new Set(ids.map((id) => requireChatId(id)))];
  if (uniqueIds.length === 0) {
    throw new Error("At least one chat id is required.");
  }
  return uniqueIds;
}

type CustomAgentLookup = (runtime: string) => CustomAgent | null;

export function normalizeChatRuntime(
  runtime: string | undefined,
  customAgentLookup: CustomAgentLookup = getCustomAgent,
): AgentRuntime {
  const candidate = is.nonEmptyString(runtime)
    ? runtime
    : process.env.ANGEL_ENGINE_RUNTIME;

  if (!is.nonEmptyString(candidate)) {
    throw new Error("Chat runtime is required.");
  }

  if (!isAgentRuntime(candidate)) {
    throw new Error("Unknown chat runtime.");
  }

  if (
    isCustomAgentRuntime(candidate) &&
    customAgentLookup(candidate) === null
  ) {
    throw new Error("Unknown chat runtime.");
  }

  return candidate;
}

function normalizeTitle(title: string | undefined) {
  return is.nonEmptyString(title) ? title : DEFAULT_CHAT_TITLE;
}

function normalizeManualTitle(title: string) {
  const normalizedTitle = title.replace(/\s+/g, " ").trim();
  if (!is.nonEmptyString(normalizedTitle)) {
    throw new Error("Chat title is required.");
  }
  return normalizedTitle;
}

function normalizeOptionalString(value: string | null | undefined) {
  if (!is.nonEmptyString(value)) return null;
  return value;
}

function normalizeOptionalDirectory(value: string | null | undefined) {
  const dirPath = normalizeOptionalString(value);
  if (!is.nonEmptyString(dirPath)) return null;

  const resolvedPath = path.resolve(dirPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error("Chat cwd does not exist.");
  }

  if (!fs.statSync(resolvedPath).isDirectory()) {
    throw new Error("Chat cwd must be a directory.");
  }

  return resolvedPath;
}

function titleFromPrompt(prompt: string) {
  const title = prompt.replace(/\s+/g, " ");
  if (!title) return DEFAULT_CHAT_TITLE;
  return title.length > 48 ? `${title.slice(0, 47)}...` : title;
}
