import type { ApiClient } from "@/platform/api-client";
import {
  MutationObserver,
  QueryClient,
  QueryObserver,
} from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import {
  mergePullRequestMutationOptions,
  pullRequestStatusQueryOptions,
} from "./queries";

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
          ? "forge:code.example/acme/widgets:1"
          : null,
      }),
    );
    const unsubscribe = observer.subscribe(() => undefined);

    await Promise.resolve();

    expect(currentChangeRequest).not.toHaveBeenCalled();
    unsubscribe();
  });
});

describe("mergePullRequestMutationOptions", () => {
  it("uses the generic change-request merge route with activation projectPath", async () => {
    const mergeChangeRequest = vi.fn(async () => ({ state: "merged" }));
    const api = {
      sourceControl: { mergeChangeRequest },
    } as unknown as ApiClient;
    const queryClient = new QueryClient();
    const observer = new MutationObserver(
      queryClient,
      mergePullRequestMutationOptions({
        api,
        projectPath: "/repo",
        providerIdentity: "forge:code.example/acme/widgets:1",
        queryClient,
      }),
    );

    await observer.mutate({
      deleteSourceBranch: true,
      id: "42",
      method: "squash",
    });

    expect(mergeChangeRequest).toHaveBeenCalledWith("42", {
      deleteSourceBranch: true,
      method: "squash",
      projectPath: "/repo",
    });
  });
});
