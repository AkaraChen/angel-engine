import type { ApiClient } from "@/platform/api-client";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { archiveWorkspaceMutationOptions } from "./queries";

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
