import type {
  Chat,
  ChatActiveRunSnapshot,
  ChatRunObserverEvent,
} from "@angel-engine/daemon-api/chat";
import type { AppendMessage } from "@assistant-ui/react";

import { beforeEach, describe, expect, it, vi } from "vitest";

const chatRuns = {
  active: vi.fn(),
  observe: vi.fn(),
  resolveElicitation: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
};
const chats = { create: vi.fn() };

vi.mock("@/platform/api-client", () => ({
  getApiClient: () => ({ chatRuns, chats }),
}));

const { selectSlot } = await import("../chat-run-reducer");
const { getChatRunContext } = await import("../chat-run-registry");
const store = await import("../chat-run-store");

let counter = 0;
function uniqueId(prefix: string) {
  counter += 1;
  return `${prefix}-${counter}`;
}

function chat(id: string): Chat {
  return {
    archived: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    cwd: null,
    id,
    pinned: false,
    projectId: null,
    remoteThreadId: null,
    runtime: "codex",
    title: "Chat",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function userPrompt(text: string): AppendMessage {
  return {
    attachments: [],
    content: [{ text, type: "text" }],
    createdAt: new Date(0),
    metadata: { custom: {} },
    parentId: null,
    role: "user",
    runConfig: undefined,
    sourceId: null,
  } as unknown as AppendMessage;
}

function snapshot(
  chatId: string,
  runId: string,
  overrides: Partial<ChatActiveRunSnapshot> = {},
): ChatActiveRunSnapshot {
  return {
    assistantMessage: {
      content: [{ text: "half a thought", type: "text" }],
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `${runId}:assistant`,
      role: "assistant",
    },
    chatId,
    lastEventSequence: 4,
    pendingElicitation: null,
    runId,
    startedAt: "2026-01-01T00:00:00.000Z",
    status: "running",
    updatedAt: "2026-01-01T00:00:00.000Z",
    userMessage: {
      content: [{ text: "the question", type: "text" }],
      createdAt: "2026-01-01T00:00:00.000Z",
      id: `${runId}:user`,
      role: "user",
    },
    ...overrides,
  } as ChatActiveRunSnapshot;
}

/**
 * A stream whose events are pushed from the test, so a run can stay in flight
 * across assertions the way a real daemon-owned run does.
 */
function controllableStream() {
  const pending: ChatRunObserverEvent[] = [];
  let notify: (() => void) | undefined;
  let done = false;
  return {
    close() {
      done = true;
      notify?.();
    },
    async *iterate(): AsyncIterable<ChatRunObserverEvent> {
      while (true) {
        while (pending.length > 0) {
          const next = pending.shift();
          if (next) yield next;
        }
        if (done) return;
        await new Promise<void>((resolve) => {
          notify = resolve;
        });
      }
    },
    push(event: ChatRunObserverEvent) {
      pending.push(event);
      notify?.();
    },
  };
}

/** Lets queued microtasks (flush, yieldToRendererTask) settle. */
async function settle() {
  for (let index = 0; index < 12; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  chatRuns.stop.mockResolvedValue({ ok: true });
  chatRuns.resolveElicitation.mockResolvedValue({ resolved: true });
  chatRuns.active.mockResolvedValue({ run: null });
});

describe("desktop chat run continuity", () => {
  it("creates the chat before the run and keys the slot by the real chat id", async () => {
    const created = chat(uniqueId("chat"));
    chats.create.mockResolvedValue(created);
    const stream = controllableStream();
    chatRuns.start.mockReturnValue(stream.iterate());
    const onChatCreated = vi.fn();

    const run = store.chatRunActions.startRun({
      callbacks: { onChatCreated },
      input: {
        creationLocation: "worktree",
        cwd: "/repo/.worktrees/feature",
        prewarmId: "prewarm-1",
        projectId: "project-1",
        runtime: "codex",
        worktreeSetupApproval: "setup-digest",
      },
      message: userPrompt("build it"),
      slotKey: "draft",
    });
    await settle();

    // Creation carries the prewarm and the placement; the run input does not.
    expect(chats.create).toHaveBeenCalledWith(
      expect.objectContaining({
        creationLocation: "worktree",
        cwd: "/repo/.worktrees/feature",
        prewarmId: "prewarm-1",
        projectId: "project-1",
        runtime: "codex",
        worktreeSetupApproval: "setup-digest",
      }),
    );
    expect(onChatCreated).toHaveBeenCalledWith(created);
    const [, startInput] = chatRuns.start.mock.calls[0] ?? [];
    expect(startInput).toMatchObject({ chatId: created.id, text: "build it" });
    expect(startInput).not.toHaveProperty("prewarmId");

    const slot = selectSlot(getChatRunContext(), created.id);
    expect(slot?.status).toBe("streaming");
    expect(slot?.chatId).toBe(created.id);
    expect(selectSlot(getChatRunContext(), "draft")).toBeUndefined();

    stream.push({ event: { type: "done" }, sequence: 5, type: "event" });
    stream.close();
    await run;
  });

  it("never stops the daemon run when a run simply ends", async () => {
    const created = chat(uniqueId("chat"));
    chats.create.mockResolvedValue(created);
    const stream = controllableStream();
    chatRuns.start.mockReturnValue(stream.iterate());

    const run = store.chatRunActions.startRun({
      input: {},
      message: userPrompt("hi"),
      slotKey: "draft",
    });
    await settle();
    stream.push({ event: { type: "done" }, sequence: 1, type: "event" });
    stream.close();
    await run;

    expect(chatRuns.stop).not.toHaveBeenCalled();
  });

  it("stops the daemon run only on an explicit Stop", async () => {
    const created = chat(uniqueId("chat"));
    chats.create.mockResolvedValue(created);
    const stream = controllableStream();
    chatRuns.start.mockReturnValue(stream.iterate());

    const run = store.chatRunActions.startRun({
      input: {},
      message: userPrompt("hi"),
      slotKey: "draft",
    });
    await settle();
    const runId = selectSlot(getChatRunContext(), created.id)?.activeRun?.runId;

    store.chatRunActions.cancelRun(created.id);
    await settle();

    expect(chatRuns.stop).toHaveBeenCalledTimes(1);
    expect(chatRuns.stop).toHaveBeenCalledWith(runId);
    expect(selectSlot(getChatRunContext(), created.id)?.status).toBe("idle");
    stream.close();
    await run;
  });

  it("reattaches to an in-flight run and rebuilds it from the snapshot", async () => {
    const chatId = uniqueId("chat");
    const runId = uniqueId("run");
    chatRuns.active.mockResolvedValue({ run: snapshot(chatId, runId) });
    const stream = controllableStream();
    chatRuns.observe.mockReturnValue(stream.iterate());

    store.chatRunActions.attachToActiveRun(chatId);
    await settle();

    expect(chatRuns.start).not.toHaveBeenCalled();
    expect(chatRuns.observe).toHaveBeenCalledWith(runId, expect.anything());
    const slot = selectSlot(getChatRunContext(), chatId);
    expect(slot?.status).toBe("streaming");
    expect(slot?.activeRun?.runId).toBe(runId);
    expect(slot?.messages.map((message) => message.id)).toEqual([
      `${runId}:user`,
    ]);
    expect(JSON.stringify(slot?.streamingAssistant?.content)).toContain(
      "half a thought",
    );

    stream.close();
    await settle();
  });

  it("leaves the slot alone when the daemon reports no active run", async () => {
    const chatId = uniqueId("chat");
    chatRuns.active.mockResolvedValue({ run: null });

    store.chatRunActions.attachToActiveRun(chatId);
    await settle();

    expect(chatRuns.observe).not.toHaveBeenCalled();
    expect(selectSlot(getChatRunContext(), chatId)).toBeUndefined();
  });

  it("answers an elicitation on the run route", async () => {
    const chatId = uniqueId("chat");
    const runId = uniqueId("run");
    chatRuns.active.mockResolvedValue({
      run: snapshot(chatId, runId, {
        pendingElicitation: {
          body: null,
          id: "elicit-1",
          kind: "approval",
          phase: "open",
          title: "Run it?",
        },
        status: "needsInput",
      }),
    });
    const stream = controllableStream();
    chatRuns.observe.mockReturnValue(stream.iterate());

    store.chatRunActions.attachToActiveRun(chatId);
    await settle();
    store.chatRunActions.resolveElicitation(
      chatId,
      { type: "allow" },
      "elicit-1",
    );
    await settle();

    expect(chatRuns.resolveElicitation).toHaveBeenCalledWith(runId, {
      elicitationId: "elicit-1",
      response: { type: "allow" },
    });

    stream.close();
    await settle();
  });
});
