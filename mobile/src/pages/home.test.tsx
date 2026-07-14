import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

import { AuthProvider } from "@/features/auth/auth-provider";
import { DaemonProvider } from "@/platform/daemon-provider";

import { HomePage } from "./home";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

function renderHome() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const { hook } = memoryLocation({ path: "/" });
  return render(
    <AuthProvider>
      <DaemonProvider>
        <QueryClientProvider client={queryClient}>
          <Router hook={hook}>
            <HomePage />
          </Router>
        </QueryClientProvider>
      </DaemonProvider>
    </AuthProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("homePage", () => {
  it("renders chat rows with project and worktree labels", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        const url = String(input);
        if (url.endsWith("/api/projects")) {
          return Promise.resolve(
            jsonResponse([{ id: "p1", path: "/Users/dev/angel-engine" }]),
          );
        }
        if (url.endsWith("/api/chats")) {
          return Promise.resolve(
            jsonResponse([
              {
                archived: false,
                createdAt: "2026-07-13T10:00:00Z",
                cwd: "/Users/dev/angel-engine-worktrees/feature-x",
                id: "c1",
                pinned: false,
                projectId: "p1",
                remoteThreadId: null,
                runtime: "claude",
                title: "Fix the login redirect",
                updatedAt: "2026-07-13T10:00:00Z",
              },
            ]),
          );
        }
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      }),
    );

    renderHome();

    expect(await screen.findByText("Fix the login redirect")).toBeDefined();
    expect(screen.getByText("angel-engine")).toBeDefined();
    expect(screen.getByText("feature-x")).toBeDefined();
    // "Claude Code" appears both as the runtime label and inside the brand
    // icon's <title>, so assert at least one match rather than exactly one.
    expect(screen.getAllByText("Claude Code").length).toBeGreaterThan(0);
  });

  it("shows the empty state when there are no chats", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        const url = String(input);
        if (url.endsWith("/api/projects"))
          return Promise.resolve(jsonResponse([]));
        if (url.endsWith("/api/chats"))
          return Promise.resolve(jsonResponse([]));
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      }),
    );

    renderHome();

    expect(await screen.findByText("No chats yet")).toBeDefined();
  });

  it("shows the error state when the daemon is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("no daemon"))),
    );

    renderHome();

    expect(await screen.findByText("Couldn't load chats")).toBeDefined();
  });
});
