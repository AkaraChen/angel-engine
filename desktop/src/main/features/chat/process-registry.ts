import type { ProcessRegistryEntry } from "@angel-engine/daemon";
import type { DesktopChatSession } from "./chat-session-factory";

import {
  fetchDaemon,
  subscribeDaemonConnection,
} from "../../daemon/supervisor";
import { requireChat } from "./repository";

export class ChatProcessRegistry {
  readonly #sessions: Map<string, DesktopChatSession>;
  readonly #subscriptions = new Map<
    string,
    { session: DesktopChatSession; unsubscribe: () => void }
  >();
  #refreshQueue = Promise.resolve();

  constructor(sessions: Map<string, DesktopChatSession>) {
    this.#sessions = sessions;
    subscribeDaemonConnection((connection) => {
      if (connection.status === "available") void this.refresh();
    });
  }

  refresh(): Promise<void> {
    const refresh = this.#refreshQueue.then(() => this.#refreshNow());
    this.#refreshQueue = refresh.catch(() => undefined);
    return refresh;
  }

  async #refreshNow(): Promise<void> {
    this.#refreshSubscriptions();
    const entries: ProcessRegistryEntry[] = [];
    for (const [chatId, session] of this.#sessions) {
      const rootPid = session.processId();
      if (rootPid === undefined) continue;
      const chat = requireChat(chatId);
      entries.push({ id: chatId, label: chat.title || chat.runtime, rootPid });
    }
    try {
      await fetchDaemon("/api/process-registry", {
        body: JSON.stringify({ entries }),
        headers: { "content-type": "application/json" },
        method: "PUT",
      });
    } catch {
      // The supervisor will trigger another refresh when the daemon returns.
    }
  }

  #refreshSubscriptions(): void {
    for (const [chatId, subscription] of this.#subscriptions) {
      if (this.#sessions.get(chatId) === subscription.session) continue;
      subscription.unsubscribe();
      this.#subscriptions.delete(chatId);
    }

    for (const [chatId, session] of this.#sessions) {
      if (this.#subscriptions.has(chatId)) continue;
      const unsubscribe = session.subscribeProcessId(() => {
        void this.refresh();
      });
      this.#subscriptions.set(chatId, { session, unsubscribe });
    }
  }
}
