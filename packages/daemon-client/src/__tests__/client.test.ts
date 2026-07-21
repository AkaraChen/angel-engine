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
