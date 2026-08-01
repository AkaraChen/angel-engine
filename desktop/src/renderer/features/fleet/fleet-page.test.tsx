// @vitest-environment jsdom

import type { Chat, ChatActivity } from "@angel-engine/daemon-api/chat";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { queryKeys } from "@/platform/query-keys";

import { FleetPage } from "./fleet-page";

const listActivity = vi.fn<() => Promise<{ items: ChatActivity[] }>>();
const readActivity =
  vi.fn<
    (
      chatId: string,
      input: { attentionId: string },
    ) => Promise<{
      read: boolean;
    }>
  >();

vi.mock("@/platform/api-client", () => ({
  getApiClient: () => ({
    activity: { list: listActivity, read: readActivity },
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function chat(id: string, title: string): Chat {
  return {
    archived: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    cwd: null,
    id,
    pinned: false,
    projectId: null,
    remoteThreadId: null,
    runtime: "claude",
    title,
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as Chat;
}

const DONE_ACTIVITY: ChatActivity = {
  attentionId: "run-1:done",
  chatId: "chat-1",
  runId: "run-1",
  status: "done",
  updatedAt: "2026-01-01T01:00:00.000Z",
};

function renderFleet(overrides: Partial<Parameters<typeof FleetPage>[0]> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onOpenChat = vi.fn();
  const onNewChat = vi.fn();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <FleetPage
        chats={[chat("chat-1", "Done chat")]}
        isMetadataError={false}
        isMetadataPending={false}
        onNewChat={onNewChat}
        onOpenChat={onOpenChat}
        projects={[]}
        {...overrides}
      />
    </QueryClientProvider>,
  );
  return { onNewChat, onOpenChat, queryClient, ...result };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("fleetPage", () => {
  it("acknowledges the terminal marker of the row it opens", async () => {
    listActivity.mockResolvedValue({ items: [DONE_ACTIVITY] });
    readActivity.mockResolvedValue({ read: true });
    const { onOpenChat, queryClient } = renderFleet();

    fireEvent.click(await screen.findByRole("button", { name: /Done chat/ }));

    expect(onOpenChat).toHaveBeenCalledWith(
      expect.objectContaining({ id: "chat-1" }),
    );
    await vi.waitFor(() => {
      expect(readActivity).toHaveBeenCalledWith("chat-1", {
        attentionId: "run-1:done",
      });
    });
    await vi.waitFor(() => {
      expect(
        queryClient.getQueryData<ChatActivity[]>(queryKeys.chatActivity.list()),
      ).toEqual([]);
    });
  });

  it("never acknowledges a run that is still going", async () => {
    listActivity.mockResolvedValue({
      items: [
        {
          chatId: "chat-2",
          runId: "run-2",
          status: "running",
          updatedAt: "2026-01-01T01:00:00.000Z",
        },
      ],
    });
    const { onOpenChat } = renderFleet({
      chats: [chat("chat-2", "Running chat")],
    });

    fireEvent.click(
      await screen.findByRole("button", { name: /Running chat/ }),
    );

    expect(onOpenChat).toHaveBeenCalledTimes(1);
    expect(readActivity).not.toHaveBeenCalled();
  });

  it("reports a chat metadata failure instead of an empty fleet", async () => {
    listActivity.mockResolvedValue({ items: [] });
    renderFleet({ chats: [], isMetadataError: true });

    expect(await screen.findByText("fleet.disconnected")).toBeDefined();
    expect(screen.queryByText("fleet.emptySegments.all")).toBeNull();
  });

  it("waits for chat metadata before calling the fleet empty", async () => {
    listActivity.mockResolvedValue({ items: [] });
    renderFleet({ chats: [], isMetadataPending: true });

    expect(
      await screen.findByRole("status", { name: "fleet.loading" }),
    ).toBeDefined();
    expect(screen.queryByText("fleet.emptySegments.all")).toBeNull();
  });

  it("offers a way out of the empty segment it landed on", async () => {
    listActivity.mockResolvedValue({ items: [] });
    const { onNewChat } = renderFleet({ chats: [] });

    expect(await screen.findByText("fleet.emptySegments.all")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "workspace.newChat" }));

    expect(onNewChat).toHaveBeenCalledTimes(1);
  });

  it("hides filter and search when the fleet has no rows", async () => {
    listActivity.mockResolvedValue({ items: [] });
    renderFleet({ chats: [] });

    expect(await screen.findByText("fleet.emptySegments.all")).toBeDefined();
    expect(
      screen.queryByRole("group", { name: "fleet.filterSegments" }),
    ).toBeNull();
    expect(
      screen.queryByRole("searchbox", { name: "fleet.search" }),
    ).toBeNull();
  });

  it("keeps filter and search when rows exist", async () => {
    listActivity.mockResolvedValue({ items: [DONE_ACTIVITY] });
    renderFleet();

    expect(
      await screen.findByRole("button", { name: /Done chat/ }),
    ).toBeDefined();
    expect(
      screen.getByRole("group", { name: "fleet.filterSegments" }),
    ).toBeDefined();
    expect(
      screen.getByRole("searchbox", { name: "fleet.search" }),
    ).toBeDefined();
  });

  it("narrows the list to the search query", async () => {
    listActivity.mockResolvedValue({
      items: [
        DONE_ACTIVITY,
        {
          attentionId: "run-2:done",
          chatId: "chat-2",
          runId: "run-2",
          status: "done",
          updatedAt: "2026-01-01T02:00:00.000Z",
        },
      ],
    });
    renderFleet({
      chats: [chat("chat-1", "Done chat"), chat("chat-2", "Other work")],
    });

    expect(
      await screen.findByRole("button", { name: /Done chat/ }),
    ).toBeDefined();

    fireEvent.change(screen.getByRole("searchbox", { name: "fleet.search" }), {
      target: { value: "other" },
    });

    expect(screen.queryByRole("button", { name: /Done chat/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Other work/ })).toBeDefined();
  });

  it("tells the user the search came up empty rather than the fleet", async () => {
    listActivity.mockResolvedValue({ items: [DONE_ACTIVITY] });
    renderFleet();

    expect(
      await screen.findByRole("button", { name: /Done chat/ }),
    ).toBeDefined();

    fireEvent.change(screen.getByRole("searchbox", { name: "fleet.search" }), {
      target: { value: "nothing matches this" },
    });

    expect(screen.getByText("fleet.noMatches")).toBeDefined();
    expect(screen.queryByText("fleet.emptySegments.all")).toBeNull();
  });
});
