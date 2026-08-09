import type { Chat } from "@angel-engine/daemon-api/chat";

/** Delay before the archive is committed to the backend. Undo is available until then. */
export const CHAT_ARCHIVE_UNDO_MS = 5000;

export interface PendingChatArchive {
  chat: Chat;
  wasSelected: boolean;
}

export interface PendingChatArchiveScheduler {
  schedule(callback: () => void, delayMs: number): { cancel: () => void };
}

export function createTimeoutScheduler(
  setTimer: typeof setTimeout = setTimeout,
  clearTimer: typeof clearTimeout = clearTimeout,
): PendingChatArchiveScheduler {
  return {
    schedule(callback, delayMs) {
      const id = setTimer(callback, delayMs);
      return { cancel: () => clearTimer(id) };
    },
  };
}

interface StackEntry extends PendingChatArchive {
  cancel: () => void;
  dismissToast?: () => void;
}

export function createPendingChatArchiveQueue({
  delayMs = CHAT_ARCHIVE_UNDO_MS,
  onCommit,
  scheduler = createTimeoutScheduler(),
}: {
  delayMs?: number;
  onCommit: (pending: PendingChatArchive) => void;
  scheduler?: PendingChatArchiveScheduler;
}) {
  const stack: StackEntry[] = [];

  function removeById(chatId: string): StackEntry | null {
    const index = stack.findIndex((entry) => entry.chat.id === chatId);
    if (index === -1) return null;
    const [entry] = stack.splice(index, 1);
    return entry ?? null;
  }

  return {
    clear() {
      while (stack.length > 0) {
        stack.pop()?.cancel();
      }
    },

    hasPending() {
      return stack.length > 0;
    },

    isPending(chatId: string) {
      return stack.some((entry) => entry.chat.id === chatId);
    },

    schedule(
      chat: Chat,
      wasSelected: boolean,
      options: { dismissToast?: () => void } = {},
    ) {
      const existing = removeById(chat.id);
      existing?.cancel();
      existing?.dismissToast?.();

      const handle = scheduler.schedule(() => {
        removeById(chat.id);
        onCommit({ chat, wasSelected });
      }, delayMs);

      stack.push({
        cancel: handle.cancel,
        chat,
        dismissToast: options.dismissToast,
        wasSelected,
      });
    },

    undo(chatId: string): PendingChatArchive | null {
      const entry = removeById(chatId);
      if (!entry) return null;
      entry.cancel();
      entry.dismissToast?.();
      return { chat: entry.chat, wasSelected: entry.wasSelected };
    },

    undoLatest(): PendingChatArchive | null {
      const entry = stack.pop();
      if (!entry) return null;
      entry.cancel();
      entry.dismissToast?.();
      return { chat: entry.chat, wasSelected: entry.wasSelected };
    },
  };
}

export type PendingChatArchiveQueue = ReturnType<
  typeof createPendingChatArchiveQueue
>;

/** Cmd/Ctrl+Shift+T restores the most recently pending archive. */
export function isRestorePendingArchiveShortcut(
  event: {
    altKey: boolean;
    ctrlKey: boolean;
    key: string;
    metaKey: boolean;
    repeat: boolean;
    shiftKey: boolean;
  },
  isMacOS: boolean,
): boolean {
  if (event.repeat || event.altKey || !event.shiftKey) return false;
  if (
    isMacOS ? !event.metaKey || event.ctrlKey : !event.ctrlKey || event.metaKey
  ) {
    return false;
  }
  return event.key.toLowerCase() === "t";
}

export function restorePendingArchiveShortcutLabel(isMacOS: boolean): string {
  return isMacOS ? "⌘⇧T" : "Ctrl+Shift+T";
}
