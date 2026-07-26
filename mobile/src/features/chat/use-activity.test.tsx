import type { PropsWithChildren } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/features/auth/auth-provider";
import { DaemonProvider } from "@/platform/daemon-provider";
import { queryKeys } from "@/platform/query-keys";

import { useReadTerminalActivity } from "./use-activity";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

const FAILED_ACTIVITY = {
  attentionId: "run-1:failed",
  chatId: "c1",
  failure: { message: "the runtime exited" },
  reason: "runtime_error",
  runId: "run-1",
  status: "failed",
  updatedAt: "2026-07-25T01:00:00.000Z",
};

/** Records every ack the hook sends so a test can assert on their absence. */
function stubDaemon(items: unknown[] = [FAILED_ACTIVITY]) {
  const reads: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/chat-activity")) {
        return jsonResponse({ items });
      }
      if (url.endsWith("/attention/read")) {
        reads.push(typeof init?.body === "string" ? init.body : "");
        return jsonResponse({ read: true });
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }),
  );
  return reads;
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <AuthProvider>
      <DaemonProvider>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </DaemonProvider>
    </AuthProvider>
  );
  return { queryClient, wrapper };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useReadTerminalActivity", () => {
  it("keeps the marker while the chat itself has not loaded", async () => {
    const reads = stubDaemon();
    const { wrapper } = createWrapper();

    const { result } = renderHook(
      () => useReadTerminalActivity("c1", { enabled: false }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.failureMessage).toBe("the runtime exited");
    });
    expect(reads).toEqual([]);
  });

  it("acknowledges once the chat is open and keeps the reason on screen", async () => {
    const reads = stubDaemon();
    const { wrapper } = createWrapper();

    const { result } = renderHook(
      () => useReadTerminalActivity("c1", { enabled: true }),
      { wrapper },
    );

    await waitFor(() => {
      expect(reads).toEqual([JSON.stringify({ attentionId: "run-1:failed" })]);
    });
    // The projection drops the row on ack; the reason must survive it.
    expect(result.current.failureMessage).toBe("the runtime exited");
  });

  it("drops the reason once a newer run reports in", async () => {
    stubDaemon();
    const { queryClient, wrapper } = createWrapper();

    const { result } = renderHook(
      () => useReadTerminalActivity("c1", { enabled: true }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.failureMessage).toBe("the runtime exited");
    });

    // The user retried from the chat and the new run is under way: "the last
    // run failed" is no longer true and must not stay on screen.
    act(() => {
      queryClient.setQueryData(queryKeys.activity.list, [
        {
          chatId: "c1",
          runId: "run-2",
          status: "running",
          updatedAt: "2026-07-25T01:05:00.000Z",
        },
      ]);
    });

    await waitFor(() => {
      expect(result.current.failureMessage).toBeUndefined();
    });
  });

  it("drops the reason when the retry finishes successfully", async () => {
    stubDaemon();
    const { queryClient, wrapper } = createWrapper();

    const { result } = renderHook(
      () => useReadTerminalActivity("c1", { enabled: true }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.failureMessage).toBe("the runtime exited");
    });

    act(() => {
      queryClient.setQueryData(queryKeys.activity.list, [
        {
          attentionId: "run-2:done",
          chatId: "c1",
          runId: "run-2",
          status: "done",
          updatedAt: "2026-07-25T01:06:00.000Z",
        },
      ]);
    });

    await waitFor(() => {
      expect(result.current.failureMessage).toBeUndefined();
    });
  });
});
