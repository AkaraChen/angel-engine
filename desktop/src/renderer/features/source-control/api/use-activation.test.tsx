// @vitest-environment jsdom

import type { SourceControlActivationResult } from "@angel-engine/daemon-api/source-control";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useSourceControlActivation } from "./use-activation";

const mocks = vi.hoisted(() => ({
  activation:
    vi.fn<(projectId: string) => Promise<SourceControlActivationResult>>(),
}));

vi.mock("@/platform/use-api", () => ({
  useApi: () => ({ sourceControl: { activation: mocks.activation } }),
}));

describe("useSourceControlActivation", () => {
  it.each([
    {
      projectPath: "/work/ambiguous",
      status: "ambiguous" as const,
      candidates: [],
    },
    {
      projectPath: "/work/unresolved",
      status: "unresolved" as const,
      reason: "no-match" as const,
    },
  ])("returns $status as data instead of throwing", async (response) => {
    mocks.activation.mockResolvedValueOnce(response);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () => useSourceControlActivation("project-1"),
      { wrapper },
    );

    await waitFor(() => expect(result.current.status).toBe(response.status));
    expect(result.current.error).toBeNull();
    expect(result.current.projectPath).toBe(response.projectPath);
    expect(result.current.providerIdentity).toBeNull();
    expect(mocks.activation).toHaveBeenCalledWith("project-1");
  });
});
