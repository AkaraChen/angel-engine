import type { GitHubPullRequestStatus } from "@angel-engine/daemon-api/github";
import type { ApiClient } from "@/platform/api-client";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import {
  pullRequestStatusQueryOptions,
  retryUnknownMergeability,
} from "./queries";

const status = (mergeable: GitHubPullRequestStatus["mergeable"]) =>
  ({ mergeable }) as GitHubPullRequestStatus;

describe("retryUnknownMergeability", () => {
  it.each([
    {
      expectedCalls: 1,
      expectedPauses: 0,
      sequence: ["MERGEABLE"],
    },
    {
      expectedCalls: 2,
      expectedPauses: 1,
      sequence: ["UNKNOWN", "MERGEABLE"],
    },
    {
      expectedCalls: 4,
      expectedPauses: 3,
      sequence: ["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "MERGEABLE"],
    },
  ] as const)("fetches $expectedCalls time(s) for $sequence", async ({
    expectedCalls,
    expectedPauses,
    sequence,
  }) => {
    let index = 0;
    const fetchStatus = vi.fn(async () =>
      status(sequence[Math.min(index++, sequence.length - 1)]!),
    );
    const pause = vi.fn(async () => undefined);

    const result = await retryUnknownMergeability(fetchStatus, pause);

    expect(fetchStatus).toHaveBeenCalledTimes(expectedCalls);
    expect(pause).toHaveBeenCalledTimes(expectedPauses);
    if (expectedPauses > 0) expect(pause).toHaveBeenCalledWith(2_000);
    expect(result.mergeable).toBe(sequence[expectedCalls - 1]);
  });
});

describe("pullRequestStatusQueryOptions", () => {
  it.each([
    { active: false, supportsList: true, supportsStatus: true },
    { active: true, supportsList: false, supportsStatus: true },
    { active: true, supportsList: true, supportsStatus: false },
  ])("makes no business request when activation cannot serve the query", async (state) => {
    const currentChangeRequest = vi.fn();
    const api = {
      sourceControl: { currentChangeRequest },
    } as unknown as ApiClient;
    const queryClient = new QueryClient();
    const observer = new QueryObserver(
      queryClient,
      pullRequestStatusQueryOptions({
        ...state,
        api,
        projectPath: state.active ? "/repo" : null,
        providerIdentity: state.active
          ? "github:github.com/acme/widgets:1"
          : null,
      }),
    );
    const unsubscribe = observer.subscribe(() => undefined);

    await Promise.resolve();

    expect(currentChangeRequest).not.toHaveBeenCalled();
    unsubscribe();
  });
});
