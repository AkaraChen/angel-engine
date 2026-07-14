import type { PairingError } from "./session";

import { afterEach, describe, expect, it, vi } from "vitest";

import { readStoredToken, requestPairing, writeStoredToken } from "./session";

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("session token storage", () => {
  it("round-trips a token and clears it with null", () => {
    expect(readStoredToken()).toBeNull();
    writeStoredToken("tok-123");
    expect(readStoredToken()).toBe("tok-123");
    writeStoredToken(null);
    expect(readStoredToken()).toBeNull();
  });
});

describe("requestPairing", () => {
  it("posts the password and returns the issued token", async () => {
    const fetchMock = vi.fn(async () =>
      Promise.resolve(
        new Response(JSON.stringify({ token: "session-abc" }), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const token = await requestPairing("", "hunter2");
    expect(token).toBe("session-abc");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/auth/pair");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ password: "hunter2" });
  });

  it("throws invalid-password on 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.resolve(new Response(null, { status: 401 }))),
    );
    await expect(requestPairing("", "wrong")).rejects.toMatchObject({
      reason: "invalid-password",
    } satisfies Partial<PairingError>);
  });

  it("throws server-error when the network fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("network down"))),
    );
    await expect(requestPairing("", "hunter2")).rejects.toMatchObject({
      reason: "server-error",
    } satisfies Partial<PairingError>);
  });
});
