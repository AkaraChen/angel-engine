// @vitest-environment jsdom

import type { Chat, ChatActivity } from "@angel-engine/daemon-api/chat";
import type { Project } from "@angel-engine/daemon-api/projects";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { queryKeys } from "@/platform/query-keys";

import { FleetPage } from "./fleet-page";
import { FLEET_VIEW_STORAGE_KEY } from "./fleet-model";

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

const localStorageValues = new Map<string, string>();
const localStorage: Storage = {
  clear: () => localStorageValues.clear(),
  getItem: (key) => localStorageValues.get(key) ?? null,
  key: (index) => [...localStorageValues.keys()][index] ?? null,
  get length() {
    return localStorageValues.size;
  },
  removeItem: (key) => {
    localStorageValues.delete(key);
  },
  setItem: (key, value) => {
    localStorageValues.set(key, value);
  },
};
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: localStorage,
});

function chat(id: string, title: string, overrides: Partial<Chat> = {}): Chat {
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
    ...overrides,
  } as Chat;
}

const PROJECT: Project = {
  createdAt: "2026-01-01T00:00:00.000Z",
  id: "project-1",
  name: "Angel",
  path: "/code/angel-engine",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as Project;

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

function expectContainedBoardScroller(element: HTMLElement): void {
  expect(element.className).toContain("overflow-x-auto");
  expect(element.className).toContain("pl-6");
  expect(element.className).not.toContain("min-w-[53rem]");
  expect(element.firstElementChild?.className).toContain("min-w-[53rem]");
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
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

    expect(await screen.findByText("fleet.disconnectedTitle")).toBeDefined();
    expect(screen.getByText("fleet.disconnectedDescription")).toBeDefined();
    expect(screen.getByTestId("fleet-retry")).toBeDefined();
    expect(screen.queryByText("fleet.emptySegments.all")).toBeNull();
  });

  it.each([
    { isMetadataError: false, text: "fleet.emptySegments.all" },
    {
      isMetadataError: true,
      text: "fleet.disconnectedTitle",
    },
  ])("keeps the board $text state at list width", async (state) => {
    window.localStorage.setItem(FLEET_VIEW_STORAGE_KEY, "board");
    listActivity.mockResolvedValue({ items: [] });
    renderFleet({
      chats: [],
      isMetadataError: state.isMetadataError,
    });

    expect(await screen.findByText(state.text)).toBeDefined();
    const page = screen.getByRole("heading", {
      name: "fleet.title",
    }).parentElement;
    expect(page?.className).toContain("max-w-4xl");
    expect(page?.className).not.toContain("max-w-[88rem]");
  });

  it("keeps pending and loaded board columns aligned inside their scroller", async () => {
    window.localStorage.setItem(FLEET_VIEW_STORAGE_KEY, "board");
    let resolveActivity:
      | ((result: { items: ChatActivity[] }) => void)
      | undefined;
    listActivity.mockImplementation(
      () =>
        new Promise<{ items: ChatActivity[] }>((resolve) => {
          resolveActivity = resolve;
        }),
    );
    renderFleet();

    const skeleton = await screen.findByRole("status", {
      name: "fleet.loading",
    });
    const page = screen.getByRole("heading", {
      name: "fleet.title",
    }).parentElement;
    expect(page?.className).toContain("max-w-[88rem]");
    expect(page?.className).not.toContain("max-w-4xl");
    expect(page?.className).toContain("w-full");
    expectContainedBoardScroller(skeleton);

    resolveActivity?.({ items: [DONE_ACTIVITY] });
    const board = await screen.findByRole("region", {
      name: "fleet.views.board",
    });

    expectContainedBoardScroller(board);
    expect(board.className).toBe(skeleton.className);
  });

  it("retries activity and metadata when the fleet is disconnected", async () => {
    listActivity
      .mockRejectedValueOnce(new Error("backend down"))
      .mockResolvedValueOnce({ items: [DONE_ACTIVITY] });
    const { queryClient } = renderFleet();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    expect(await screen.findByText("fleet.disconnectedTitle")).toBeDefined();
    fireEvent.click(screen.getByTestId("fleet-retry"));

    await vi.waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: queryKeys.chatActivity.all(),
        }),
      );
    });
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.chats.list() }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.projects.list() }),
    );
  });

  it("keeps trustworthy rows when activity disconnects after a successful load", async () => {
    listActivity
      .mockResolvedValueOnce({ items: [DONE_ACTIVITY] })
      .mockRejectedValue(new Error("backend down"));
    const { queryClient } = renderFleet();

    expect(
      await screen.findByRole("button", { name: /Done chat/ }),
    ).toBeDefined();

    await queryClient.invalidateQueries({
      queryKey: queryKeys.chatActivity.all(),
    });

    expect(await screen.findByText("fleet.disconnectedTitle")).toBeDefined();
    expect(screen.getByText("fleet.disconnectedStale")).toBeDefined();
    expect(screen.getByRole("button", { name: /Done chat/ })).toBeDefined();
    expect(screen.getByTestId("fleet-retry")).toBeDefined();
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

  it("switches to a three-column read-only board and preserves the list segment", async () => {
    listActivity.mockResolvedValue({
      items: [
        DONE_ACTIVITY,
        {
          attentionId: "run-2:waiting",
          chatId: "chat-2",
          reason: "question",
          runId: "run-2",
          status: "waiting_for_you",
          updatedAt: "2026-01-01T02:00:00.000Z",
        },
      ],
    });
    renderFleet({
      chats: [
        chat("chat-1", "Done chat"),
        chat("chat-2", "Needs you chat", { projectId: PROJECT.id }),
      ],
      projects: [PROJECT],
    });

    const listToggle = await screen.findByRole("button", {
      name: "fleet.views.list",
    });
    expect(listToggle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(
      screen.getByRole("button", { name: /fleet.segments.attention/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "fleet.views.board" }));

    expect(
      screen.queryByRole("group", { name: "fleet.filterSegments" }),
    ).toBeNull();
    const board = screen.getByRole("region", { name: "fleet.views.board" });
    const page = screen.getByRole("heading", {
      name: "fleet.title",
    }).parentElement;
    expect(page?.className).toContain("max-w-[88rem]");
    const searchGroup = screen
      .getByRole("searchbox", { name: "fleet.search" })
      .closest('[data-slot="input-group"]');
    expect(searchGroup?.className).toContain("max-w-xs");
    expectContainedBoardScroller(board);
    expect(within(board).getAllByRole("heading")).toHaveLength(3);
    expect(
      within(board).getByText("fleet.emptySegments.running"),
    ).toBeDefined();
    const doneCard = within(board).getByRole("button", { name: /Done chat/ });
    const needsYouCard = within(board).getByRole("button", {
      name: /Needs you chat/,
    });
    expect(doneCard.className).toContain("min-h-28");
    expect(doneCard.className).not.toContain("min-h-36");
    expect(doneCard.className).toContain("border-border-subtle");
    expect(doneCard.lastElementChild?.className).toContain("mt-auto");
    expect(doneCard.getAttribute("title")).toBe("Done chat");
    expect(doneCard.querySelectorAll("[title]")).toHaveLength(0);
    expect(
      doneCard.querySelector('[data-slot="fleet-card-location"]'),
    ).toBeNull();
    expect(
      needsYouCard.querySelector('[data-slot="fleet-card-location"]')
        ?.textContent,
    ).toBe("angel-engine");
    expect(doneCard.closest("section")?.className).toContain(
      "dark:border-border-subtle",
    );
    expect(window.localStorage.getItem(FLEET_VIEW_STORAGE_KEY)).toBe("board");

    fireEvent.click(listToggle);

    expect(
      screen
        .getByRole("button", { name: /fleet.segments.attention/ })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.queryByRole("button", { name: /Done chat/ })).toBeNull();
  });

  it("restores board preference and keeps cards keyboard-focusable in column order", async () => {
    window.localStorage.setItem(FLEET_VIEW_STORAGE_KEY, "board");
    listActivity.mockResolvedValue({
      items: [
        DONE_ACTIVITY,
        {
          chatId: "chat-2",
          runId: "run-2",
          status: "running",
          updatedAt: "2026-01-01T02:00:00.000Z",
        },
        {
          attentionId: "run-3:waiting",
          chatId: "chat-3",
          reason: "approval",
          runId: "run-3",
          status: "waiting_for_you",
          updatedAt: "2026-01-01T03:00:00.000Z",
        },
      ],
    });
    renderFleet({
      chats: [
        chat("chat-1", "Done chat"),
        chat("chat-2", "Running chat"),
        chat("chat-3", "Needs you chat"),
      ],
    });

    const board = await screen.findByRole("region", {
      name: "fleet.views.board",
    });
    const cards = within(board).getAllByRole("button");

    expect(cards.map((card) => card.textContent)).toEqual([
      expect.stringContaining("Needs you chat"),
      expect.stringContaining("Running chat"),
      expect.stringContaining("Done chat"),
    ]);
    expect(cards.every((card) => card.tabIndex === 0)).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "fleet.views.board" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
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
