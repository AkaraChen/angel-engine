import type { PropsWithChildren } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/features/auth/auth-provider";
import { DaemonProvider } from "@/platform/daemon-provider";

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
function stubDaemon() {
  const reads: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/chat-activity")) {
        return jsonResponse({ items: [FAILED_ACTIVITY] });
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

function wrapper({ children }: PropsWithChildren) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <AuthProvider>
      <DaemonProvider>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </DaemonProvider>
    </AuthProvider>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useReadTerminalActivity", () => {
  it("keeps the marker while the chat itself has not loaded", async () => {
    const reads = stubDaemon();

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
});
