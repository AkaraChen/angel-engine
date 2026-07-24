import type { Effect } from "effect";
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
import { v4 as uuidv4 } from "uuid"; // assuming uuid is available or use nanoid

export class ChatRegistryService extends Service<ChatRegistryService>() {
  readonly name = "daemon/ChatRegistryService";
  readonly registry = new Map<string, ChatActiveRunSnapshot>(); // runId -> snapshot

  private clock = Effect.sync(() => new Date().toISOString());

  replace(entries: ChatActiveRunResult[]) {
    for (const { run } of entries) {
      if (run) this.registry.set(run.runId, run);
    }
  }

  snapshot(chatId: string): Effect<ChatActiveRunSnapshot | null, never> {
    const snapshot = Array.from(this.registry.values()).find(
      (s) => s.chatId === chatId,
    );
    return Effect.sync(() => snapshot || null);
  }

  kill(runId: string): Effect<boolean, never> {
    this.registry.delete(runId);
    return Effect.sync(() => true);
  }

  // Add the other methods for atomic attach, sequence, etc. as per invariants
  // For brevity, stub the full service here and expand in next steps
}
