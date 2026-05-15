import type { Chat, ChatCreateInput } from "../../../shared/chat";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { desc, eq } from "drizzle-orm";
import { getDatabase } from "../../db/database";
import { chats } from "../../db/schema";

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
      runtime: normalizeRuntime(input.runtime),
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
  if (chat.remoteThreadId) {
    throw new Error(
      "Chat runtime cannot be changed after the chat has started.",
    );
  }

  return updateChat(id, {
    runtime: normalizeRuntime(runtime),
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
  if (!chat) {
    throw new Error("Chat not found.");
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

  if (!chat) {
    throw new Error("Chat not found.");
  }

  return chat;
}

function requireChatId(id: string) {
  if (!id) {
    throw new Error("Chat id is required.");
  }
  return id;
}

function normalizeRuntime(runtime: string | undefined) {
  return runtime || process.env.ANGEL_ENGINE_RUNTIME || "codex";
}

function normalizeTitle(title: string | undefined) {
  return title || DEFAULT_CHAT_TITLE;
}

function normalizeManualTitle(title: string) {
  const normalizedTitle = title.replace(/\s+/g, " ").trim();
  if (!normalizedTitle) {
    throw new Error("Chat title is required.");
  }
  return normalizedTitle;
}

function normalizeOptionalString(value: string | null | undefined) {
  if (typeof value !== "string" || !value) return null;
  return value;
}

function normalizeOptionalDirectory(value: string | null | undefined) {
  const dirPath = normalizeOptionalString(value);
  if (!dirPath) return null;

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
