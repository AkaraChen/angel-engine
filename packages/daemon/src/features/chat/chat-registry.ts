import { Effect, Service } from "effect";
import type {
  ChatActiveRunSnapshot,
  ChatActiveRunResult,
  ChatRunObserverEvent,
  ChatOpenElicitation,
} from "@angel-engine/daemon-api/chat";
import {
  isChatActiveRunSnapshot,
  isChatActiveRunResult,
  isChatRunObserverEvent,
} from "@angel-engine/daemon-api/chat";
import { v4 as uuidv4 } from "uuid";

export class ChatRegistryService extends Service<ChatRegistryService>() {
  readonly name = "daemon/ChatRegistryService";
  private registry = new Map<string, ChatActiveRunSnapshot>(); // runId -> snapshot (deep copy on write)
  private subscribers = new Set<Effect<ChatRunObserverEvent, never>>();

  replace(entries: ChatActiveRunResult[]) {
    for (const { run } of entries) {
      if (run) this.registry.set(run.runId, this.deepCopy(run));
    }
  }

  snapshot(chatId: string): Effect<ChatActiveRunSnapshot | null, never> {
    const snapshot = Array.from(this.registry.values()).find(
      (s) => s.chatId === chatId,
    );
    return Effect.sync(() => (snapshot ? this.deepCopy(snapshot) : null));
  }

  kill(runId: string): Effect<boolean, never> {
    const deleted = this.registry.delete(runId);
    return Effect.sync(() => deleted);
  }

  // Atomic publish path: snapshot update + sequence + fan-out in same sync section
  publish(event: ChatRunObserverEvent): Effect<void, never> {
    return Effect.sync(() => {
      this.registry.set(event.snapshot!.runId, this.deepCopy(event.snapshot!));
      for (const sub of this.subscribers) {
        sub(event);
      }
    });
  }

  // Deep copy for defensive copy of message parts / nested data
  private deepCopy<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }
}
