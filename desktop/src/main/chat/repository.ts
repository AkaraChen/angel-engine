import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { desc, eq } from 'drizzle-orm';

import type { Chat, ChatCreateInput } from '../../shared/chat';
import { chats } from '../db/schema';
import { getDatabase } from '../db/database';

const DEFAULT_CHAT_TITLE = 'New chat';

export function listChats(): Chat[] {
  return getDatabase().select().from(chats).orderBy(desc(chats.updatedAt)).all();
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

export function createChat(input: ChatCreateInput = {}): Chat {
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
  const deletedCount = listChats().length;
  getDatabase().delete(chats).run();
  return deletedCount;
}

export function touchChat(id: string): Chat {
  return updateChat(id, { updatedAt: new Date().toISOString() });
}

export function setChatRemoteThreadId(
  id: string,
  remoteThreadId: string | null
): Chat {
  return updateChat(id, {
    remoteThreadId: normalizeOptionalString(remoteThreadId),
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

export function requireChat(id: string): Chat {
  const chat = getChat(id);
  if (!chat) {
    throw new Error('Chat not found.');
  }
  return chat;
}

function updateChat(
  id: string,
  patch: Partial<Pick<Chat, 'remoteThreadId' | 'title' | 'updatedAt'>>
): Chat {
  const chat = getDatabase()
    .update(chats)
    .set(patch)
    .where(eq(chats.id, requireChatId(id)))
    .returning()
    .get();

  if (!chat) {
    throw new Error('Chat not found.');
  }

  return chat;
}

function requireChatId(id: string) {
  const trimmed = id.trim();
  if (!trimmed) {
    throw new Error('Chat id is required.');
  }
  return trimmed;
}

function normalizeRuntime(runtime: string | undefined) {
  const trimmed = (runtime ?? process.env.ANGEL_ENGINE_RUNTIME)?.trim().toLowerCase();
  if (trimmed === 'kimi') return 'kimi';
  if (trimmed === 'opencode' || trimmed === 'open-code') return 'opencode';
  return 'codex';
}

function normalizeTitle(title: string | undefined) {
  const trimmed = title?.trim();
  return trimmed || DEFAULT_CHAT_TITLE;
}

function normalizeOptionalString(value: string | null | undefined) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeOptionalDirectory(value: string | null | undefined) {
  const trimmed = normalizeOptionalString(value);
  if (!trimmed) return null;

  const resolvedPath = path.resolve(trimmed);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error('Chat cwd does not exist.');
  }

  if (!fs.statSync(resolvedPath).isDirectory()) {
    throw new Error('Chat cwd must be a directory.');
  }

  return resolvedPath;
}

function titleFromPrompt(prompt: string) {
  const title = prompt.replace(/\s+/g, ' ').trim();
  if (!title) return DEFAULT_CHAT_TITLE;
  return title.length > 48 ? `${title.slice(0, 47)}...` : title;
}
