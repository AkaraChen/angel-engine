import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHAT_ARCHIVE_UNDO_MS,
  createPendingChatArchiveQueue,
  isRestorePendingArchiveShortcut,
  restorePendingArchiveShortcutLabel,
  type PendingChatArchiveScheduler,
} from "./pending-chat-archive";

function chat(id: string) {
  return {
    archived: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    cwd: null,
    id,
    pinned: false,
    projectId: null,
    remoteThreadId: null,
    runtime: "claude",
    title: id,
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as const;
}

function createFakeScheduler() {
  let nextId = 1;
  const timers = new Map<number, { callback: () => void; delayMs: number }>();

  const scheduler: PendingChatArchiveScheduler = {
    schedule(callback, delayMs) {
      const id = nextId++;
      timers.set(id, { callback, delayMs });
      return {
        cancel: () => {
          timers.delete(id);
        },
      };
    },
  };

  return {
    flush(delayMs = CHAT_ARCHIVE_UNDO_MS) {
      for (const [id, timer] of [...timers.entries()]) {
        if (timer.delayMs <= delayMs) {
          timers.delete(id);
          timer.callback();
        }
      }
    },
    pendingCount() {
      return timers.size;
    },
    scheduler,
  };
}

describe("pending chat archive queue", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("commits archive after the undo window", () => {
    const commits: string[] = [];
    const fake = createFakeScheduler();
    const queue = createPendingChatArchiveQueue({
      onCommit: (item) => {
        commits.push(item.id);
      },
      scheduler: fake.scheduler,
    });

    queue.schedule(chat("a"), true);
    expect(commits).toEqual([]);
    expect(queue.hasPending()).toBe(true);

    fake.flush();
    expect(commits).toEqual(["a"]);
    expect(queue.hasPending()).toBe(false);
  });

  it("undo cancels commit and returns the chat", () => {
    const commits: string[] = [];
    const dismissToast = vi.fn();
    const fake = createFakeScheduler();
    const queue = createPendingChatArchiveQueue({
      onCommit: (item) => {
        commits.push(item.id);
      },
      scheduler: fake.scheduler,
    });

    queue.schedule(chat("a"), true, { dismissToast });
    const restored = queue.undo("a");

    expect(restored).toEqual({ chat: chat("a"), wasSelected: true });
    expect(dismissToast).toHaveBeenCalledOnce();
    fake.flush();
    expect(commits).toEqual([]);
  });

  it("undoLatest restores the most recent pending archive", () => {
    const fake = createFakeScheduler();
    const queue = createPendingChatArchiveQueue({
      onCommit: () => {},
      scheduler: fake.scheduler,
    });

    queue.schedule(chat("a"), false);
    queue.schedule(chat("b"), true);

    expect(queue.undoLatest()?.chat.id).toBe("b");
    expect(queue.undoLatest()?.chat.id).toBe("a");
    expect(queue.undoLatest()).toBeNull();
  });

  it("re-scheduling the same chat resets the undo window", () => {
    const commits: string[] = [];
    const dismissToast = vi.fn();
    const fake = createFakeScheduler();
    const queue = createPendingChatArchiveQueue({
      onCommit: (item) => {
        commits.push(item.id);
      },
      scheduler: fake.scheduler,
    });

    queue.schedule(chat("a"), true, { dismissToast });
    queue.schedule(chat("a"), false);

    expect(dismissToast).toHaveBeenCalledOnce();
    expect(fake.pendingCount()).toBe(1);

    fake.flush();
    expect(commits).toEqual(["a"]);
  });
});

describe("restore pending archive shortcut", () => {
  const base = {
    altKey: false,
    ctrlKey: false,
    key: "t",
    metaKey: true,
    repeat: false,
    shiftKey: true,
  };

  it("matches Cmd/Ctrl+Shift+T", () => {
    expect(isRestorePendingArchiveShortcut(base)).toBe(true);
    expect(
      isRestorePendingArchiveShortcut({
        ...base,
        ctrlKey: true,
        metaKey: false,
      }),
    ).toBe(true);
    expect(isRestorePendingArchiveShortcut({ ...base, key: "T" })).toBe(true);
  });

  it("ignores incomplete or repeated chords", () => {
    expect(isRestorePendingArchiveShortcut({ ...base, shiftKey: false })).toBe(
      false,
    );
    expect(
      isRestorePendingArchiveShortcut({
        ...base,
        ctrlKey: false,
        metaKey: false,
      }),
    ).toBe(false);
    expect(isRestorePendingArchiveShortcut({ ...base, altKey: true })).toBe(
      false,
    );
    expect(isRestorePendingArchiveShortcut({ ...base, repeat: true })).toBe(
      false,
    );
  });

  it("labels the shortcut for macOS and other platforms", () => {
    expect(restorePendingArchiveShortcutLabel(true)).toBe("⌘⇧T");
    expect(restorePendingArchiveShortcutLabel(false)).toBe("Ctrl+Shift+T");
  });
});
