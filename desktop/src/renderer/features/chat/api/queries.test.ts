import type { ApiClient } from "@/platform/api-client";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import {
  archiveWorkspaceMutationOptions,
  sourceControlLinkResolveQueryOptions,
} from "./queries";

describe("sourceControlLinkResolveQueryOptions", () => {
  it.each([
    { projectPath: null, providerIdentity: null },
    { projectPath: "/repo", providerIdentity: null },
  ])("makes no request without active provider identity", async (context) => {
    const resolveLink = vi.fn();
    const queryClient = new QueryClient();
    const observer = new QueryObserver(
      queryClient,
      sourceControlLinkResolveQueryOptions({
        api: { sourceControl: { resolveLink } } as unknown as ApiClient,
        projectPath: context.projectPath,
        providerIdentity: context.providerIdentity,
        url: "https://gitlab.example.com/group/repo/-/merge_requests/1",
      }),
    );
    const unsubscribe = observer.subscribe(() => undefined);

    await Promise.resolve();

    expect(resolveLink).not.toHaveBeenCalled();
    unsubscribe();
  });
});

describe("archiveWorkspaceMutationOptions", () => {
  it.each([
    "chat-from-sidebar",
    "chat-from-tool-window",
  ])("archives by chat id without requiring cached chat data: %s", async (chatId) => {
    const archiveWorkspace = vi.fn(async () => ({
      chat: { id: chatId },
      removedWorktree: true,
    }));
    const api = {
      chats: { archiveWorkspace },
    } as unknown as ApiClient;
    const options = archiveWorkspaceMutationOptions({
      api,
      queryClient: new QueryClient(),
    });

    await options.mutationFn?.(chatId, {} as never);

    expect(archiveWorkspace).toHaveBeenCalledWith(chatId);
  });
});
