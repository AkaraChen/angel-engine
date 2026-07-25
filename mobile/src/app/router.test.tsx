import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";

beforeEach(() => {
  // The daemon isn't reachable in tests; fail fast so the shell still renders.
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no daemon")));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = "";
});

describe("app routing", () => {
  it("renders the Home chat list at the root route", async () => {
    window.location.hash = "#/";
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Chats" })).toBeDefined();
  });

  it("renders the Settings page at /settings", async () => {
    window.location.hash = "#/settings";
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: "Settings" }),
    ).toBeDefined();
  });

  it("renders the Chat page with a title fallback when the daemon is down", async () => {
    window.location.hash = "#/chat/abc123";
    render(<App />);
    // The header shows the conversation title, not the raw id; with no daemon it
    // falls back to a generic "Chat".
    expect(await screen.findByRole("heading", { name: "Chat" })).toBeDefined();
  });
});
