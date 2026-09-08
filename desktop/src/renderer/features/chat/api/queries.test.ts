import type { Chat, ChatLoadResult } from "@angel-engine/daemon-api/chat";
import type { ApiClient } from "@/platform/api-client";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { queryKeys } from "@/platform/query-keys";
import {
  chatLoadSuspenseQueryOptions,
  chatMetadataQueryOptions,
} from "./queries";

describe("chat query cache shapes", () => {
  it("keeps chat metadata lookup from poisoning chat restoration", async () => {
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
