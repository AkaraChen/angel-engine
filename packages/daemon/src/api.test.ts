import type { Chat, ChatSendResult } from "@angel-engine/daemon-api/chat";
import type { ChatRuntime } from "./features/chat/runtime";

import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { registerApi } from "./api";

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
    const runtime = fakeRuntime();
    const app = new Hono();
    registerApi(app, runtime, { publish });

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
    const runtime = fakeRuntime();
    runtime.createChatFromInput = vi.fn(() => chat);
    const app = new Hono();
    registerApi(app, runtime, { publish });

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

function fakeRuntime(): ChatRuntime {
  const unsupported = () => {
    throw new Error("Not used in this test.");
  };
  return {
    closeChatSession: vi.fn(),
    createChatFromInput: unsupported,
    inspectChatRuntimeConfig: unsupported,
    loadChatSession: unsupported,
    prewarmChat: unsupported,
    sendChat: unsupported,
    setChatMode: unsupported,
    setChatPermissionMode: unsupported,
    setChatRuntime: unsupported,
    async streamChat(_input, onEvent) {
      onEvent({ part: "text", text: "hello", type: "delta" });
      return result;
    },
  };
}
