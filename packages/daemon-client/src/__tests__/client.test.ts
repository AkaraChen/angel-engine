import type { Mock } from "vitest";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createDaemonClient, DaemonRequestError } from "../index";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function firstRequestHeaders(fetchMock: Mock): Headers {
  const init = (fetchMock.mock.calls[0]?.[1] ?? {}) as RequestInit;
  return new Headers(init.headers);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createDaemonClient", () => {
  it("requests same-origin /api paths when base URL is empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const client = createDaemonClient({ baseUrl: "", token: null });
    await client.health();

    expect(fetchMock.mock.calls[0][0]).toBe("/api/health");
  });

  it("uses generic source-control change-request routes", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => jsonResponse(null));
    vi.stubGlobal("fetch", fetchMock);

    const client = createDaemonClient({ baseUrl: "", token: null });
    await client.sourceControl.currentChangeRequest("/repo with spaces");
    await client.sourceControl.getChangeRequest("/repo with spaces", "42/part");

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/source-control/change-requests/current?projectPath=%2Frepo+with+spaces",
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "/api/source-control/change-requests/42%2Fpart?projectPath=%2Frepo+with+spaces",
    );
  });

  it("injects a bearer token when one is configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ version: "1" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = createDaemonClient({ baseUrl: "", token: "secret" });
    await client.health();

    const headers = firstRequestHeaders(fetchMock);
    expect(headers.get("authorization")).toBe("Bearer secret");
  });

  it("omits the authorization header when there is no token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ version: "1" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = createDaemonClient({ baseUrl: "", token: null });
    await client.health();

    const headers = firstRequestHeaders(fetchMock);
    expect(headers.has("authorization")).toBe(false);
  });

  it("parses a JSON body on success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ pid: 7, uptime: 1, version: "0.1.0" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = createDaemonClient({ baseUrl: "", token: null });
    await expect(client.health()).resolves.toEqual({
      pid: 7,
      uptime: 1,
      version: "0.1.0",
    });
  });

  it("requests runtime config for the selected runtime and project path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        canSetModel: true,
        canSetReasoningEffort: true,
        currentModel: "sonnet",
        currentReasoningEffort: "high",
        models: [{ label: "Sonnet", value: "sonnet" }],
        reasoningEfforts: [{ label: "High", value: "high" }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createDaemonClient({ baseUrl: "", token: null });
    await client.chats.inspectConfig({ cwd: "/repo", runtime: "claude" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chats/runtime-config",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ cwd: "/repo", runtime: "claude" }),
      }),
    );
  });

  it("sends a chat message through POST /api/chats/send", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        chat: { id: "c1" },
        chatId: "c1",
        content: [],
        text: "ok",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createDaemonClient({ baseUrl: "", token: null });
    await client.chats.send({ chatId: "c1", text: "hello" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chats/send",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ chatId: "c1", text: "hello" }),
      }),
    );
  });

  it("uses daemon automation routes for mutations and history", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const client = createDaemonClient({ baseUrl: "", token: null });
    await client.automations.update("automation/1", { enabled: false });
    await client.automations.listRuns("automation/1", 25);
    await client.automations.runNow("automation/1");

    expect(fetchMock.mock.calls[0]).toEqual([
      "/api/automations/automation%2F1",
      expect.objectContaining({
        body: JSON.stringify({ enabled: false }),
        method: "PATCH",
      }),
    ]);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "/api/automations/automation%2F1/runs?limit=25",
    );
    expect(fetchMock.mock.calls[2]).toEqual([
      "/api/automations/automation%2F1/run",
      expect.objectContaining({ method: "POST" }),
    ]);
  });

  it("lists and acknowledges daemon-owned chat attention", async () => {
    const attention = {
      chatId: "chat-1",
      id: "run-1:completed",
      status: "completed",
      updatedAt: "2026-07-25T01:00:00.000Z",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ attentions: [attention] }))
      .mockResolvedValueOnce(jsonResponse({ read: true }));
    vi.stubGlobal("fetch", fetchMock);

    const client = createDaemonClient({ baseUrl: "", token: null });
    await expect(client.attention.list()).resolves.toEqual({
      attentions: [attention],
    });
    await expect(
      client.attention.read("chat-1", {
        attentionId: "run-1:completed",
      }),
    ).resolves.toEqual({ read: true });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/chat-attention");
    expect(fetchMock.mock.calls[1]).toEqual([
      "/api/chats/chat-1/attention/read",
      expect.objectContaining({
        body: JSON.stringify({ attentionId: "run-1:completed" }),
        method: "POST",
      }),
    ]);
  });

  it("lists and acknowledges daemon-owned chat activity", async () => {
    const activity = {
      chatId: "chat-1",
      runId: "run-1",
      status: "running",
      updatedAt: "2026-07-25T01:00:00.000Z",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ items: [activity] }))
      .mockResolvedValueOnce(jsonResponse({ read: true }));
    vi.stubGlobal("fetch", fetchMock);

    const client = createDaemonClient({ baseUrl: "", token: null });
    await expect(client.activity.list()).resolves.toEqual({
      items: [activity],
    });
    await expect(
      client.activity.read("chat-1", { attentionId: "run-1:done" }),
    ).resolves.toEqual({ read: true });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/chat-activity");
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "/api/chats/chat-1/attention/read",
    );
  });

  it("rejects a malformed chat activity snapshot", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          items: [
            {
              chatId: "chat-1",
              runId: "run-1",
              status: "future-status",
              updatedAt: "2026-07-25T01:00:00.000Z",
            },
          ],
        }),
      ),
    );

    const client = createDaemonClient({ baseUrl: "", token: null });
    await expect(client.activity.list()).rejects.toBeInstanceOf(
      DaemonRequestError,
    );
  });

  it("rejects a malformed chat attention snapshot", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          attentions: [
            {
              chatId: "chat-1",
              id: "run-1",
              status: "future-status",
              updatedAt: "2026-07-25T01:00:00.000Z",
            },
          ],
        }),
      ),
    );

    const client = createDaemonClient({ baseUrl: "", token: null });
    await expect(client.attention.list()).rejects.toBeInstanceOf(
      DaemonRequestError,
    );
  });

  it("throws a legible error when the response is HTML (static fallback)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("<!doctype html><html></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createDaemonClient({ baseUrl: "", token: null });
    await expect(client.health()).rejects.toBeInstanceOf(DaemonRequestError);
  });

  it("throws on a non-2xx response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("nope", {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createDaemonClient({ baseUrl: "", token: null });
    await expect(client.health()).rejects.toMatchObject({ status: 401 });
  });

  it("surfaces the daemon error code from the payload", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { code: "chat-not-found", error: "Chat not found." },
          { status: 404 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const client = createDaemonClient({ baseUrl: "", token: null });
    await expect(client.chats.load("missing")).rejects.toMatchObject({
      code: "chat-not-found",
      message: "Chat not found.",
      status: 404,
    });
  });

  it("notifies onUnauthorized on 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ error: "Unauthorized" }, { status: 401 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const onUnauthorized = vi.fn();

    const client = createDaemonClient({
      baseUrl: "",
      onUnauthorized,
      token: "t",
    });
    await expect(client.health()).rejects.toBeInstanceOf(DaemonRequestError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});
