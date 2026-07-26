import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

import { AuthProvider } from "@/features/auth/auth-provider";
import i18n from "@/i18n";
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

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await i18n.changeLanguage("en");
});

describe("home timestamps", () => {
  it("shows the activity time a row is ordered by, not the chat's own", async () => {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        const url = String(input);
        if (url.endsWith("/api/projects")) return jsonResponse([]);
        if (url.endsWith("/api/chat-activity")) {
          return jsonResponse({
            items: [
              {
                chatId: "c1",
                runId: "run-1",
                status: "running",
                updatedAt: twoMinutesAgo,
              },
            ],
          });
        }
        if (url.endsWith("/api/chats")) {
          return jsonResponse([
            {
              archived: false,
              createdAt: "2026-01-01T00:00:00.000Z",
              cwd: null,
              id: "c1",
              pinned: false,
              projectId: null,
              remoteThreadId: null,
              runtime: "claude",
              title: "Long-lived chat",
              // Months old: sorting floats this row to the top on the new run,
              // so showing the chat's own time would read "6 months ago".
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ]);
        }
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      }),
    );

    renderHome();

    await screen.findByText("Long-lived chat");
    expect(await screen.findByText(/minutes ago/)).toBeDefined();
    expect(screen.queryByText(/months ago/)).toBeNull();
  });

  it("renders relative timestamps in the active (non-English) language", async () => {
    await i18n.changeLanguage("zh-CN");

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        const url = String(input);
        if (url.endsWith("/api/projects"))
          return Promise.resolve(jsonResponse([]));
        if (url.endsWith("/api/chats")) {
          return Promise.resolve(
            jsonResponse([
              {
                archived: false,
                createdAt: twoHoursAgo,
                cwd: null,
                id: "c1",
                pinned: false,
                projectId: null,
                remoteThreadId: null,
                runtime: "claude",
                title: "本地化测试",
                updatedAt: twoHoursAgo,
              },
            ]),
          );
        }
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      }),
    );

    renderHome();

    await screen.findByText("本地化测试");
    // date-fns zh-CN renders "…小时前"; English would be "…hours ago". The
    // presence of the Chinese "小时" (hour) proves the active locale is applied.
    expect(await screen.findByText(/小时/)).toBeDefined();
  });
});
