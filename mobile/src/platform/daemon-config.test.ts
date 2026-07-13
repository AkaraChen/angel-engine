import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveDaemonConfig } from "./daemon-config";

afterEach(() => {
  vi.unstubAllEnvs();
  delete window.__ANGEL_DAEMON__;
});

describe("resolveDaemonConfig", () => {
  it("defaults to same-origin root with no token", () => {
    expect(resolveDaemonConfig()).toEqual({ baseUrl: "", token: null });
  });

  it("prefers the host-injected base URL and token", () => {
    window.__ANGEL_DAEMON__ = {
      baseUrl: "http://127.0.0.1:8721/",
      token: "abc",
    };
    expect(resolveDaemonConfig()).toEqual({
      baseUrl: "http://127.0.0.1:8721",
      token: "abc",
    });
  });

  it("injects a token while staying same-origin when only a token is given", () => {
    window.__ANGEL_DAEMON__ = { token: "same-origin-token" };
    expect(resolveDaemonConfig()).toEqual({
      baseUrl: "",
      token: "same-origin-token",
    });
  });

  it("falls back to Vite env vars for dev", () => {
    vi.stubEnv("VITE_DAEMON_URL", "http://localhost:9000");
    vi.stubEnv("VITE_DAEMON_TOKEN", "dev-token");
    expect(resolveDaemonConfig()).toEqual({
      baseUrl: "http://localhost:9000",
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
