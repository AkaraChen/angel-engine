import type { Chat, ChatSendResult } from "@angel-engine/daemon-api/chat";
import type { DaemonGlobalEvent } from "@angel-engine/daemon-api";
import type { DaemonRuntime } from "./platform/runtime";

import { Effect, Layer, ManagedRuntime } from "effect";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { registerApi } from "./api";
import { createChatEvents } from "./features/chat/chat-events";
import { ChatEngine } from "./features/chat/engine-runtime";
import { TerminalService } from "./features/terminal/manager";
import { Db } from "./platform/db";
import { DaemonError } from "./platform/errors";
import { ProcessRegistryService } from "./processes";

const chat: Chat = {
  archived: false,
  createdAt: "2026-07-13T00:00:00.000Z",
  cwd: "/tmp",
  id: "chat-1",
  pinned: false,
  projectId: null,
  remoteThreadId: null,
  runtime: "codex",
  title: "Test",
  updatedAt: "2026-07-13T00:00:00.000Z",
};

const result: ChatSendResult = {
  chat,
  chatId: chat.id,
  content: [{ text: "done", type: "text" }],
  text: "done",
};

describe("daemon chat runs", () => {
  it("starts a daemon-owned run with a snapshot-first observer stream", async () => {
    const publish = vi.fn();
    const app = new Hono();
    registerApi(app, fakeDaemonRuntime(), createChatEvents({ publish }));

    const response = await app.request("/api/chat-runs/run-1", {
      body: JSON.stringify({ chatId: "chat-1", text: "hello" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const body = await response.text();

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(body.indexOf('"type":"snapshot"')).toBeLessThan(
      body.indexOf('"type":"event"'),
    );
    expect(body).toContain('"sequence":1');
    expect(body).toContain('"sequence":3');
    expect(body).toContain('"type":"result"');
    expect(body).toContain('"type":"done"');
    expect(publish).toHaveBeenCalledWith({
      chatIds: ["chat-1"],
      type: "chat-activity-changed",
    });
    expect(publish).toHaveBeenCalledWith({
      chatIds: ["chat-1"],
      type: "chat-attention-changed",
    });
  });

  it("keeps completed attention until the exact marker is read", async () => {
    const publish = vi.fn();
    const app = new Hono();
    registerApi(app, fakeDaemonRuntime(), createChatEvents({ publish }));

    const run = await app.request("/api/chat-runs/run-attention", {
      body: JSON.stringify({ chatId: chat.id, text: "hello" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    await run.text();

    await expect(
      (await app.request("/api/chat-attention")).json(),
    ).resolves.toEqual({
      attentions: [
        {
          chatId: chat.id,
          id: "run-attention:done",
          status: "completed",
          updatedAt: expect.any(String),
        },
      ],
    });

    const staleRead = await app.request(
      `/api/chats/${chat.id}/attention/read`,
      {
        body: JSON.stringify({ attentionId: "stale" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );
    await expect(staleRead.json()).resolves.toEqual({ read: false });
    await expect(
      (await app.request("/api/chat-attention")).json(),
    ).resolves.toMatchObject({
      attentions: [{ id: "run-attention:done" }],
    });

    const read = await app.request(`/api/chats/${chat.id}/attention/read`, {
      body: JSON.stringify({ attentionId: "run-attention:done" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    await expect(read.json()).resolves.toEqual({ read: true });
    await expect(
      (await app.request("/api/chat-attention")).json(),
    ).resolves.toEqual({ attentions: [] });
    await expect(
      (await app.request("/api/chat-activity")).json(),
    ).resolves.toEqual({ items: [] });
  });

  it("keeps late-success input resolvable through the run API", async () => {
    const resolveElicitation = vi.fn().mockResolvedValue(undefined);
    const app = new Hono();
    registerApi(
      app,
      fakeDaemonRuntime({
        streamChat: (_input, onEvent, _signal, controls) =>
          Effect.sync(() => {
            controls?.setResolveElicitation?.(resolveElicitation);
            onEvent?.({
              elicitation: {
                body: "Continue?",
                id: "elic-1",
                kind: "approval",
                phase: "open",
                title: "Permission",
              },
              type: "elicitation",
            });
            return result;
          }),
      }),
      createChatEvents({ publish: vi.fn() }),
    );

    const response = await app.request("/api/chat-runs/run-late-success", {
      body: JSON.stringify({ chatId: chat.id, text: "hello" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const body = response.text();
    await vi.waitFor(async () => {
      await expect(
        (await app.request("/api/chat-activity")).json(),
      ).resolves.toMatchObject({
        items: [
          {
            attentionId: "run-late-success:input:elic-1",
            status: "waiting_for_you",
          },
        ],
      });
    });

    const resolved = await app.request(
      "/api/chat-runs/run-late-success/elicitation",
      {
        body: JSON.stringify({
          elicitationId: "elic-1",
          response: { type: "allow" },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );

    expect(resolved.status).toBe(200);
    await expect(resolved.json()).resolves.toEqual({ resolved: true });
    expect(resolveElicitation).toHaveBeenCalledWith("elic-1", {
      type: "allow",
    });
    expect(await body).toContain('"type":"done"');
    await expect(
      (await app.request("/api/chat-activity")).json(),
    ).resolves.toMatchObject({
      items: [{ runId: "run-late-success", status: "done" }],
    });
    await expect(
      (await app.request(`/api/chats/${chat.id}/active-run`)).json(),
    ).resolves.toEqual({ run: null });
  });

  it("keeps a run active until explicit stop aborts its provider", async () => {
    let providerSignal: AbortSignal | undefined;
    const app = new Hono();
    registerApi(
      app,
      fakeDaemonRuntime({
        streamChat: (_input, _onEvent, signal) => {
          if (signal === undefined) {
            return Effect.fail(
              DaemonError.internal(new Error("Expected an abort signal.")),
            );
          }
          return Effect.async<ChatSendResult, DaemonError>((resume) => {
            providerSignal = signal;
            const abort = () =>
              resume(
                Effect.fail(
                  DaemonError.sessionFailed(new Error("run cancelled")),
                ),
              );
            signal.addEventListener("abort", abort, { once: true });
            return Effect.sync(() =>
              signal.removeEventListener("abort", abort),
            );
          });
        },
      }),
      createChatEvents({ publish: vi.fn() }),
    );

    const response = await app.request("/api/chat-runs/run-1", {
      body: JSON.stringify({ chatId: "chat-1", text: "hello" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const bodyPromise = response.text();
    await vi.waitFor(() => expect(providerSignal).toBeDefined());

    const active = await app.request("/api/chats/chat-1/active-run");
    expect(await active.json()).toMatchObject({
      run: { chatId: "chat-1", runId: "run-1", status: "running" },
    });
    await expect(
      (await app.request("/api/chat-activity")).json(),
    ).resolves.toMatchObject({
      items: [{ chatId: "chat-1", runId: "run-1", status: "running" }],
    });
    expect(providerSignal?.aborted).toBe(false);

    const stopped = await app.request("/api/chat-runs/run-1", {
      method: "DELETE",
    });
    expect(stopped.status).toBe(200);
    expect(providerSignal?.aborted).toBe(true);
    expect(await bodyPromise).toContain('"type":"done"');
    await expect(
      (await app.request("/api/chat-activity")).json(),
    ).resolves.toEqual({ items: [] });
    await vi.waitFor(async () => {
      const after = await app.request("/api/chats/chat-1/active-run");
      expect(await after.json()).toEqual({ run: null });
    });
  });

  it("streams runtime events over a chat run", async () => {
    const app = new Hono();
    registerApi(
      app,
      fakeDaemonRuntime(),
      createChatEvents({ publish: vi.fn() }),
    );

    const response = await app.request("/api/chat-runs/run-1", {
      body: JSON.stringify({ chatId: "chat-1", text: "hello" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const body = await response.text();

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(body).toContain('"type":"snapshot"');
    expect(body).toContain('"type":"delta"');
    expect(body).toContain('"type":"result"');
    expect(body).toContain('"type":"done"');
  });

  it("publishes chat metadata changes to observers", async () => {
    const publish = vi.fn();
    const app = new Hono();
    registerApi(
      app,
      fakeDaemonRuntime({
        createChatFromInput: () => Effect.succeed(chat),
      }),
      createChatEvents({ publish }),
    );

    const response = await app.request("/api/chats", {
      body: "{}",
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(publish).toHaveBeenCalledWith({
      chatIds: [chat.id],
      type: "chat-metadata-changed",
    });
  });

  it("publishes a conversation change when a run starts and when it settles", async () => {
    const publish = vi.fn();
    const app = new Hono();
    registerApi(app, fakeDaemonRuntime(), createChatEvents({ publish }));

    const response = await app.request("/api/chat-runs/run-conversation", {
      body: JSON.stringify({ chatId: chat.id, text: "hello" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    await response.text();

    // Once for the reserve (so other devices attach) and once for the settled
    // run (so devices that never attached refetch the grown history).
    const conversationEvents = publish.mock.calls
      .map((call) => call[0] as DaemonGlobalEvent)
      .filter((event) => event.type === "chat-conversation-changed");
    expect(conversationEvents).toEqual([
      { chatIds: [chat.id], type: "chat-conversation-changed" },
      { chatIds: [chat.id], type: "chat-conversation-changed" },
    ]);
  });

  it("publishes a conversation change when an in-flight run is cancelled", async () => {
    const publish = vi.fn();
    const app = new Hono();
    // A run that never settles on its own, so `DELETE` sees it as still active.
    registerApi(
      app,
      fakeDaemonRuntime({
        streamChat: (_input, onEvent) =>
          Effect.async<ChatSendResult, DaemonError>(() => {
            onEvent?.({ part: "text", text: "thinking", type: "delta" });
          }),
      }),
      createChatEvents({ publish }),
    );

    const response = await app.request("/api/chat-runs/run-cancel", {
      body: JSON.stringify({ chatId: chat.id, text: "hello" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    // Read one chunk instead of draining: draining would wait for a run that
    // never finishes. The first chunk proves the observer attached and the run
    // began, which is what makes the cancel below meaningful.
    const reader = response.body?.getReader();
    await reader?.read();
    publish.mockClear();

    const cancelled = await app.request("/api/chat-runs/run-cancel", {
      method: "DELETE",
    });

    expect(cancelled.status).toBe(200);
    expect(publish).toHaveBeenCalledWith({
      chatIds: [chat.id],
      type: "chat-conversation-changed",
    });

    await reader?.cancel();
  });

  it("forwards create input and the request abort signal to chat creation", async () => {
    const createChatFromInput = vi.fn(() => Effect.succeed(chat));
    const app = new Hono();
    registerApi(
      app,
      fakeDaemonRuntime({ createChatFromInput }),
      createChatEvents({ publish: vi.fn() }),
    );

    const response = await app.request("/api/chats", {
      body: JSON.stringify({
        prewarmId: "prewarm-1",
        runtime: "codex",
        worktreeSetupApproval: "approved",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(createChatFromInput).toHaveBeenCalledWith(
      expect.objectContaining({
        prewarmId: "prewarm-1",
        runtime: "codex",
        worktreeSetupApproval: "approved",
      }),
      expect.any(AbortSignal),
    );
  });
});

describe("managed worktrees", () => {
  it("rejects deleting a path outside the managed worktree root", async () => {
    const app = new Hono();
    app.onError((error, context) =>
      error instanceof DaemonError
        ? context.json({ code: error.code }, error.status)
        : context.json({ code: "internal" }, 500),
    );
    registerApi(
      app,
      fakeDaemonRuntime(),
      createChatEvents({ publish: vi.fn() }),
    );

    const response = await app.request("/api/worktrees/managed/delete", {
      body: JSON.stringify({
        targets: [
          {
            expectedChatIds: [],
            expectedExistsOnDisk: false,
            path: "/tmp/not-managed",
          },
        ],
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "worktree-not-managed",
    });
  });
});

type ChatEngineValue = Omit<Effect.Effect.Success<typeof ChatEngine>, "_tag">;

function fakeDaemonRuntime(
  overrides: Partial<ChatEngineValue> = {},
): DaemonRuntime {
  const unsupported = () =>
    Effect.die(DaemonError.internal(new Error("Not used in this test.")));
  const engine: ChatEngineValue = {
    closeChatSession: () => Effect.void,
    createChatFromInput: unsupported,
    inspectChatRuntimeConfig: unsupported,
    loadChatSession: unsupported,
    prewarmChat: unsupported,
    sendChat: unsupported,
    setChatMode: unsupported,
    setChatPermissionMode: unsupported,
    setChatRuntime: unsupported,
    streamChat: (_input, onEvent) =>
      Effect.sync(() => {
        onEvent?.({ part: "text", text: "hello", type: "delta" });
        return result;
      }),
    ...overrides,
  };

  return ManagedRuntime.make(
    Layer.mergeAll(
      Layer.succeed(ChatEngine, new ChatEngine(engine)),
      // The fake engine never touches the database.
      Layer.succeed(
        Db,
        new Db({ database: Effect.die("Database is not used in this test.") }),
      ),
      ProcessRegistryService.Default,
      TerminalService.Default,
    ),
  );
}
