import type { DesktopChatSession } from "./chat-session-factory";
import type { ProcessRegistryEntry } from "@angel-engine/daemon-api/daemon";
import type { ProcessRegistry } from "../../processes";
import { requireChat } from "./repository";

export class ChatProcessRegistry {
  readonly #sessions: Map<string, DesktopChatSession>;
  readonly #registry: ProcessRegistry;
  readonly #subscriptions = new Map<
    string,
    { session: DesktopChatSession; unsubscribe: () => void }
  >();
  constructor(
    sessions: Map<string, DesktopChatSession>,
    registry: ProcessRegistry,
  ) {
    this.#sessions = sessions;
    this.#registry = registry;
  }

  refresh(): Promise<void> {
    this.#refreshSubscriptions();
    const entries: ProcessRegistryEntry[] = [];
    for (const [chatId, session] of this.#sessions) {
      const rootPid = session.processId();
      if (rootPid === undefined) continue;
      const chat = requireChat(chatId);
      entries.push({ id: chatId, label: chat.title || chat.runtime, rootPid });
    }
    this.#registry.replace(entries);
    return Promise.resolve();
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
