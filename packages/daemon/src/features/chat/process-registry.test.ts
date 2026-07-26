import type { Chat } from "@angel-engine/daemon-api/chat";
import type {
  SessionProcess,
  SessionProcessIdListener,
} from "@angel-engine/js-client";

import { describe, expect, it, vi } from "vitest";

import { ChatProcessRegistry } from "./process-registry";

const chat = {
  archived: false,
  createdAt: "2026-07-25T00:00:00.000Z",
  cwd: "/tmp",
  id: "chat-1",
  pinned: false,
  projectId: null,
  remoteThreadId: null,
  runtime: "codex",
  title: "Test",
  updatedAt: "2026-07-25T00:00:00.000Z",
} satisfies Chat;

class FakeSession implements SessionProcess {
  readonly #listeners = new Set<SessionProcessIdListener>();

  constructor(private currentProcessId: number | undefined) {}

  processId(): number | undefined {
    return this.currentProcessId;
  }

  setProcessId(processId: number | undefined): void {
    this.currentProcessId = processId;
    for (const listener of this.#listeners) listener(processId);
  }

  subscribeProcessId(listener: SessionProcessIdListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
}

describe("ChatProcessRegistry", () => {
  it("serializes PID loss after an older chat lookup", async () => {
    const session = new FakeSession(123);
    let resolveLookup!: (chat: Chat) => void;
    const lookupChat = vi.fn(
      () =>
        new Promise<Chat>((resolve) => {
          resolveLookup = resolve;
        }),
    );
    const replaceEntries = vi.fn(async () => undefined);
    const registry = new ChatProcessRegistry({
      lookupChat,
      replaceEntries,
      sessions: new Map([[chat.id, session]]),
    });

    const oldRefresh = registry.refresh();
    await vi.waitFor(() => expect(lookupChat).toHaveBeenCalledOnce());

    session.setProcessId(undefined);
    resolveLookup(chat);
    await oldRefresh;
    await registry.refresh();

    expect(replaceEntries).toHaveBeenNthCalledWith(1, [
      { id: chat.id, label: chat.title, rootPid: 123 },
    ]);
    expect(replaceEntries).toHaveBeenLastCalledWith([]);
  });
});
