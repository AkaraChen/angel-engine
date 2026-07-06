import is from "@sindresorhus/is";
import { create } from "zustand";

export interface WorktreeChatTabs {
  chatIds: string[];
}

export interface PowerDraftWorktree {
  cwd?: string;
  groupKey: string;
  projectId: string;
}

type ChatTabGroups = Partial<Record<string, WorktreeChatTabs>>;

const chatTabGroupsStorageKey = "angel-engine.power-chat-tabs";
const initialChatTabGroups = readChatTabGroups();

interface ChatTabState {
  clearChatTabs: () => void;
  closeChatTab: (groupKey: string, chatId: string) => void;
  draftWorktree?: PowerDraftWorktree;
  openChatTab: (groupKey: string, chatId: string) => void;
  removeChatFromTabGroups: (chatId: string) => void;
  setDraftWorktree: (draftWorktree?: PowerDraftWorktree) => void;
  tabGroups: ChatTabGroups;
}

export const useChatTabStore = create<ChatTabState>()((set) => ({
  clearChatTabs: () =>
    set(() => {
      const tabGroups: ChatTabGroups = {};
      writeChatTabGroups(tabGroups);

      return { tabGroups };
    }),
  closeChatTab: (groupKey, chatId) =>
    set((current) => {
      const group = current.tabGroups[groupKey];
      if (!group || !group.chatIds.includes(chatId)) return current;

      const chatIds = group.chatIds.filter((id) => id !== chatId);
      const tabGroups = { ...current.tabGroups };
      if (chatIds.length === 0) {
        delete tabGroups[groupKey];
      } else {
        tabGroups[groupKey] = { chatIds };
      }
      writeChatTabGroups(tabGroups);

      return { tabGroups };
    }),
  openChatTab: (groupKey, chatId) =>
    set((current) => {
      const group = current.tabGroups[groupKey];
      if (group?.chatIds.includes(chatId)) return current;

      const tabGroups = {
        ...current.tabGroups,
        [groupKey]: { chatIds: [...(group?.chatIds ?? []), chatId] },
      };
      writeChatTabGroups(tabGroups);

      return { tabGroups };
    }),
  removeChatFromTabGroups: (chatId) =>
    set((current) => {
      let changed = false;
      const tabGroups: ChatTabGroups = {};

      for (const [groupKey, group] of Object.entries(current.tabGroups)) {
        if (!group) continue;

        const chatIds = group.chatIds.filter((id) => id !== chatId);
        if (chatIds.length !== group.chatIds.length) changed = true;
        if (chatIds.length > 0) {
          tabGroups[groupKey] = { chatIds };
        }
      }

      if (!changed) return current;
      writeChatTabGroups(tabGroups);

      return { tabGroups };
    }),
  setDraftWorktree: (draftWorktree) =>
    set((current) =>
      current.draftWorktree === draftWorktree ? current : { draftWorktree },
    ),
  tabGroups: initialChatTabGroups,
}));

export function openChatTab(groupKey: string, chatId: string) {
  useChatTabStore.getState().openChatTab(groupKey, chatId);
}

export function removeChatFromTabGroups(chatId: string) {
  useChatTabStore.getState().removeChatFromTabGroups(chatId);
}

export function clearChatTabs() {
  useChatTabStore.getState().clearChatTabs();
}

export function setPowerDraftWorktree(draftWorktree?: PowerDraftWorktree) {
  useChatTabStore.getState().setDraftWorktree(draftWorktree);
}

function readChatTabGroups(): ChatTabGroups {
  try {
    return sanitizeChatTabGroups(
      JSON.parse(window.localStorage.getItem(chatTabGroupsStorageKey) ?? "{}"),
    );
  } catch {
    return {};
  }
}

function writeChatTabGroups(tabGroups: ChatTabGroups) {
  window.localStorage.setItem(
    chatTabGroupsStorageKey,
    JSON.stringify(tabGroups),
  );
}

function sanitizeChatTabGroups(value: unknown): ChatTabGroups {
  if (!is.plainObject(value)) return {};

  const tabGroups: ChatTabGroups = {};
  for (const [groupKey, group] of Object.entries(value)) {
    if (!is.plainObject(group) || !is.array(group.chatIds, is.string)) {
      continue;
    }

    const chatIds = group.chatIds.filter((chatId) => chatId.trim().length > 0);
    if (chatIds.length > 0) {
      tabGroups[groupKey] = { chatIds };
    }
  }

  return tabGroups;
}
