import type { Chat, ChatSendResult } from "@angel-engine/daemon-api/chat";
import type { AppDatabase } from "./platform/db";
import type { DaemonRuntime } from "./platform/runtime";

import { Effect, Layer, ManagedRuntime } from "effect";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { registerApi } from "./api";
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

describe("daemon chat streams", () => {
  it("streams runtime events and publishes the global feed", async () => {
    const publish = vi.fn();
    const app = new Hono();
    registerApi(app, fakeDaemonRuntime(), { publish });

    const response = await app.request("/api/chat-streams?streamId=stream-1", {
      body: JSON.stringify({ text: "hello" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const body = await response.text();

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(body).toContain('"type":"delta"');
    expect(body).toContain('"type":"result"');
    expect(body).toContain('"type":"done"');
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ streamId: "stream-1", type: "chat-stream" }),
    );
  });

  it("publishes chat metadata changes for non-stream clients", async () => {
    const publish = vi.fn();
    const app = new Hono();
    registerApi(
      app,
      fakeDaemonRuntime({
        createChatFromInput: () => Effect.succeed(chat),
      }),
      { publish },
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
        new Db({ database: undefined as unknown as AppDatabase }),
      ),
      ProcessRegistryService.Default,
      TerminalService.Default,
    ),
  );
}
