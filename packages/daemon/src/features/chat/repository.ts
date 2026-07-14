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
import {
  isAgentRuntime,
  isCustomAgentRuntime,
} from "@angel-engine/daemon-api/agents";
import { getDatabase } from "../../db/client";
import { chats } from "../../db/schema";
import { getCustomAgent } from "../agents/repository";

const DEFAULT_CHAT_TITLE = "New chat";

type CreateChatRecordInput = ChatCreateInput & {
  cwd: string;
};

export async function listChats(): Promise<Chat[]> {
  const database = await getDatabase();
  return database
    .select()
    .from(chats)
    .where(eq(chats.archived, false))
    .orderBy(desc(chats.updatedAt))
    .all();
}

export async function listArchivedChats(): Promise<Chat[]> {
  const database = await getDatabase();
  return database
    .select()
    .from(chats)
    .where(eq(chats.archived, true))
    .orderBy(desc(chats.updatedAt))
    .all();
}

export async function getChat(id: string): Promise<Chat | null> {
  const database = await getDatabase();
  const chat = await database
    .select()
    .from(chats)
    .where(eq(chats.id, requireChatId(id)))
    .limit(1)
    .get();

  return chat ?? null;
}

export async function createChat(input: CreateChatRecordInput): Promise<Chat> {
  const now = new Date().toISOString();
  const database = await getDatabase();
  const chat = await database
    .insert(chats)
    .values({
      createdAt: now,
      cwd: normalizeOptionalDirectory(input.cwd),
      id: randomUUID(),
      projectId: normalizeOptionalString(input.projectId),
      remoteThreadId: null,
      runtime: await normalizeChatRuntime(input.runtime),
      title: normalizeTitle(input.title),
      updatedAt: now,
      archived: false,
      pinned: false,
    })
    .returning()
    .get();

  return chat;
}

export async function deleteChat(id: string): Promise<Chat> {
  const chat = await requireChat(id);

  const database = await getDatabase();
  await database.delete(chats).where(eq(chats.id, chat.id)).run();

  return chat;
}

export async function deleteAllChats(): Promise<number> {
  const database = await getDatabase();
  const existingChats = await database.select().from(chats).all();
  await database.delete(chats).run();
  return existingChats.length;
}

export function archiveChat(id: string): Promise<Chat> {
  return updateChat(id, { archived: true });
}

export async function restoreArchivedChats(ids: string[]): Promise<Chat[]> {
  const restoredChats: Chat[] = [];
  for (const id of uniqueChatIds(ids)) {
    await requireArchivedChat(id);
    restoredChats.push(await updateChat(id, { archived: false }));
  }
  return restoredChats;
}

export async function deleteArchivedChats(ids: string[]): Promise<Chat[]> {
  const archivedChats = await Promise.all(
    uniqueChatIds(ids).map((id) => requireArchivedChat(id)),
  );

  const database = await getDatabase();
  for (const chat of archivedChats) {
    await database.delete(chats).where(eq(chats.id, chat.id)).run();
  }

  return archivedChats;
}

export function setChatPinned(id: string, pinned: boolean): Promise<Chat> {
  return updateChat(id, { pinned });
}

export function touchChat(id: string): Promise<Chat> {
  return updateChat(id, { updatedAt: new Date().toISOString() });
}

export function setChatRemoteThreadId(
  id: string,
  remoteThreadId: string | null,
): Promise<Chat> {
  return updateChat(id, {
    remoteThreadId: normalizeOptionalString(remoteThreadId),
    updatedAt: new Date().toISOString(),
  });
}

export async function setChatRuntime(
  id: string,
  runtime: string,
): Promise<Chat> {
  const chat = await requireChat(id);
  if (is.nonEmptyString(chat.remoteThreadId)) {
    throw new Error(
      "Chat runtime cannot be changed after the chat has started.",
    );
  }

  return updateChat(id, {
    runtime: await normalizeChatRuntime(runtime),
    updatedAt: new Date().toISOString(),
  });
}

export async function renameChatFromPrompt(
  id: string,
  prompt: string,
): Promise<Chat> {
  const chat = await requireChat(id);
  if (chat.title !== DEFAULT_CHAT_TITLE) return chat;

  return updateChat(id, {
    title: titleFromPrompt(prompt),
    updatedAt: new Date().toISOString(),
  });
}

export function renameChat(id: string, title: string): Promise<Chat> {
  return updateChat(id, {
    title: normalizeManualTitle(title),
    updatedAt: new Date().toISOString(),
  });
}

export async function requireChat(id: string): Promise<Chat> {
  const chat = await getChat(id);
  if (is.falsy(chat)) {
    throw new Error("Chat not found.");
  }
  return chat;
}

export async function requireArchivedChat(id: string): Promise<Chat> {
  const chat = await requireChat(id);
  if (!chat.archived) {
    throw new Error("Chat is not archived.");
  }
  return chat;
}

async function updateChat(
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
): Promise<Chat> {
  const database = await getDatabase();
  const chat = await database
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

type CustomAgentLookup = (
  runtime: string,
) => CustomAgent | null | Promise<CustomAgent | null>;

export async function normalizeChatRuntime(
  runtime: string | undefined,
  customAgentLookup: CustomAgentLookup = getCustomAgent,
): Promise<AgentRuntime> {
  const candidate = is.nonEmptyString(runtime)
    ? runtime
    : process.env.ANGEL_ENGINE_RUNTIME;

  if (!is.nonEmptyString(candidate)) {
    throw new Error("Chat runtime is required.");
  }

  if (!isAgentRuntime(candidate)) {
    throw new Error("Unknown chat runtime.");
  }

  if (isCustomAgentRuntime(candidate)) {
    const customAgent = await customAgentLookup(candidate);
    if (customAgent === null) {
      throw new Error("Unknown chat runtime.");
    }
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
