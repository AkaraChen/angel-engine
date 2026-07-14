import type { PropsWithChildren } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/features/auth/auth-provider";
import { DaemonProvider } from "@/platform/daemon-provider";

import { useChatWorkspaceRoot, useWorkspaceGitStatus } from "./use-workspace";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function wrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <DaemonProvider>{children}</DaemonProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useChatWorkspaceRoot", () => {
  it("resolves the chat cwd as the workspace root", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ id: "c1", title: "c1", cwd: "/repo/app" }),
        ),
    );
    const { result } = renderHook(() => useChatWorkspaceRoot("c1"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.root).toBe("/repo/app"));
  });

  it("returns null when the chat has no cwd", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ id: "c1", title: "c1", cwd: null })),
    );
    const { result } = renderHook(() => useChatWorkspaceRoot("c1"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.root).toBeNull();
  });
});

describe("useWorkspaceGitStatus", () => {
  it("does not fetch while the panel is closed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(
      () => useWorkspaceGitStatus("/repo/app", false),
      { wrapper },
    );
    // Disabled query stays pending and never contacts the daemon.
    expect(result.current.fetchStatus).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches git status once opened with a root", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("/api/workspace/git-diff?root=%2Frepo%2Fapp");
      return jsonResponse({
        branch: "main",
        isGitRepository: true,
        root: "/repo/app",
        stagedPatch: "",
        unstagedPatch: "",
        status: [
          { path: "a.ts", staged: true, status: "modified", unstaged: false },
        ],
        warnings: [],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(
      () => useWorkspaceGitStatus("/repo/app", true),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data?.branch).toBe("main"));
    expect(result.current.data?.status).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces the error state when the daemon is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response("nope", { status: 500, headers: {} })),
    );
    const { result } = renderHook(
      () => useWorkspaceGitStatus("/repo/app", true),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
