import type {
  Chat,
  ChatAmbiguousRunSnapshot,
  ChatSendInput,
  ChatSendResult,
} from "@angel-engine/daemon-api/chat";
import type { DaemonGlobalEvent } from "@angel-engine/daemon-api";
import type { DaemonRuntime } from "./platform/runtime";

import { Effect, Layer, ManagedRuntime } from "effect";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { registerApi } from "./api";
import { chats, customAgents, projects } from "./db/schema";
import { createChatEvents } from "./features/chat/chat-events";
import { ChatEngine } from "./features/chat/engine-runtime";
import { TerminalService } from "./features/terminal/manager";
import { type AppDatabase, Db } from "./platform/db";
import { DaemonError } from "./platform/errors";
import { ProcessRegistryService } from "./processes";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })),
  );
});

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
  it("makes a restart-ambiguous send discoverable and clearable by chat", async () => {
    let ambiguous: ChatAmbiguousRunSnapshot | null = {
      chatId: chat.id,
      createdAt: "2026-08-10T00:00:00.000Z",
      runId: "run-ambiguous",
      status: "dispatching" as const,
    };
    const queueChatRun = vi.fn(() => Effect.succeed(true));
    const streamChat = vi.fn(() => Effect.succeed(result));
    const app = new Hono();
    registerApi(
      app,
      fakeDaemonRuntime({
        ambiguousQueuedChatRun: () => Effect.succeed({ run: ambiguous }),
        beginQueuedChatRunDispatch: () => Effect.succeed("claimed" as const),
        cancelAmbiguousQueuedChatRun: () =>
          Effect.sync(() => {
            const cancelled = ambiguous ? { runId: ambiguous.runId } : null;
            ambiguous = null;
            return cancelled;
          }),
        completeQueuedChatRun: () => Effect.succeed(undefined as never),
        queueChatRun,
        streamChat,
      }),
      createChatEvents({ publish: vi.fn() }),
    );

    await expect(
      (await app.request(`/api/chats/${chat.id}/active-run`)).json(),
    ).resolves.toEqual({ run: null });
    await expect(
      (await app.request(`/api/chats/${chat.id}/ambiguous-run`)).json(),
    ).resolves.toMatchObject({ run: { runId: "run-ambiguous" } });
    await expect(
      (
        await app.request(`/api/chats/${chat.id}/ambiguous-run`, {
          method: "DELETE",
        })
      ).json(),
    ).resolves.toEqual({ cleared: true });
    await expect(
      (await app.request(`/api/chats/${chat.id}/ambiguous-run`)).json(),
    ).resolves.toEqual({ run: null });

    const response = await app.request("/api/chat-runs/run-replacement", {
      body: JSON.stringify({ chatId: chat.id, text: "send again" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(streamChat).toHaveBeenCalledOnce());
    expect(queueChatRun).toHaveBeenCalledOnce();
  });

  it.each([
    "running",
    "failed",
  ] as const)("restores a queued first input exactly once after a daemon restart during setup %s", async (setupStatus) => {
    let currentSetupStatus: "failed" | "ready" | "running" = setupStatus;
    let releaseSetup!: () => void;
    const setupGate = new Promise<void>((resolve) => {
      releaseSetup = resolve;
    });
    const beginQueuedChatRunDispatch = vi.fn((_runId: string) =>
      Effect.succeed("claimed" as const),
    );
    const completeQueuedChatRun = vi.fn((_runId: string) =>
      Effect.succeed(undefined as never),
    );
    let streamedInput: ChatSendInput | undefined;
    const streamChat = vi.fn((input: ChatSendInput) => {
      streamedInput = input;
      return Effect.succeed(result);
    });
    const waitForChatSetup = vi.fn((_chatId: string, _signal?: AbortSignal) =>
      Effect.promise(async () => {
        expect(currentSetupStatus).toBe(setupStatus);
        await setupGate;
        expect(currentSetupStatus).toBe("ready");
        return undefined;
      }),
    );
    const app = new Hono();
    registerApi(
      app,
      fakeDaemonRuntime({
        beginQueuedChatRunDispatch,
        completeQueuedChatRun,
        restoreQueuedChatRuns: () =>
          Effect.succeed([
            {
              createdAt: "2026-08-10T00:00:00.000Z",
              input: { chatId: chat.id, text: "queued input" },
              runId: "run-restored",
              state: "queued" as const,
            },
          ]),
        streamChat,
        waitForChatSetup,
      }),
      createChatEvents({ publish: vi.fn() }),
    );

    await vi.waitFor(() => expect(waitForChatSetup).toHaveBeenCalledOnce());
    expect(streamChat).not.toHaveBeenCalled();

    currentSetupStatus = "ready";
    releaseSetup();

    await vi.waitFor(() => expect(streamChat).toHaveBeenCalledOnce());
    expect(beginQueuedChatRunDispatch).toHaveBeenCalledOnce();
    expect(completeQueuedChatRun).toHaveBeenCalledOnce();
    expect(streamedInput).toMatchObject({
      chatId: chat.id,
      text: "queued input",
    });
  });

  it("sends the original queued input once after worktree creation retry succeeds", async () => {
    let creationState: "failed" | "ready" = "failed";
    let releaseRetry!: () => void;
    const retryGate = new Promise<void>((resolve) => {
      releaseRetry = resolve;
    });
    const streamChat = vi.fn((_input: ChatSendInput) => Effect.succeed(result));
    const waitForChatSetup = vi.fn(() =>
      Effect.promise(async () => {
        expect(creationState).toBe("failed");
        await retryGate;
        expect(creationState).toBe("ready");
        return undefined;
      }),
    );
    const app = new Hono();
    registerApi(
      app,
      fakeDaemonRuntime({
        beginQueuedChatRunDispatch: () => Effect.succeed("claimed" as const),
        completeQueuedChatRun: () => Effect.succeed(undefined as never),
        queueChatRun: () => Effect.succeed(true),
        retryWorktreeCreation: () => {
          creationState = "ready";
          releaseRetry();
          return Effect.succeed(chat);
        },
        streamChat,
        waitForChatSetup,
      }),
      createChatEvents({ publish: vi.fn() }),
    );

    const response = await app.request("/api/chat-runs/run-retry", {
      body: JSON.stringify({ chatId: chat.id, text: "original input" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const body = response.text();
    await vi.waitFor(() => expect(waitForChatSetup).toHaveBeenCalledOnce());
    expect(streamChat).not.toHaveBeenCalled();

    const retried = await app.request(
      `/api/chats/${chat.id}/worktree-creation/retry`,
      { method: "POST" },
    );

    expect(retried.status).toBe(200);
    await expect(body).resolves.toContain('"type":"done"');
    expect(streamChat).toHaveBeenCalledOnce();
    expect(streamChat.mock.calls[0]?.[0]).toMatchObject({
      chatId: chat.id,
      text: "original input",
    });
  });

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

  it("forwards list-importable-sessions and import/open to the chat engine", async () => {
    const listImportableSessions = vi.fn(() =>
      Effect.succeed({
        nextCursor: null,
        sessions: [
          {
            cwd: "/repo",
            remoteId: "remote-1",
            title: "Imported",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        unsupportedReason: null,
      }),
    );
    const importedChat = {
      ...chat,
      remoteThreadId: "remote-1",
      title: "Imported",
    };
    const importChat = vi.fn(() =>
      Effect.succeed({
        chat: importedChat,
        config: {
          modes: [],
          models: [],
          permissionModes: [],
          reasoningEfforts: [],
        },
        messages: [],
      }),
    );
    const publish = vi.fn();
    const app = new Hono();
    registerApi(
      app,
      fakeDaemonRuntime({ importChat, listImportableSessions }),
      createChatEvents({ publish }),
    );

    const listed = await app.request("/api/sessions/importable", {
      body: JSON.stringify({ cwd: "/repo", runtime: "codex" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toMatchObject({
      sessions: [{ remoteId: "remote-1" }],
    });
    expect(listImportableSessions).toHaveBeenCalledWith({
      cwd: "/repo",
      runtime: "codex",
    });

    const imported = await app.request("/api/sessions/import", {
      body: JSON.stringify({
        cwd: "/repo",
        remoteThreadId: "remote-1",
        runtime: "codex",
        title: "Imported",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(imported.status).toBe(200);
    await expect(imported.json()).resolves.toMatchObject({
      chat: { remoteThreadId: "remote-1" },
    });
    expect(importChat).toHaveBeenCalledWith(
      expect.objectContaining({
        remoteThreadId: "remote-1",
        runtime: "codex",
      }),
      expect.any(AbortSignal),
    );
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: "chat-metadata-changed" }),
    );
  });
});

describe("project deletion", () => {
  const projectRow = { id: "project-1", path: "/tmp/project-1" };
  const linkedChatRow = {
    archived: false,
    createdAt: "2026-07-13T00:00:00.000Z",
    cwd: null,
    id: "chat-linked",
    pinned: false,
    projectId: "project-1",
    remoteThreadId: null,
    runtime: "codex",
    title: "Linked",
    updatedAt: "2026-07-13T00:00:00.000Z",
  };

  async function projectDatabase() {
    const dir = await mkdtemp(path.join(os.tmpdir(), "angel-api-projects-"));
    tempDirs.push(dir);
    const client = createClient({
      url: pathToFileURL(path.join(dir, "test.sqlite")).href,
    });
    await client.execute("PRAGMA foreign_keys = ON");
    await client.execute(
      "CREATE TABLE projects (id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE)",
    );
    await client.execute(`CREATE TABLE chats (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      cwd TEXT,
      runtime TEXT NOT NULL,
      remote_thread_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      pinned INTEGER NOT NULL DEFAULT 0
    )`);
    const database = drizzle(client, {
      schema: { chats, customAgents, projects },
    }) as AppDatabase;
    await database.insert(projects).values(projectRow);
    await database.insert(chats).values(linkedChatRow);
    return database;
  }

  function projectDeleteApp(
    database: AppDatabase,
    overrides: Partial<ChatEngineValue>,
    publish: (event: DaemonGlobalEvent) => void,
  ) {
    const app = new Hono();
    app.onError((error, context) =>
      error instanceof DaemonError
        ? context.json({ code: error.code }, error.status)
        : context.json({ code: "internal" }, 500),
    );
    registerApi(
      app,
      fakeDaemonRuntime(overrides, database),
      createChatEvents({ publish }),
    );
    return app;
  }

  it("requires the confirmation revision before deleting anything", async () => {
    const database = await projectDatabase();
    const app = projectDeleteApp(database, {}, vi.fn());

    const response = await app.request(`/api/projects/${projectRow.id}`, {
      method: "DELETE",
    });

    expect(response.status).toBe(400);
    await expect(database.select().from(projects).all()).resolves.toHaveLength(
      1,
    );
    await expect(database.select().from(chats).all()).resolves.toHaveLength(1);
  });

  it("rejects a stale revision and closes no sessions", async () => {
    const database = await projectDatabase();
    const closeChatSession = vi.fn(() => Effect.void);
    const finishChatDeletion = vi.fn(() => Effect.void);
    const app = projectDeleteApp(
      database,
      { closeChatSession, finishChatDeletion },
      vi.fn(),
    );

    const response = await app.request(`/api/projects/${projectRow.id}`, {
      body: JSON.stringify({ expectedRevision: "stale-revision" }),
      headers: { "content-type": "application/json" },
      method: "DELETE",
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: "project-delete-conflict",
    });
    expect(closeChatSession).not.toHaveBeenCalled();
    expect(finishChatDeletion).not.toHaveBeenCalled();
    await expect(database.select().from(projects).all()).resolves.toHaveLength(
      1,
    );
    await expect(database.select().from(chats).all()).resolves.toHaveLength(1);
  });

  it("deletes the linked chats, closes their sessions, and publishes metadata", async () => {
    const database = await projectDatabase();
    const closeChatSession = vi.fn((_chatId?: string) => Effect.void);
    const finishChatDeletion = vi.fn((_chatId: string) => Effect.void);
    const publish = vi.fn();
    const app = projectDeleteApp(
      database,
      { closeChatSession, finishChatDeletion },
      publish,
    );

    const impactResponse = await app.request(
      `/api/projects/${projectRow.id}/delete-impact`,
    );
    expect(impactResponse.status).toBe(200);
    const impact = (await impactResponse.json()) as {
      chatCount: number;
      revision: string;
    };
    expect(impact.chatCount).toBe(1);

    const response = await app.request(`/api/projects/${projectRow.id}`, {
      body: JSON.stringify({ expectedRevision: impact.revision }),
      headers: { "content-type": "application/json" },
      method: "DELETE",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      deletedChatCount: 1,
      deletedWorktreeCount: 0,
    });
    expect(closeChatSession).toHaveBeenCalledWith(linkedChatRow.id);
    expect(finishChatDeletion).toHaveBeenCalledWith(linkedChatRow.id);
    await expect(database.select().from(projects).all()).resolves.toHaveLength(
      0,
    );
    await expect(database.select().from(chats).all()).resolves.toHaveLength(0);
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: "chat-metadata-changed" }),
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
  database?: AppDatabase,
): DaemonRuntime {
  const unsupported = () =>
    Effect.die(DaemonError.internal(new Error("Not used in this test.")));
  const engine: ChatEngineValue = {
    ambiguousQueuedChatRun: () => Effect.succeed({ run: null }),
    beginQueuedChatRunDispatch: () => Effect.succeed("not_queued" as const),
    cancelAmbiguousQueuedChatRun: () => Effect.succeed(null),
    cancelWorktreeCreation: unsupported,
    cancelWorktreeCreationForDelete: () => Effect.void,
    cancelQueuedChatRun: () => Effect.succeed(null),
    closeChatSession: () => Effect.void,
    completeQueuedChatRun: () => Effect.succeed(undefined as never),
    createChatFromInput: unsupported,
    decorateChats: (chats) => Effect.succeed(chats),
    finishChatDeletion: () => Effect.void,
    importChat: unsupported,
    inspectChatRuntimeConfig: unsupported,
    listImportableSessions: unsupported,
    loadChatSession: unsupported,
    prewarmChat: unsupported,
    queueChatRun: () => Effect.succeed(false),
    restoreQueuedChatRuns: () => Effect.succeed([]),
    retryWorktreeCreation: unsupported,
    sendChat: unsupported,
    setChatMode: unsupported,
    setChatPermissionMode: unsupported,
    setChatRuntime: unsupported,
    streamChat: (_input, onEvent) =>
      Effect.sync(() => {
        onEvent?.({ part: "text", text: "hello", type: "delta" });
        return result;
      }),
    waitForChatSetup: () => Effect.succeed(undefined),
    ...overrides,
  };

  return ManagedRuntime.make(
    Layer.mergeAll(
      Layer.succeed(ChatEngine, new ChatEngine(engine)),
      Layer.succeed(
        Db,
        new Db({
          database: database
            ? Effect.succeed(database)
            : // The fake engine never touches the database.
              Effect.die("Database is not used in this test."),
        }),
      ),
      ProcessRegistryService.Default,
      TerminalService.Default,
    ),
  );
}
