import type {
  ChatRunObserverEvent,
  ChatSendResult,
  ChatStreamEvent,
} from "@angel-engine/daemon-api/chat";

import { describe, expect, it, vi } from "vitest";
import { ChatRunRegistry } from "./chat-run-registry";

const result: ChatSendResult = {
  chat: {
    archived: false,
    createdAt: "2026-07-24T00:00:00.000Z",
    cwd: "/tmp",
    id: "chat-1",
    pinned: false,
    projectId: null,
    remoteThreadId: null,
    runtime: "codex",
    title: "Test",
    updatedAt: "2026-07-24T00:00:01.000Z",
  },
  chatId: "chat-1",
  content: [{ text: "Hello", type: "text" }],
  text: "Hello",
};

describe("ChatRunRegistry", () => {
  it("keeps provider execution alive across observer detach and reattach", async () => {
    let emit!: (event: ChatStreamEvent) => void;
    let complete!: (value: ChatSendResult) => void;
    const completion = new Promise<ChatSendResult>((resolve) => {
      complete = resolve;
    });
    const registry = new ChatRunRegistry({
      execute: async (_input, onEvent) => {
        emit = onEvent;
        return completion;
      },
    });
    registry.prepare("run-1", { chatId: "chat-1", text: "Hi" });

    const first: ChatRunObserverEvent[] = [];
    const detach = registry.attach("run-1", (message) => first.push(message));
    registry.launch("run-1");
    emit({ part: "text", text: "Hel", type: "delta" });
    detach();
    emit({ part: "text", text: "lo", type: "delta" });

    expect(first.map(messageType)).toEqual(["snapshot", "event:delta"]);
    expect(registry.activeForChat("chat-1")).toMatchObject({
      assistantMessage: {
        content: [{ text: "Hello", type: "text" }],
      },
      lastEventSequence: 2,
    });

    const second: ChatRunObserverEvent[] = [];
    registry.attach("run-1", (message) => second.push(message));
    emit({
      plan: { entries: [], kind: "review", text: "Plan" },
      type: "plan",
    });
    complete(result);
    await waitUntil(() => registry.activeForChat("chat-1") === null);

    expect(second.map(messageType)).toEqual([
      "snapshot",
      "event:plan",
      "event:result",
      "event:done",
    ]);
    expect(second[0]).toMatchObject({
      snapshot: { lastEventSequence: 2 },
      type: "snapshot",
    });
    expect(
      second
        .filter(
          (
            message,
          ): message is Extract<ChatRunObserverEvent, { type: "event" }> =>
            message.type === "event",
        )
        .map((message) => message.sequence),
    ).toEqual([3, 4, 5]);
  });

  it("commits elicitation state atomically and rejects stale ids", async () => {
    let emit!: (event: ChatStreamEvent) => void;
    let complete!: (value: ChatSendResult) => void;
    const completion = new Promise<ChatSendResult>((resolve) => {
      complete = resolve;
    });
    const resolveElicitation = vi.fn(async () => undefined);
    const registry = new ChatRunRegistry({
      execute: async (_input, onEvent, _signal, controls) => {
        emit = onEvent;
        controls.setResolveElicitation?.(resolveElicitation);
        return completion;
      },
    });
    registry.prepare("run-1", { chatId: "chat-1", text: "Hi" });
    registry.launch("run-1");
    emit({
      elicitation: {
        id: "elicitation-1",
        kind: "approval",
        phase: "open",
        title: "Proceed?",
      },
      type: "elicitation",
    });

    expect(registry.activeForChat("chat-1")).toMatchObject({
      pendingElicitation: { id: "elicitation-1" },
      status: "needsInput",
    });
    await expect(
      registry.resolveElicitation("run-1", "stale", { type: "allow" }),
    ).rejects.toMatchObject({ code: "chat-stream-not-waiting" });

    await registry.resolveElicitation("run-1", "elicitation-1", {
      type: "allow",
    });
    expect(resolveElicitation).toHaveBeenCalledWith("elicitation-1", {
      type: "allow",
    });
    expect(registry.activeForChat("chat-1")).toMatchObject({
      pendingElicitation: null,
      status: "running",
    });

    complete(result);
    await waitUntil(() => registry.activeForChat("chat-1") === null);
  });

  it("allows only one active run per chat and run id", () => {
    const registry = new ChatRunRegistry({
      execute: async () => result,
    });
    registry.prepare("run-1", { chatId: "chat-1", text: "Hi" });

    expect(() =>
      registry.prepare("run-1", { chatId: "chat-2", text: "Hi" }),
    ).toThrow("already has an active run");
    expect(() =>
      registry.prepare("run-2", { chatId: "chat-1", text: "Hi" }),
    ).toThrow("already has an active run");
  });

  it("uses explicit stop to abort the provider without publishing an error", async () => {
    const observed: ChatRunObserverEvent[] = [];
    const registry = new ChatRunRegistry({
      execute: async (_input, _onEvent, signal) =>
        new Promise<ChatSendResult>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          );
        }),
    });
    registry.prepare("run-1", { chatId: "chat-1", text: "Hi" });
    registry.attach("run-1", (message) => observed.push(message));
    registry.launch("run-1");

    registry.stop("run-1");
    await waitUntil(() => registry.activeForChat("chat-1") === null);

    expect(observed.map(messageType)).toEqual(["snapshot", "event:done"]);
  });

  it("keeps run lifecycle independent from the best-effort global feed", async () => {
    const observed: ChatRunObserverEvent[] = [];
    const registry = new ChatRunRegistry({
      execute: async (_input, onEvent) => {
        onEvent({ part: "text", text: "Hello", type: "delta" });
        return result;
      },
      publishEvent: () => {
        throw new Error("feed unavailable");
      },
    });
    registry.prepare("run-1", { chatId: "chat-1", text: "Hi" });
    registry.attach("run-1", (message) => observed.push(message));

    registry.launch("run-1");
    await waitUntil(() => registry.activeForChat("chat-1") === null);

    expect(observed.map(messageType)).toEqual([
      "snapshot",
      "event:delta",
      "event:result",
      "event:done",
    ]);
  });
});

function messageType(message: ChatRunObserverEvent): string {
  return message.type === "snapshot"
    ? "snapshot"
    : `event:${message.event.type}`;
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Condition was not met.");
}
