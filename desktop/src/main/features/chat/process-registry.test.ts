import type { SessionProcessIdListener } from "@angel-engine/js-client";
import type { DesktopChatSession } from "./chat-session-factory";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchDaemon } = vi.hoisted(() => ({
  fetchDaemon: vi.fn(
    async (_path: string, _init?: RequestInit): Promise<Response> =>
      new Response(),
  ),
}));

vi.mock("../../daemon/supervisor", () => ({
  fetchDaemon,
  subscribeDaemonConnection: vi.fn(),
}));

vi.mock("./repository", () => ({
  requireChat: (id: string) => ({ id, runtime: "pi", title: "Pi chat" }),
}));

import { ChatProcessRegistry } from "./process-registry";

class DynamicProcessSession {
  readonly #listeners = new Set<SessionProcessIdListener>();
  #processId?: number;

  processId(): number | undefined {
    return this.#processId;
  }

  subscribeProcessId(listener: SessionProcessIdListener): () => void {
    this.#listeners.add(listener);
    return (): void => {
      this.#listeners.delete(listener);
    };
  }

  setProcessId(processId: number | undefined): void {
    this.#processId = processId;
    for (const listener of this.#listeners) listener(processId);
  }
}

describe("chat process registry", () => {
  beforeEach(() => {
    fetchDaemon.mockClear();
  });

  it("refreshes when a session process id changes", async () => {
    const session = new DynamicProcessSession();
    const sessions = new Map([
      ["chat-1", session as unknown as DesktopChatSession],
    ]);
    const registry = new ChatProcessRegistry(sessions);

    await registry.refresh();
    session.setProcessId(42);

    await vi.waitFor(() => expect(fetchDaemon).toHaveBeenCalledTimes(2));
    const request = fetchDaemon.mock.calls[1]?.[1];
    expect(JSON.parse(String(request?.body))).toEqual({
      entries: [{ id: "chat-1", label: "Pi chat", rootPid: 42 }],
    });
  });
});
