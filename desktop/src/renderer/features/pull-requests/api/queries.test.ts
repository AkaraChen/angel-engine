import type { ApiClient } from "@/platform/api-client";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { pullRequestDetailQueryOptions } from "./queries";

describe("pullRequestDetailQueryOptions", () => {
  it.each([
    { projectPath: null, providerIdentity: null, supported: true },
    {
      projectPath: "/repo",
      providerIdentity: "github:github.com/acme/widgets:1",
      supported: false,
    },
  ])("makes no business request when the provider is inactive or unsupported", async (state) => {
    const getChangeRequest = vi.fn();
    const api = {
      sourceControl: { getChangeRequest },
    } as unknown as ApiClient;
    const queryClient = new QueryClient();
    const observer = new QueryObserver(
      queryClient,
      pullRequestDetailQueryOptions({
        ...state,
        api,
        number: 42,
      }),
    );
    const unsubscribe = observer.subscribe(() => undefined);

    await Promise.resolve();

    expect(getChangeRequest).not.toHaveBeenCalled();
    unsubscribe();
  });
});
