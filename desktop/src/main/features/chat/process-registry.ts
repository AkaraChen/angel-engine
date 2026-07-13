import type { ProcessRegistryEntry } from "@angel-engine/daemon";
import type { DesktopChatSession } from "./chat-session-factory";

import {
  fetchDaemon,
  subscribeDaemonConnection,
} from "../../daemon/supervisor";
import { requireChat } from "./repository";

export class ChatProcessRegistry {
  readonly #sessions: Map<string, DesktopChatSession>;

  constructor(sessions: Map<string, DesktopChatSession>) {
    this.#sessions = sessions;
    subscribeDaemonConnection((connection) => {
      if (connection.status === "available") void this.refresh();
    });
  }

  async refresh() {
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
}
