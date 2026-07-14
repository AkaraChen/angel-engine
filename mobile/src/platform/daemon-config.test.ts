import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveDaemonConfig } from "./daemon-config";

afterEach(() => {
  vi.unstubAllEnvs();
  delete window.__ANGEL_DAEMON__;
});

describe("resolveDaemonConfig", () => {
  it("defaults to same-origin root with no token and no auth", () => {
    expect(resolveDaemonConfig()).toEqual({
      baseUrl: "",
      requiresAuth: false,
      token: null,
    });
  });

  it("prefers the host-injected base URL", () => {
    window.__ANGEL_DAEMON__ = { baseUrl: "http://127.0.0.1:8721/" };
    expect(resolveDaemonConfig()).toEqual({
      baseUrl: "http://127.0.0.1:8721",
      requiresAuth: false,
      token: null,
    });
  });

  it("reads the requiresAuth flag injected by the daemon", () => {
    window.__ANGEL_DAEMON__ = { requiresAuth: true };
    expect(resolveDaemonConfig()).toEqual({
      baseUrl: "",
      requiresAuth: true,
      token: null,
    });
  });

  it("never reads a token from the injected config", () => {
    // A token must never be injected into the served page; ignore it if present.
    window.__ANGEL_DAEMON__ = {
      requiresAuth: true,
    };
    (window.__ANGEL_DAEMON__ as { token?: string }).token = "should-be-ignored";
    expect(resolveDaemonConfig().token).toBeNull();
  });

  it("falls back to Vite env vars for dev", () => {
    vi.stubEnv("VITE_DAEMON_URL", "http://localhost:9000");
    vi.stubEnv("VITE_DAEMON_TOKEN", "dev-token");
    expect(resolveDaemonConfig()).toEqual({
      baseUrl: "http://localhost:9000",
      requiresAuth: false,
      token: "dev-token",
    });
  });

  it("lets host injection win over env vars", () => {
    vi.stubEnv("VITE_DAEMON_URL", "http://localhost:9000");
    window.__ANGEL_DAEMON__ = { baseUrl: "http://injected:1234" };
    expect(resolveDaemonConfig().baseUrl).toBe("http://injected:1234");
  });

  it("normalizes a bare slash base URL to same-origin", () => {
    window.__ANGEL_DAEMON__ = { baseUrl: "/" };
    expect(resolveDaemonConfig().baseUrl).toBe("");
  });
});
