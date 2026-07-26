import type {
  Chat,
  ChatRunObserverEvent,
  ChatRunStartInput,
  ChatSendResult,
  ChatStreamEvent,
  ChatToolAction,
} from "@angel-engine/daemon-api/chat";
import type { ChatStreamControls } from "./runtime";

import { describe, expect, it, vi } from "vitest";
import { CHAT_RUN_ID_RETENTION_LIMIT, ChatRunRegistry } from "./run-registry";

const chat: Chat = {
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
};

const input: ChatRunStartInput = {
  chatId: chat.id,
  text: "hello",
};

const result: ChatSendResult = {
  chat,
  chatId: chat.id,
  content: [{ text: "done", type: "text" }],
  text: "done",
};

function deferredRun() {
  let emit!: (event: ChatStreamEvent) => void;
  let signal!: AbortSignal;
  let controls!: ChatStreamControls;
  let resolve!: (value: ChatSendResult) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<ChatSendResult>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  const execute = vi.fn(
    (
      _input: ChatRunStartInput,
      onEvent: (event: ChatStreamEvent) => void,
      abortSignal: AbortSignal,
      runControls: ChatStreamControls,
    ) => {
      emit = onEvent;
      signal = abortSignal;
      controls = runControls;
      return promise;
    },
  );
  return {
    controls: () => controls,
    emit: (event: ChatStreamEvent) => emit(event),
    execute,
    reject,
    resolve,
    signal: () => signal,
  };
}

async function waitForMessages(
  messages: ChatRunObserverEvent[],
  count: number,
) {
  await vi.waitFor(() => expect(messages).toHaveLength(count));
}

describe("ChatRunRegistry", () => {
  it("queues one snapshot before gap-free sequenced events", async () => {
    const run = deferredRun();
    const registry = new ChatRunRegistry({ execute: run.execute });
    registry.start("run-1", input);
    const messages: ChatRunObserverEvent[] = [];
    let releaseSnapshot!: () => void;
    const snapshotGate = new Promise<void>((resolve) => {
      releaseSnapshot = resolve;
    });

    registry.observe("run-1", {
      close: vi.fn(),
      write: async (message) => {
        if (message.type === "snapshot") await snapshotGate;
        messages.push(message);
      },
    });
    run.emit({ part: "text", text: "working", type: "delta" });

    expect(messages).toEqual([]);
    releaseSnapshot();
    await waitForMessages(messages, 2);
    expect(messages[0]).toMatchObject({
      snapshot: { lastEventSequence: 0, runId: "run-1" },
      type: "snapshot",
    });
    expect(messages[1]).toMatchObject({
      event: { text: "working", type: "delta" },
      sequence: 1,
      type: "event",
    });
    expect(registry.active(chat.id).run).toMatchObject({
      assistantMessage: {
        content: [{ text: "working", type: "text" }],
      },
      lastEventSequence: 1,
    });

    run.resolve(result);
    await vi.waitFor(() => expect(registry.active(chat.id).run).toBeNull());
  });

  it("detaches observers without cancelling; only stop aborts", async () => {
    const run = deferredRun();
    const registry = new ChatRunRegistry({ execute: run.execute });
    registry.start("run-1", input);
    const close = vi.fn();
    const detach = registry.observe("run-1", {
      close,
      write: async () => undefined,
    });

    detach();
    expect(close).toHaveBeenCalledOnce();
    expect(run.signal().aborted).toBe(false);

    registry.stop("run-1");
    expect(run.signal().aborted).toBe(true);
    run.reject(new Error("cancelled"));
    await vi.waitFor(() => expect(registry.active(chat.id).run).toBeNull());
    expect(() => registry.reserve("run-1", input)).toThrow(
      "Run id has already been used",
    );
  });

  it("removes a stopped reservation before execution starts", () => {
    const run = deferredRun();
    const registry = new ChatRunRegistry({ execute: run.execute });

    registry.reserve("run-1", input);
    registry.stop("run-1");

    expect(run.execute).not.toHaveBeenCalled();
    expect(registry.active(chat.id).run).toBeNull();
    expect(() => registry.reserve("run-1", input)).toThrow(
      "Run id has already been used",
    );
    expect(() => registry.reserve("run-2", input)).not.toThrow();
    registry.stop("run-2");
  });

  it("enforces one active run per chat and per run id", () => {
    const run = deferredRun();
    const registry = new ChatRunRegistry({ execute: run.execute });
    registry.start("run-1", input);

    expect(() => registry.start("run-2", input)).toThrow(
      "already has an active run",
    );
    expect(() =>
      registry.start("run-1", { chatId: "chat-2", text: "hello" }),
    ).toThrow("Run id is already active");
    run.resolve(result);
  });

  it("rejects reuse after a run id leaves the active registry", async () => {
    const run = deferredRun();
    const registry = new ChatRunRegistry({ execute: run.execute });
    registry.start("run-1", input);

    run.resolve(result);
    await vi.waitFor(() => expect(registry.active(chat.id).run).toBeNull());

    expect(() =>
      registry.start("run-1", { chatId: "chat-2", text: "again" }),
    ).toThrow("Run id has already been used");
  });

  it("bounds retained run ids after stopped reservations", () => {
    const run = deferredRun();
    const registry = new ChatRunRegistry({ execute: run.execute });

    for (let index = 0; index <= CHAT_RUN_ID_RETENTION_LIMIT; index += 1) {
      const runId = `run-${index}`;
      registry.reserve(runId, input);
      registry.stop(runId);
    }

    expect(() => registry.reserve("run-0", input)).not.toThrow();
    expect(() =>
      registry.reserve("run-1", { ...input, chatId: "chat-2" }),
    ).toThrow("Run id has already been used");
    registry.stop("run-0");
  });

  it("treats a tool action awaiting a decision as pending input", async () => {
    // Permission prompts never reach the client as `elicitation` events, so
    // without this the run would report `running` while it is actually stuck.
    const run = deferredRun();
    const registry = new ChatRunRegistry({ execute: run.execute });
    registry.start("run-1", input);
    const action: ChatToolAction = {
      id: "tool-1",
      inputSummary: "rm -rf /",
      kind: "command",
      output: [],
      outputText: "",
      phase: "running",
      rawInput: '{"command":"rm -rf /"}',
      title: "Shell",
      turnId: "turn-1",
    };

    run.emit({
      action: { ...action, phase: "awaitingDecision" },
      type: "tool",
    });
    expect(registry.active(chat.id).run).toMatchObject({
      pendingElicitation: { body: "rm -rf /", id: "tool-1", title: "Shell" },
      status: "needsInput",
    });

    run.emit({ action: { ...action, phase: "running" }, type: "tool" });
    expect(registry.active(chat.id).run).toMatchObject({
      pendingElicitation: null,
      status: "running",
    });

    run.resolve(result);
    await vi.waitFor(() => expect(registry.active(chat.id).run).toBeNull());
  });

  it("commits and recovers pending elicitation state atomically", async () => {
    const run = deferredRun();
    const resolveElicitation = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporarily unavailable"))
      .mockResolvedValueOnce(undefined);
    const registry = new ChatRunRegistry({ execute: run.execute });
    registry.start("run-1", input);
    run.controls().setResolveElicitation?.(resolveElicitation);
    run.emit({
      elicitation: {
        body: "Continue?",
        id: "elic-1",
        kind: "approval",
        phase: "open",
        title: "Permission",
      },
      type: "elicitation",
    });

    expect(registry.active(chat.id).run).toMatchObject({
      pendingElicitation: { id: "elic-1" },
      status: "needsInput",
    });
    await expect(
      registry.resolveElicitation("run-1", "stale", { type: "deny" }),
    ).rejects.toThrow("not waiting for this user input");
    await expect(
      registry.resolveElicitation("run-1", "elic-1", { type: "allow" }),
    ).rejects.toThrow("temporarily unavailable");
    expect(registry.active(chat.id).run).toMatchObject({
      pendingElicitation: { id: "elic-1" },
      status: "needsInput",
    });

    await registry.resolveElicitation("run-1", "elic-1", { type: "allow" });
    expect(resolveElicitation).toHaveBeenCalledTimes(2);
    expect(resolveElicitation).toHaveBeenLastCalledWith("elic-1", {
      type: "allow",
    });
    expect(registry.active(chat.id).run).toMatchObject({
      pendingElicitation: null,
      status: "running",
    });

    run.resolve(result);
    await vi.waitFor(() => expect(registry.active(chat.id).run).toBeNull());
  });

  it("keeps a late-success input resolvable before removing the run", async () => {
    const run = deferredRun();
    const resolveElicitation = vi.fn().mockResolvedValue(undefined);
    const publish = vi.fn();
    const registry = new ChatRunRegistry({
      execute: run.execute,
      onEvent: publish,
    });
    registry.start("run-1", input);
    run.controls().setResolveElicitation?.(resolveElicitation);
    run.emit({
      elicitation: {
        body: "Continue?",
        id: "elic-1",
        kind: "approval",
        phase: "open",
        title: "Permission",
      },
      type: "elicitation",
    });

    run.resolve(result);
    await vi.waitFor(() =>
      expect(publish.mock.calls.map(([event]) => event.event.type)).toContain(
        "result",
      ),
    );
    expect(registry.active(chat.id).run).toMatchObject({
      pendingElicitation: { id: "elic-1" },
      status: "needsInput",
    });

    await registry.resolveElicitation("run-1", "elic-1", { type: "allow" });
    expect(resolveElicitation).toHaveBeenCalledWith("elic-1", {
      type: "allow",
    });
    expect(publish.mock.calls.map(([event]) => event.event.type)).toEqual([
      "elicitation",
      "result",
      "done",
    ]);
    expect(registry.active(chat.id).run).toBeNull();
  });

  it("fails a late-success run when its retained input is no longer resolvable", async () => {
    const run = deferredRun();
    const resolveElicitation = vi
      .fn()
      .mockRejectedValue(new Error("Runtime already closed"));
    const publish = vi.fn();
    const registry = new ChatRunRegistry({
      execute: run.execute,
      onEvent: publish,
    });
    registry.start("run-1", input);
    run.controls().setResolveElicitation?.(resolveElicitation);
    run.emit({
      elicitation: {
        id: "elic-1",
        kind: "approval",
        phase: "open",
      },
      type: "elicitation",
    });
    run.resolve(result);
    await vi.waitFor(() =>
      expect(publish.mock.calls.map(([event]) => event.event.type)).toContain(
        "result",
      ),
    );

    await expect(
      registry.resolveElicitation("run-1", "elic-1", { type: "allow" }),
    ).rejects.toThrow("Runtime already closed");
    expect(publish.mock.calls.map(([event]) => event.event.type)).toEqual([
      "elicitation",
      "result",
      "error",
      "done",
    ]);
    expect(registry.active(chat.id).run).toBeNull();
  });

  it("publishes result and done before removing terminal state", async () => {
    const run = deferredRun();
    const publish = vi.fn();
    const registry = new ChatRunRegistry({
      execute: run.execute,
      onEvent: publish,
    });
    registry.start("run-1", input);
    const messages: ChatRunObserverEvent[] = [];
    const close = vi.fn();
    registry.observe("run-1", {
      close,
      write: async (message) => {
        messages.push(message);
      },
    });

    run.resolve(result);
    await waitForMessages(messages, 3);
    expect(messages.map((message) => message.type)).toEqual([
      "snapshot",
      "event",
      "event",
    ]);
    expect(
      messages.flatMap((message) =>
        message.type === "event" ? [message.event.type] : [],
      ),
    ).toEqual(["result", "done"]);
    expect(publish.mock.calls.map(([event]) => event.event.type)).toEqual([
      "result",
      "done",
    ]);
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(registry.active(chat.id).run).toBeNull();
  });
});
