import type { Chat } from "@angel-engine/daemon-api/chat";
import type { ProcessRegistryEntry } from "@angel-engine/daemon-api/daemon";
import type { DesktopChatSession } from "./chat-session-factory";

/**
 * Mirrors live chat sessions into the process registry. Lives in the
 * callback/promise world because sessions push PID changes through plain
 * subscriptions; the chat engine injects Effect-backed lookups via the
 * constructor bridges.
 */
export class ChatProcessRegistry {
  readonly #sessions: Map<string, DesktopChatSession>;
  readonly #replaceEntries: (entries: ProcessRegistryEntry[]) => Promise<void>;
  readonly #lookupChat: (chatId: string) => Promise<Chat>;
  readonly #subscriptions = new Map<
    string,
    { session: DesktopChatSession; unsubscribe: () => void }
  >();

  constructor(options: {
    lookupChat: (chatId: string) => Promise<Chat>;
    replaceEntries: (entries: ProcessRegistryEntry[]) => Promise<void>;
    sessions: Map<string, DesktopChatSession>;
  }) {
    this.#sessions = options.sessions;
    this.#replaceEntries = options.replaceEntries;
    this.#lookupChat = options.lookupChat;
  }

  async refresh(): Promise<void> {
    this.#refreshSubscriptions();
    const entries: ProcessRegistryEntry[] = [];
    for (const [chatId, session] of this.#sessions) {
      const rootPid = session.processId();
      if (rootPid === undefined) continue;
      const chat = await this.#lookupChat(chatId);
      entries.push({ id: chatId, label: chat.title || chat.runtime, rootPid });
    }
    await this.#replaceEntries(entries);
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
