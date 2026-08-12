import type { Chat, ChatLoadResult } from "@angel-engine/daemon-api/chat";
import type { ApiClient } from "@/platform/api-client";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { queryKeys } from "@/platform/query-keys";
import {
  archiveWorkspaceMutationOptions,
  chatLoadSuspenseQueryOptions,
  chatMetadataQueryOptions,
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

describe("chat query cache shapes", () => {
  it("keeps create-PR metadata lookup from poisoning chat restoration", async () => {
    const chat = {
      id: "chat-1",
      cwd: "/repo/worktree",
      title: "Fix renderer state",
    } as Chat;
    const loadResult = { chat, messages: [] } as ChatLoadResult;
    const get = vi.fn(async () => chat);
    const load = vi.fn(async () => loadResult);
    const api = { chats: { get, load } } as unknown as ApiClient;
    const queryClient = new QueryClient();

    await queryClient.fetchQuery(
      chatMetadataQueryOptions({ api, chatId: chat.id }),
    );
    const restored = await queryClient.fetchQuery(
      chatLoadSuspenseQueryOptions({ api, chatId: chat.id }),
    );

    expect(get).toHaveBeenCalledWith(chat.id);
    expect(load).toHaveBeenCalledWith(chat.id);
    expect(queryClient.getQueryData(queryKeys.chats.metadata(chat.id))).toBe(
      chat,
    );
    expect(restored.chat.cwd).toBe("/repo/worktree");
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
