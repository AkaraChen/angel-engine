import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

/**
 * Five chats: one per activity status plus one the daemon has no activity for.
 * The chat list is returned in reverse urgency order so the tests can prove the
 * Home ordering comes from the activity projection, not from the list order.
 */
function fleetChat(id: string, title: string) {
  return {
    archived: false,
    createdAt: "2026-07-25T00:00:00.000Z",
    cwd: null,
    id,
    pinned: false,
    projectId: null,
    remoteThreadId: null,
    runtime: "codex",
    title,
    updatedAt: "2026-07-25T01:00:00.000Z",
  };
}

async function fleetFetch(input: string): Promise<Response> {
  const url = String(input);
  if (url.endsWith("/api/projects")) return jsonResponse([]);
  if (url.endsWith("/api/chat-activity")) {
    return jsonResponse({
      items: [
        {
          attentionId: "run-4:done",
          chatId: "done",
          runId: "run-4",
          status: "done",
          updatedAt: "2026-07-25T01:03:00.000Z",
        },
        {
          chatId: "running",
          runId: "run-3",
          status: "running",
          updatedAt: "2026-07-25T01:02:00.000Z",
        },
        {
          attentionId: "run-2:failed",
          chatId: "failed",
          failure: { message: "the runtime exited" },
          reason: "runtime_error",
          runId: "run-2",
          status: "failed",
          updatedAt: "2026-07-25T01:01:00.000Z",
        },
        {
          attentionId: "run-1:input:elicitation-1",
          chatId: "waiting",
          reason: "approval",
          runId: "run-1",
          status: "waiting_for_you",
          updatedAt: "2026-07-25T01:00:00.000Z",
        },
      ],
    });
  }
  if (url.endsWith("/api/chats")) {
    return jsonResponse([
      fleetChat("idle", "Idle chat"),
      fleetChat("done", "Done chat"),
      fleetChat("running", "Running chat"),
      fleetChat("failed", "Failed chat"),
      fleetChat("waiting", "Waiting chat"),
    ]);
  }
  return Promise.reject(new Error(`unexpected fetch: ${url}`));
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

  it("shows daemon-owned five-state badges and orders them by urgency", async () => {
    vi.stubGlobal("fetch", vi.fn(fleetFetch));

    renderHome();

    expect(await screen.findByLabelText("Waiting for you")).toBeDefined();
    expect(screen.getByLabelText("Failed")).toBeDefined();
    expect(screen.getByLabelText("Running")).toBeDefined();
    expect(screen.getByLabelText("Done")).toBeDefined();

    const rows = screen.getAllByRole("link").map((link) => link.textContent);
    expect(rows).toHaveLength(5);
    for (const [index, title] of [
      "Waiting chat",
      "Failed chat",
      "Running chat",
      "Done chat",
      "Idle chat",
    ].entries()) {
      expect(rows[index]).toContain(title);
    }
  });

  it("filters the list down to the chats that need the user", async () => {
    vi.stubGlobal("fetch", vi.fn(fleetFetch));

    renderHome();

    fireEvent.click(
      await screen.findByRole("button", { name: /Needs you\s*2/ }),
    );

    expect(screen.getByText("Waiting chat")).toBeDefined();
    expect(screen.getByText("Failed chat")).toBeDefined();
    expect(screen.queryByText("Running chat")).toBeNull();
    expect(screen.queryByText("Idle chat")).toBeNull();
  });

  it("counts every segment on its own chip", async () => {
    vi.stubGlobal("fetch", vi.fn(fleetFetch));

    renderHome();

    expect(
      await screen.findByRole("button", { name: /All\s*5/ }),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: /Running\s*1/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /Done\s*1/ })).toBeDefined();
  });

  it("says the activity projection is unavailable instead of showing 0s", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        const url = String(input);
        if (url.endsWith("/api/chat-activity")) {
          return Promise.reject(new Error("activity is down"));
        }
        return fleetFetch(url);
      }),
    );

    renderHome();

    expect(await screen.findByText("Couldn't load activity")).toBeDefined();
    // Counts and badges would all read 0/absent without the projection, which is
    // indistinguishable from an idle fleet — the chips stay away entirely.
    expect(screen.queryByRole("button", { name: /Needs you/ })).toBeNull();
    expect(screen.getByText("Waiting chat")).toBeDefined();
  });

  it("shows the failure message of a failed run on its row", async () => {
    vi.stubGlobal("fetch", vi.fn(fleetFetch));

    renderHome();

    expect(await screen.findByText("the runtime exited")).toBeDefined();
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
